// Native
import path from 'path';

// Packages
import test from 'ava';
import fs from 'fs-extra';
import {_electron} from 'playwright';
import type {ElectronApplication} from 'playwright';

import type {configOptions} from '../typings/config';
import type {HyperState} from '../typings/hyper';
import type {NliDisplayState, SessionUid} from '../typings/nli';

let app: ElectronApplication;

interface RendererTestWindow extends Window {
  readonly config: {getConfig(): configOptions};
  readonly store: {
    dispatch(action: {type: string; config?: configOptions}): void;
    getState(): HyperState;
  };
}

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

  app = await _electron.launch({
    executablePath: pathToBinary
  });
  await app.firstWindow();
  await new Promise((resolve) => setTimeout(resolve, 5000));
});

test.after(async () => {
  await app
    .evaluate(({BrowserWindow}) =>
      BrowserWindow.getFocusedWindow()
        ?.capturePage()
        .then((img) => img.toPNG().toString('base64'))
    )
    .then((img) => Buffer.from(img || '', 'base64'))
    .then(async (imageBuffer) => {
      await fs.writeFile(`dist/tmp/${process.platform}_test.png`, imageBuffer);
    });
  await app.close();
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

test.serial('fake provider alternatives remain bounded, selectable, and safe at 320px', async (t) => {
  const page = await app.firstWindow();
  await page.setViewportSize({width: 320, height: 720});
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
  const options = panel.getByRole('radio');
  t.is(await options.count(), 3);
  await page.keyboard.press('Enter');
  t.true(await panel.isVisible());
  await panel.getByRole('radio', {name: /Commit staged changes only/}).check();
  t.true(await panel.getByText('git commit; git push -u origin HEAD; gh pr create --base dev').isVisible());
  t.true((await panel.boundingBox())!.width <= 320);
  await page.keyboard.press('Escape');
});
