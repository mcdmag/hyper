// Native
import {execFileSync} from 'child_process';
import os from 'os';
import path from 'path';

// Packages
import test from 'ava';
import fs from 'fs-extra';
import {_electron} from 'playwright';
import type {ElectronApplication} from 'playwright';

import type {configOptions} from '../typings/config';
import type {HyperState} from '../typings/hyper';
import type {AttemptId, NliDisplayState, SessionUid} from '../typings/nli';

let app: ElectronApplication;
let isolatedRoot = '';
let markerPath = '';
const runtimeDiagnostics: string[] = [];

const waitUntil = async (predicate: () => Promise<boolean>, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for packaged E2E condition');
};

interface RendererTestWindow extends Window {
  __HYPER_NLI_E2E_OUTPUT__?: string;
  readonly config: {getConfig(): configOptions};
  readonly store: {
    dispatch(action: {type: string; config?: configOptions}): void;
    getState(): HyperState;
  };
}

const activeSessionUid = async () => {
  const page = await app.firstWindow();
  return page.evaluate(
    () => (window as unknown as RendererTestWindow).store.getState().sessions.activeUid as SessionUid
  );
};

const submitToOriginalSession = async (line: string) => {
  const page = await app.firstWindow();
  const sessionUid = await activeSessionUid();
  await page.evaluate(
    ({uid, data}) => (window as unknown as RendererTestWindow).rpc.emit('data', {uid, data: `${data}\r`}),
    {uid: sessionUid, data: line}
  );
  return sessionUid;
};

const emitNliState = async (state: NliDisplayState) =>
  app.evaluate(({BrowserWindow}, display) => BrowserWindow.getFocusedWindow()?.rpc.emit('nli state', display), state);

const waitForMarker = async (text: string) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if ((await fs.readFile(markerPath, 'utf8').catch(() => '')).includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for original-PTY marker: ${text}`);
};

test.before(async () => {
  let pathToBinary;

  switch (process.platform) {
    case 'linux':
      pathToBinary = path.join(__dirname, '../dist/linux-unpacked/hyper');
      break;

    case 'darwin':
      pathToBinary = path.join(__dirname, '../dist/mac/Hyper.app/Contents/MacOS/Hyper');
      break;

    case 'win32':
      pathToBinary = path.join(__dirname, '../dist/win-unpacked/Hyper.exe');
      break;

    default:
      throw new Error('Path to the built binary needs to be defined for this platform in test/index.js');
  }

  const pwsh = execFileSync('where.exe', ['pwsh.exe'], {encoding: 'utf8'}).split(/\r?\n/).find(Boolean);
  if (!pwsh) throw new Error('PowerShell 7 is required for packaged NLI E2E tests');
  isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-nli-e2e-'));
  markerPath = path.join(isolatedRoot, 'original-pty-markers.txt');
  const appData = path.join(isolatedRoot, 'appdata');
  const localAppData = path.join(isolatedRoot, 'localappdata');
  const userProfile = path.join(isolatedRoot, 'profile');
  const temp = path.join(isolatedRoot, 'temp');
  const chromiumUserData = path.join(isolatedRoot, 'chromium-user-data');
  const hyperConfigDirectory = chromiumUserData;
  await Promise.all([
    fs.ensureDir(localAppData),
    fs.ensureDir(userProfile),
    fs.ensureDir(temp),
    fs.ensureDir(chromiumUserData)
  ]);
  await fs.writeJson(path.join(hyperConfigDirectory, 'hyper.json'), {
    config: {
      shell: pwsh,
      shellArgs: ['-NoLogo', '-NoProfile'],
      disableAutoUpdates: true,
      naturalLanguageInterface: {
        enabled: true,
        codexExecutable: 'codex',
        requestTimeoutMs: 10000,
        maxInputChars: 4096,
        maxOptions: 3,
        includeWorkingDirectory: false,
        includeGitMetadata: false
      }
    },
    plugins: [],
    localPlugins: [],
    keymaps: {}
  });

  app = await _electron.launch({
    executablePath: pathToBinary,
    args: [`--user-data-dir=${chromiumUserData}`],
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      USERPROFILE: userProfile,
      TEMP: temp,
      TMP: temp,
      HYPER_NLI_E2E_FIXTURE: path.join(__dirname, 'fixtures', 'nli', 'fake-provider-e2e.jsonl'),
      HYPER_NLI_E2E_MARKER: markerPath,
      HYPER_SKIP_DEV_EXTENSIONS: '1'
    }
  });
  app.process().stdout?.on('data', (data) => runtimeDiagnostics.push(`stdout: ${String(data)}`));
  app.process().stderr?.on('data', (data) => runtimeDiagnostics.push(`stderr: ${String(data)}`));
  app.on('close', () => runtimeDiagnostics.push('electron-application: close'));
  const firstWindow = await app.firstWindow();
  firstWindow.on('close', () => runtimeDiagnostics.push('renderer: close'));
  firstWindow.on('crash', () => runtimeDiagnostics.push('renderer: crash'));
  firstWindow.on('pageerror', (error) => runtimeDiagnostics.push(`renderer pageerror: ${String(error)}`));
  await waitUntil(() =>
    firstWindow.evaluate(() => Boolean((window as unknown as RendererTestWindow).store.getState().sessions.activeUid))
  );
  await firstWindow.evaluate(() => {
    const renderer = window as unknown as RendererTestWindow;
    renderer.__HYPER_NLI_E2E_OUTPUT__ = '';
    renderer.rpc.on('session data', (value: string) => {
      renderer.__HYPER_NLI_E2E_OUTPUT__ = `${renderer.__HYPER_NLI_E2E_OUTPUT__ || ''}${value.slice(36)}`.slice(
        -64 * 1024
      );
    });
  });
  await submitToOriginalSession(
    "Add-Content -LiteralPath $env:HYPER_NLI_E2E_MARKER -Value 'HYPER_NLI_READY'; Write-Output '__HYPER_NLI_READY_OUTPUT__'"
  );
  await waitForMarker('HYPER_NLI_READY');
  await waitUntil(() =>
    firstWindow.evaluate(
      () =>
        ((window as unknown as RendererTestWindow).__HYPER_NLI_E2E_OUTPUT__?.match(/__HYPER_NLI_READY_OUTPUT__/g) || [])
          .length >= 2
    )
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
});

test.after.always(async () => {
  try {
    const image = await app
      .evaluate(({BrowserWindow}) =>
        BrowserWindow.getFocusedWindow()
          ?.capturePage()
          .then((captured) => captured.toPNG().toString('base64'))
      )
      .catch(() => undefined);
    if (image) await fs.writeFile(`dist/tmp/${process.platform}_test.png`, Buffer.from(image, 'base64'));
  } finally {
    await app?.evaluate(({app: electronApp}) => electronApp.exit(0)).catch(() => undefined);
    await app?.close().catch(() => undefined);
    if (isolatedRoot && path.basename(isolatedRoot).startsWith('hyper-nli-e2e-')) {
      await fs.remove(isolatedRoot);
    }
  }
});

test.serial('see if dev tools are open', async (t) => {
  t.false(await app.evaluate(({webContents}) => !!webContents.getFocusedWebContents()?.isDevToolsOpened()));
});

test.serial('disabled setup is always available and Enter cannot execute from the heading', async (t) => {
  const page = await app.firstWindow();
  await page.evaluate(() => {
    const renderer = window as unknown as RendererTestWindow;
    const config = renderer.config.getConfig();
    renderer.store.dispatch({
      type: 'CONFIG_RELOAD',
      config: {...config, naturalLanguageInterface: {...config.naturalLanguageInterface, enabled: false}}
    });
  });
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getFocusedWindow()?.rpc.emit('nli setup req'));

  const panel = page.getByRole('dialog', {name: 'Turn on shell-first suggestions'});
  await panel.waitFor();
  t.true(await panel.getByText('Hyper tries every entry in your terminal first.').isVisible());
  t.true(await panel.getByText("codexExecutable: 'codex'", {exact: false}).isVisible());
  t.is(await page.evaluate(() => document.activeElement?.textContent), 'Turn on shell-first suggestions');

  await page.keyboard.press('Enter');
  t.true(await panel.isVisible());
  await page.keyboard.press('Escape');
  t.false(await panel.isVisible());
  t.true(await page.evaluate(() => document.activeElement?.classList.contains('xterm-helper-textarea') === true));
  await page.evaluate(() => {
    const renderer = window as unknown as RendererTestWindow;
    const config = renderer.config.getConfig();
    renderer.store.dispatch({
      type: 'CONFIG_RELOAD',
      config: {...config, naturalLanguageInterface: {...config.naturalLanguageInterface, enabled: true}}
    });
  });
});

test.serial('default cmd.exe session receives explicit PowerShell guidance', async (t) => {
  const page = await app.firstWindow();
  const sessionUid = await page.evaluate(
    () => (window as unknown as RendererTestWindow).store.getState().sessions.activeUid as SessionUid
  );
  const state: NliDisplayState = {
    status: 'unsupported',
    sessionUid,
    message:
      'For the default cmd.exe profile, Hyper will not inspect its output or guess from exit codes. Start a new interactive PowerShell 5.1 or PowerShell 7 session.'
  };
  await app.evaluate(
    ({BrowserWindow}, display) => BrowserWindow.getFocusedWindow()?.rpc.emit('nli state', display),
    state
  );

  const panel = page.getByRole('dialog', {name: 'PowerShell is required for automatic fallback'});
  await panel.waitFor();
  t.regex((await panel.textContent()) || '', /cmd\.exe/i);
  t.regex((await panel.textContent()) || '', /will not inspect its output or guess from exit codes/i);
  await page.keyboard.press('Escape');
});

test.serial(
  'real shell-first flow covers privacy, fixture auth, alternatives, exact execution, and focus',
  async (t) => {
    const page = await app.firstWindow();
    await page.setViewportSize({width: 900, height: 720});
    await submitToOriginalSession('commit the changes and create a pr');

    const consent = page.getByRole('dialog', {name: 'Choose what Codex may receive'});
    await consent.waitFor({timeout: 15_000}).catch(async (error) => {
      const [terminal, rendererConfig, sessions] = await Promise.all([
        page
          .evaluate(() => document.querySelector('.xterm-rows')?.textContent || document.body?.textContent || '')
          .catch((reason) => `renderer unavailable: ${String(reason)}`),
        page
          .evaluate(() => (window as unknown as RendererTestWindow).config.getConfig().naturalLanguageInterface)
          .catch((reason) => ({diagnostic: `renderer unavailable: ${String(reason)}`})),
        app
          .evaluate(({BrowserWindow}) =>
            [...(BrowserWindow.getFocusedWindow()?.sessions || new Map()).values()].map((session) => ({
              shell: session.shell,
              pid: session.pty?.pid
            }))
          )
          .catch((reason) => [{diagnostic: `main unavailable: ${String(reason)}`}])
      ]);
      throw new Error(
        `${String(error)}\nNLI E2E diagnostics: ${JSON.stringify(
          {terminal, rendererConfig, sessions, runtimeDiagnostics},
          null,
          2
        )}`
      );
    });
    t.true(runtimeDiagnostics.some((entry) => entry.includes('HYPER_NLI_E2E_SEMANTIC')));
    await consent.getByRole('button', {name: 'Accept and sign in with ChatGPT'}).click();

    const review = page.getByRole('dialog', {name: 'Review before sending to PowerShell'});
    await review.waitFor({timeout: 15_000}).catch(async (error) => {
      const body = await page.evaluate(() => document.body?.textContent || '').catch(() => 'renderer unavailable');
      throw new Error(
        `${String(error)}\nPost-login diagnostics: ${JSON.stringify({body, runtimeDiagnostics}, null, 2)}`
      );
    });
    t.is(await review.getByRole('radio').count(), 2);
    await review.getByRole('radio', {name: /Secondary marker/}).check();
    await review.getByRole('button', {name: 'Approve and send once'}).click();
    await waitForMarker('HYPER_NLI_EXECUTED_SECONDARY');
    await page.getByRole('dialog', {name: 'The approved command was written once'}).waitFor();
    t.true(await page.evaluate(() => document.activeElement?.classList.contains('xterm-helper-textarea') === true));
    await page.screenshot({path: path.join('dist', 'tmp', 'nli-e2e-sent.png')});
    await page.keyboard.press('Escape');
  }
);

test.serial('clarification and edit both require a fresh bounded review', async (t) => {
  const page = await app.firstWindow();
  await submitToOriginalSession('clarify the deployment target');
  const clarification = page.getByRole('dialog', {name: 'Which deterministic target should be used?'});
  await clarification.waitFor();
  await clarification.getByRole('radio', {name: 'upstream'}).check();
  await clarification.getByRole('button', {name: 'Continue'}).click();
  const clarifiedReview = page.getByRole('dialog', {name: 'Review before sending to PowerShell'});
  await clarifiedReview.waitFor();
  await clarifiedReview.getByRole('button', {name: 'Approve and send once'}).click();
  await waitForMarker('HYPER_NLI_CLARIFIED');
  await page.keyboard.press('Escape');

  await submitToOriginalSession('edit the proposed command');
  const editReview = page.getByRole('dialog', {name: 'Review before sending to PowerShell'});
  await editReview.waitFor();
  await editReview.getByRole('button', {name: 'Edit'}).click();
  await editReview
    .getByLabel('Exact command to send')
    .fill(
      "Add-Content -LiteralPath $env:HYPER_NLI_E2E_MARKER -Value 'HYPER_NLI_EDITED'; Write-Output 'HYPER_NLI_EDITED'"
    );
  await editReview.getByRole('button', {name: 'Save edit for fresh review'}).click();
  await editReview.getByText('HYPER_NLI_EDITED', {exact: false}).first().waitFor();
  await editReview.getByRole('button', {name: 'Approve and send once'}).click();
  await waitForMarker('HYPER_NLI_EDITED');
  await page.keyboard.press('Escape');
  t.pass();
});

test.serial('high risk, cancellation, offline retry, and malformed output all fail closed', async (t) => {
  const page = await app.firstWindow();
  await submitToOriginalSession('show a high risk choice');
  const risk = page.getByRole('dialog', {name: 'Review before sending to PowerShell'});
  await risk.waitFor();
  await risk.getByRole('button', {name: 'Review high-risk command'}).click();
  const confirmation = risk.getByLabel('I reviewed the exact command and target');
  await confirmation.waitFor();
  t.true(await risk.getByRole('button', {name: 'Confirm and send once'}).isDisabled());
  await confirmation.check();
  t.false(await risk.getByRole('button', {name: 'Confirm and send once'}).isDisabled());
  await risk.getByRole('button', {name: 'Reject'}).click();
  await page.keyboard.press('Escape');

  await submitToOriginalSession('cancel the slow interpretation');
  const interpreting = page.getByRole('dialog', {name: 'Finding safe command options'});
  await interpreting.waitFor();
  await interpreting.getByRole('button', {name: 'Cancel interpretation'}).click();
  await page.getByRole('dialog', {name: 'Assistance was cancelled'}).waitFor();
  await page.keyboard.press('Escape');

  await submitToOriginalSession('retry after offline');
  const offline = page.getByRole('dialog', {name: 'No suggestion was created'});
  await offline.waitFor();
  await offline.getByRole('button', {name: 'Try again'}).click();
  const retryReview = page.getByRole('dialog', {name: 'Review before sending to PowerShell'});
  await retryReview.waitFor();
  t.true(await retryReview.getByText('The explicit retry produced a fresh option.').isVisible());
  await retryReview.getByRole('button', {name: 'Reject'}).click();
  await page.keyboard.press('Escape');

  await submitToOriginalSession('return malformed provider output');
  await page.getByRole('dialog', {name: 'Codex returned an invalid command plan'}).waitFor();
  t.false((await page.locator('body').textContent())?.includes('unexpected') === true);
  await page.keyboard.press('Escape');
});

test.serial(
  'cwd changes make approval stale and consumed-write failure states have explicit visual proof',
  async (t) => {
    const page = await app.firstWindow();
    const sessionUid = await submitToOriginalSession('make this approval stale');
    const review = page.getByRole('dialog', {name: 'Review before sending to PowerShell'});
    await review.waitFor();
    await submitToOriginalSession('Set-Location -LiteralPath $env:TEMP');
    await page
      .getByRole('dialog', {name: 'The terminal context changed'})
      .waitFor({timeout: 15_000})
      .catch(async (error) => {
        const body = await page.evaluate(() => document.body?.textContent || '').catch(() => 'renderer unavailable');
        throw new Error(`${String(error)}\nStale-approval diagnostics: ${JSON.stringify({body, runtimeDiagnostics})}`);
      });
    t.false((await fs.readFile(markerPath, 'utf8').catch(() => '')).includes('SHOULD_NOT_RUN_STALE'));
    await page.keyboard.press('Escape');

    const generatedFailure: NliDisplayState = {
      status: 'error',
      sessionUid,
      attemptId: 'visual-generated-attempt' as AttemptId,
      code: 'NLI_GENERATED_COMMAND_FAILED',
      correlationId: 'visual-generated-failure',
      message: 'Generated command failed.'
    };
    await emitNliState(generatedFailure);
    await page.getByRole('dialog', {name: 'The approved command was not recognized'}).waitFor();
    await page.screenshot({path: path.join('dist', 'tmp', 'nli-e2e-generated-failure.png')});

    await emitNliState({
      ...generatedFailure,
      code: 'NLI_WRITE_FAILED',
      correlationId: 'visual-unknown-write',
      message: 'Unknown write outcome.'
    });
    const unknown = page.getByRole('dialog', {name: 'Check the original terminal before continuing'});
    await unknown.waitFor();
    t.is(await unknown.getByRole('button', {name: 'Try again'}).count(), 0);
    await page.screenshot({path: path.join('dist', 'tmp', 'nli-e2e-unknown-write.png')});
    await page.keyboard.press('Escape');
  }
);

test.serial('fake provider alternatives remain bounded, selectable, and safe at 320px', async (t) => {
  const page = await app.firstWindow();
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('.termgroup_termWithNli');
    if (host) {
      host.style.width = '320px';
      host.style.maxWidth = '320px';
    }
  });
  const sessionUid = await page.evaluate(
    () => (window as unknown as RendererTestWindow).store.getState().sessions.activeUid as SessionUid
  );
  const fixture = fs.readJsonSync(path.join(__dirname, 'fixtures', 'nli', 'fake-provider-review.json'));
  const state = {...fixture, sessionUid} as NliDisplayState;
  await app.evaluate(
    ({BrowserWindow}, display) => BrowserWindow.getFocusedWindow()?.rpc.emit('nli state', display),
    state
  );

  const panel = page.getByRole('dialog', {name: 'Review before sending to PowerShell'});
  await panel.waitFor();
  await panel.evaluate((element) => {
    const host = element.closest<HTMLElement>('.termgroup_termWithNli');
    if (!host) throw new Error('NLI panel host was not found');
    host.style.width = '320px';
    host.style.minWidth = '0';
    host.style.maxWidth = '320px';
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const options = panel.getByRole('radio');
  t.is(await options.count(), 3);
  await page.keyboard.press('Enter');
  t.true(await panel.isVisible());
  await panel.getByRole('radio', {name: /Commit staged changes only/}).check();
  t.true(await panel.getByText('git commit; git push -u origin HEAD; gh pr create --base dev').isVisible());
  const panelBox = (await panel.boundingBox())!;
  const responsiveLayout = await panel.evaluate((element) => {
    const host = element.closest<HTMLElement>('.termgroup_termWithNli');
    return {
      hostBox: host?.getBoundingClientRect().toJSON(),
      hostStyle: host?.getAttribute('style'),
      panelStyle: getComputedStyle(element).width
    };
  });
  t.true(panelBox.width <= 321, JSON.stringify({panelBox, responsiveLayout}));
  await page.keyboard.press('Escape');
});
