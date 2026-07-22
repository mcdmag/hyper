import {execFileSync} from 'child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';

import test from 'ava';

import {systemClock} from '../../app/nli/dependencies';
import {
  OscEventParser,
  ShellSemanticEventGate,
  fingerprintWorkingDirectory,
  type OscParseToken
} from '../../app/nli/osc-parser';
import {
  augmentPowerShellArgs,
  createPowerShellIntegration,
  detectShellIntegration
} from '../../app/nli/powershell-integration';
import type {NliClock, ShellSemanticEvent} from '../../typings/nli';

const WINDOW_UID = 'window-1';
const SESSION_UID = 'session-1';
const NONCE = '0123456789abcdef'.repeat(4);
const PREFIX = '\u001b]1337;HyperNLI;1;';

const markerPayload = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  windowUid: WINDOW_UID,
  sessionUid: SESSION_UID,
  callbackId: '0123456789abcdef0123456789abcdef',
  reason: 'command-not-found',
  submittedLine: 'commit the changes and create a pr',
  shellVersion: '7.6.4',
  historyId: '42',
  providerName: 'FileSystem',
  providerPath: 'C:\\work\\hyper',
  ...overrides
});

const frame = (payload = markerPayload(), nonce = NONCE, terminator = '\u0007') =>
  `${PREFIX}${nonce};${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}${terminator}`;

const parser = (overrides: Partial<ConstructorParameters<typeof OscEventParser>[0]> = {}) =>
  new OscEventParser({
    windowUid: WINDOW_UID,
    sessionUid: SESSION_UID,
    nonce: NONCE,
    maxInputChars: 4096,
    includeWorkingDirectory: false,
    platform: 'win32',
    ...overrides
  });

const visibleFrom = (tokens: readonly OscParseToken[]) =>
  tokens
    .filter((token): token is Extract<OscParseToken, {kind: 'visible'}> => token.kind === 'visible')
    .map((token) => token.data)
    .join('');

const eventsFrom = (tokens: readonly OscParseToken[]) =>
  tokens
    .filter((token): token is Extract<OscParseToken, {kind: 'semantic'}> => token.kind === 'semantic')
    .map((token) => token.event);

test('detects only explicitly supported interactive PowerShell launches', (t) => {
  const supported = [
    ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', []],
    ['pwsh.exe', ['--login', '-NoLogo', '-InputFormat', 'Text']],
    ['powershell.exe', ['-NoLogo', '-NoProfile', '-OutputFormat:Text']]
  ] as const;
  for (const [shell, args] of supported) {
    t.true(detectShellIntegration(shell, [...args], true).supported, `${shell} ${args.join(' ')}`);
  }

  const unsupported = [
    ['pwsh.exe', ['-Command', 'Get-Location']],
    ['pwsh.exe', ['-c', 'Get-Location']],
    ['pwsh.exe', ['-EncodedCommand', 'AA==']],
    ['pwsh.exe', ['-enco', 'AA==']],
    ['pwsh.exe', ['-File', 'profile.ps1']],
    ['pwsh.exe', ['-NoExit:$false']],
    ['pwsh.exe', ['-InputFormat', 'xml']],
    ['pwsh.exe', ['-NoLogo', '-NoLogo']],
    ['pwsh.exe', ['-STA', '-MTA']],
    ['pwsh.exe', ['-ExecutionPolicy', '-NoLogo']],
    ['pwsh.exe', ['-WorkingDirectory']],
    ['powershell.exe', ['--login']],
    ['pwsh.exe', ['-NoLogo', '--login']],
    ['cmd.exe', []],
    ['wsl.exe', []],
    ['git-cmd.exe', []],
    ['bash.exe', []]
  ] as const;
  for (const [shell, args] of unsupported) {
    t.false(detectShellIntegration(shell, [...args], true).supported, `${shell} ${args.join(' ')}`);
  }
  t.false(detectShellIntegration('pwsh.exe', [], false).supported);
});

test('startup augmentation is immutable, profile-compatible, and safely path-valued', (t) => {
  const original = ['--login', '-NoLogo'];
  const decision = detectShellIntegration('pwsh.exe', original, true);
  if (!decision.supported) throw new Error('fixture must be supported');
  const augmented = augmentPowerShellArgs(decision, "C:\\A path\\hook ' one.ps1");

  t.deepEqual(original, ['--login', '-NoLogo']);
  t.deepEqual(augmented, ['--login', '-NoLogo', '-NoExit', '-File', "C:\\A path\\hook ' one.ps1"]);
  t.throws(() => (augmented as string[]).push('mutate'));
});

test('generated hook preserves delegate identity, prior behavior, current invocation, and exact nonce', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'hyper-nli-hook-'));
  try {
    const integration = createPowerShellIntegration({
      sessionUid: SESSION_UID,
      windowUid: WINDOW_UID,
      nonce: NONCE,
      scriptDirectory: directory,
      maxInputChars: 4096
    });
    const source = readFileSync(integration.scriptPath, 'utf8');

    t.true(integration.scriptPath.startsWith(directory));
    t.true(
      source.includes(`[System.EventHandler[System.Management.Automation.CommandLookupEventArgs]] $wrapperScript`)
    );
    t.true(source.includes('$state.Previous.Invoke($CommandName, $CommandLookupEventArgs)'));
    t.true(source.includes('$submittedLine = [string]$invocation.Line'));
    t.true(source.includes('$invocation.HistoryId'));
    t.true(source.includes('[System.Management.Automation.Language.Parser]::ParseInput'));
    t.true(source.includes(`$nonce = '${NONCE}'`));
    t.false(source.includes('Get-History'));
    t.false(source.includes('ExecutionPolicy Bypass'));

    integration.dispose();
    integration.dispose();
    t.false(existsSync(integration.scriptPath));
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('parser strips only authenticated frames and discards raw paths by default', (t) => {
  const input = `before${frame()}after`;
  const {visible, events} = parser().push(input);

  t.is(visible, 'beforeafter');
  t.is(events.length, 1);
  t.is(events[0].submittedLine, markerPayload().submittedLine);
  t.is(events[0].cwdFingerprint, fingerprintWorkingDirectory('C:\\work\\hyper', 'FileSystem', 'win32'));
  t.false('workingDirectory' in events[0]);
  t.false(JSON.stringify(events[0]).includes('C:\\work\\hyper'));
  t.false(JSON.stringify(events[0]).includes(NONCE));
});

test('parser preserves Unicode and can disclose a consented working directory', (t) => {
  const payload = markerPayload({
    submittedLine: '提交 🚀 e\u0301 changes',
    providerPath: 'C:\\工作\\e\u0301'
  });
  const tokens = parser({includeWorkingDirectory: true}).pushTokens(frame(payload));
  const [event] = eventsFrom(tokens);

  t.is(event.submittedLine, payload.submittedLine);
  t.is(event.workingDirectory, payload.providerPath);
});

test('parser is chunk-safe at every boundary and accepts BEL or ST terminators', (t) => {
  for (const terminator of ['\u0007', '\u001b\\']) {
    const input = `prefix-${frame(markerPayload(), NONCE, terminator)}-suffix`;
    for (let boundary = 0; boundary <= input.length; boundary++) {
      const instance = parser();
      const tokens = [...instance.pushTokens(input.slice(0, boundary)), ...instance.pushTokens(input.slice(boundary))];
      t.is(visibleFrom(tokens), 'prefix--suffix', `${JSON.stringify(terminator)} split ${boundary}`);
      t.is(eventsFrom(tokens).length, 1, `${JSON.stringify(terminator)} split ${boundary}`);
    }
  }
});

test('wrong, malformed, oversized, and truncated frames are byte-preserving', (t) => {
  const wrongNonce = frame(markerPayload(), 'f'.repeat(64));
  const wrongSession = frame(markerPayload({sessionUid: 'other-session'}));
  const extraField = frame(markerPayload({unexpected: true}));
  const invalidBase64 = `${PREFIX}${NONCE};%%%\u0007`;
  for (const value of [wrongNonce, wrongSession, extraField, invalidBase64]) {
    const tokens = parser().pushTokens(value);
    t.is(visibleFrom(tokens), value);
    t.is(eventsFrom(tokens).length, 0);
  }

  const truncated = frame().slice(0, -7);
  const truncatedParser = parser();
  t.is(visibleFrom(truncatedParser.pushTokens(truncated)), '');
  t.is(visibleFrom(truncatedParser.finish()), truncated);

  const oversized = `${PREFIX}${NONCE};${'A'.repeat(100_000)}`;
  const oversizedParser = parser({maxInputChars: 1});
  const first = oversizedParser.pushTokens(oversized);
  const rest = oversizedParser.pushTokens(`nested${frame()}\u0007tail`);
  t.is(visibleFrom([...first, ...rest]), `${oversized}nested${frame()}\u0007tail`);
  t.is(eventsFrom([...first, ...rest]).length, 0);
});

test('parser rejects invalid UTF-8, callback IDs, versions, reasons, and payload types', (t) => {
  const invalidUtf8 = `${PREFIX}${NONCE};${Buffer.from([0xc3, 0x28]).toString('base64')}\u0007`;
  const values = [
    invalidUtf8,
    frame(markerPayload({callbackId: 'not-a-guid'})),
    frame(markerPayload({v: 2})),
    frame(markerPayload({reason: 'process-exited'})),
    frame(markerPayload({submittedLine: 42})),
    frame(markerPayload({providerPath: ''}))
  ];
  for (const value of values) {
    const tokens = parser().pushTokens(value);
    t.is(visibleFrom(tokens), value);
    t.is(eventsFrom(tokens).length, 0);
  }
});

test('callbacks coalesce by attempt while later HistoryIds and timed repeats are allowed', (t) => {
  let now = 1000;
  const instance = parser({now: () => now});
  const parseEvent = (overrides: Record<string, unknown>) =>
    eventsFrom(instance.pushTokens(frame(markerPayload(overrides))));

  t.is(parseEvent({}).length, 1);
  t.is(parseEvent({callbackId: '11111111111111111111111111111111'}).length, 0);
  t.is(parseEvent({callbackId: '22222222222222222222222222222222', historyId: '43'}).length, 1);
  t.is(parseEvent({callbackId: '33333333333333333333333333333333', historyId: undefined}).length, 1);
  now += 50;
  t.is(parseEvent({callbackId: '44444444444444444444444444444444', historyId: undefined}).length, 0);
  now += 101;
  t.is(parseEvent({callbackId: '55555555555555555555555555555555', historyId: undefined}).length, 1);
  t.is(parseEvent({callbackId: '55555555555555555555555555555555', historyId: '99'}).length, 0);
});

test('per-session nonces and identities cannot consume another session frame', (t) => {
  const otherNonce = 'fedcba9876543210'.repeat(4);
  const firstParser = parser();
  const secondParser = parser({sessionUid: 'session-2', nonce: otherNonce});
  const secondFrame = frame(markerPayload({sessionUid: 'session-2'}), otherNonce);

  t.is(eventsFrom(firstParser.pushTokens(secondFrame)).length, 0);
  t.is(eventsFrom(secondParser.pushTokens(secondFrame)).length, 1);
});

class FakeClock implements NliClock {
  time = 0;
  nextId = 1;
  tasks = new Map<number, {at: number; callback: () => void}>();

  now() {
    return this.time;
  }

  setTimeout(callback: () => void, delayMs: number) {
    const id = this.nextId++;
    this.tasks.set(id, {at: this.time + delayMs, callback});
    return id;
  }

  clearTimeout(handle: unknown) {
    this.tasks.delete(handle as number);
  }

  advance(milliseconds: number) {
    this.time += milliseconds;
    for (const [id, task] of [...this.tasks]) {
      if (task.at <= this.time) {
        this.tasks.delete(id);
        task.callback();
      }
    }
  }
}

test('semantic events wait for synchronous visible error output and expire after 250 ms', (t) => {
  const clock = new FakeClock();
  const trace: string[] = [];
  const event = eventsFrom(parser().pushTokens(frame()))[0];
  const gate = new ShellSemanticEventGate({clock, emit: () => trace.push('semantic')});

  gate.queue([event]);
  clock.advance(249);
  t.deepEqual(trace, []);
  gate.afterVisibleOutput(() => trace.push('visible'));
  t.deepEqual(trace, ['visible', 'semantic']);

  trace.length = 0;
  gate.queue([{...event, callbackId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as ShellSemanticEvent['callbackId']}]);
  clock.advance(250);
  gate.afterVisibleOutput(() => trace.push('late-visible'));
  t.deepEqual(trace, []);
  gate.dispose();
  t.is(clock.tasks.size, 0);
});

test('Session keeps user input synchronous and parses only PTY output before batching', (t) => {
  const source = readFileSync(join(__dirname, '..', '..', 'app', 'session.ts'), 'utf8');
  const inputPath = source.match(/write\(data: string\) \{([\s\S]*?)\n {2}\}/)?.[1] || '';
  const outputPath = source.match(/pty\.onData\(\(chunk\) => \{([\s\S]*?)\n {6}\}\)/)?.[1] || '';

  t.regex(inputPath, /this\.pty\.write\(data\)/);
  t.false(inputPath.includes('OscEventParser'));
  t.true(outputPath.indexOf('parser.pushTokens(chunk)') < outputPath.indexOf('batcher.write(token.data)'));
  t.regex(source, /if \(data !== this\.uid\) \{\s*this\.emit\('flush', data\)/);
});

const findExecutable = (name: string) => {
  try {
    return execFileSync('where.exe', [name], {encoding: 'utf8'}).split(/\r?\n/).find(Boolean);
  } catch (_error) {
    return undefined;
  }
};

interface PtyLike {
  write(data: string): void;
  kill(): void;
  onData(listener: (data: string) => void): {dispose(): void};
  onExit(listener: () => void): {dispose(): void};
}

const waitFor = async (predicate: () => boolean, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for PowerShell PTY fixture');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const quoteLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

const runRealPtyFixture = async (executable: string) => {
  // node-pty is intentionally an app dependency in Hyper.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodePty = require('../../app/node_modules/node-pty') as {
    spawn(file: string, args: string[], options: Record<string, unknown>): PtyLike;
  };
  const directory = mkdtempSync(join(tmpdir(), 'hyper-nli-pty-'));
  const nonce = 'abcdef0123456789'.repeat(4);
  const sessionUid = `session-${Date.now()}`;
  const integration = createPowerShellIntegration({
    sessionUid,
    windowUid: WINDOW_UID,
    nonce,
    scriptDirectory: directory,
    maxInputChars: 4096
  });
  const wrapperPath = join(directory, 'fixture.ps1');
  writeFileSync(
    wrapperPath,
    `$global:HyperNliFixtureProfileLoaded = $true
$global:HyperNliPriorFirst = 0
$global:HyperNliPriorSecond = 0
$firstHandler = [System.EventHandler[System.Management.Automation.CommandLookupEventArgs]] {
  param($sender, $eventArgs)
  $global:HyperNliPriorFirst++
  if ($sender -eq 'resolved_hyper_nli_command') { $eventArgs.CommandScriptBlock = { 'PRIOR_RESOLVED' } }
  if ($sender -eq 'throw_hyper_nli_command') { throw 'PRIOR_THROW' }
}
$secondHandler = [System.EventHandler[System.Management.Automation.CommandLookupEventArgs]] {
  param($sender, $eventArgs)
  $global:HyperNliPriorSecond++
}
$ExecutionContext.InvokeCommand.CommandNotFoundAction = [System.EventHandler[System.Management.Automation.CommandLookupEventArgs]] [System.Delegate]::Combine($firstHandler, $secondHandler)
function global:prompt { '__HYPER_NLI_PROMPT__>' }
. ${quoteLiteral(integration.scriptPath)}
`,
    'ascii'
  );

  const shellDecision = detectShellIntegration(executable, ['-NoLogo', '-NoProfile'], true);
  if (!shellDecision.supported) throw new Error('PowerShell fixture detection failed');
  const args = augmentPowerShellArgs(shellDecision, wrapperPath) as string[];
  const parserInstance = new OscEventParser({
    windowUid: WINDOW_UID,
    sessionUid,
    nonce,
    maxInputChars: 4096,
    includeWorkingDirectory: false,
    platform: 'win32'
  });
  const events: ShellSemanticEvent[] = [];
  const trace: string[] = [];
  let visible = '';
  const gate = new ShellSemanticEventGate({
    clock: systemClock,
    emit: (event) => {
      events.push(event);
      trace.push('semantic');
    }
  });
  const pty = nodePty.spawn(executable, args, {
    cols: 120,
    rows: 30,
    cwd: directory,
    env: {...process.env, TERM: 'xterm-256color'}
  });
  const dataSubscription = pty.onData((data) => {
    for (const token of parserInstance.pushTokens(data)) {
      if (token.kind === 'semantic') {
        gate.queue([token.event]);
      } else if (token.data) {
        visible += token.data;
        gate.afterVisibleOutput(() => trace.push('visible'));
      }
    }
  });
  let exited = false;
  const exitSubscription = pty.onExit(() => {
    exited = true;
    gate.dispose();
  });
  const promptCount = () => visible.split('__HYPER_NLI_PROMPT__>').length - 1;
  const eventCount = () => events.length;
  const submit = async (line: string, expectedPrompt: number) => {
    pty.write(`${line}\r`);
    await waitFor(() => promptCount() >= expectedPrompt);
  };

  try {
    await waitFor(() => promptCount() >= 1);
    await submit("Write-Output ('PROFILE=' + $global:HyperNliFixtureProfileLoaded)", 2);
    const beforeValid = eventCount();
    await submit('Write-Output VALID_NLI_PROBE', 3);
    if (eventCount() !== beforeValid) throw new Error('valid PowerShell command emitted NLI');

    await submit('resolved_hyper_nli_command', 4);
    if (eventCount() !== 0 || !visible.includes('PRIOR_RESOLVED')) {
      throw new Error('prior CommandNotFoundAction resolver was not preserved');
    }
    await submit('throw_hyper_nli_command', 5);
    if (eventCount() !== 0) throw new Error('throwing prior handler invoked NLI');
    await submit('function Invoke-HyperNliInner { no_inner_hyper_nli_command }', 6);
    await submit('Invoke-HyperNliInner', 7);
    if (eventCount() !== 0) throw new Error('missing command inside a valid function invoked NLI');

    await submit('$global:HyperNliPriorFirst = 0; $global:HyperNliPriorSecond = 0', 8);
    await submit('no_such_hyper_nli_command alpha beta', 9);
    await waitFor(() => eventCount() === 1);
    const firstSemantic = trace.indexOf('semantic');
    if (firstSemantic <= 0 || trace[firstSemantic - 1] !== 'visible') {
      throw new Error('semantic event preceded visible PowerShell error output');
    }
    await submit("Write-Output ('PRIOR_COUNTS=' + $global:HyperNliPriorFirst + ',' + $global:HyperNliPriorSecond)", 10);
    const priorCountMatches = [...visible.matchAll(/PRIOR_COUNTS=(\d+),(\d+)/g)];
    const priorCounts = priorCountMatches[priorCountMatches.length - 1];
    if (!priorCounts || priorCounts[1] !== priorCounts[2] || Number(priorCounts[1]) < 1) {
      throw new Error('prior multicast delegate was not invoked exactly once per lookup callback');
    }

    await submit('no_such_hyper_nli_command alpha beta', 11);
    await waitFor(() => eventCount() === 2);
    await submit('cmd /c exit 1', 12);
    await submit('$false', 13);
    await submit("git diff --exit-code --no-index -- 'missing-a' 'missing-b'", 14);
    await submit('Write-Output )', 15);
    await submit(`[Console]::Write(([char]27 + ']1337;HyperNLI;1;wrong-nonce;QQ==' + [char]7))`, 16);
    if (eventCount() !== 2) throw new Error('valid nonzero command invoked NLI');

    if (!visible.includes('PROFILE=True') || !visible.includes('VALID_NLI_PROBE')) {
      throw new Error('profile fixture or valid command output was lost');
    }
    if (events[0].submittedLine !== 'no_such_hyper_nli_command alpha beta') {
      throw new Error(`wrong submitted line: ${events[0].submittedLine}`);
    }
    if (!events[0].historyId || events[0].historyId === events[1].historyId) {
      throw new Error('intentional repeat did not receive a distinct PowerShell HistoryId');
    }
    if ('workingDirectory' in events[0]) throw new Error('raw path escaped privacy boundary');

    await submit(
      `$ExecutionContext.InvokeCommand.CommandNotFoundAction = [System.EventHandler[System.Management.Automation.CommandLookupEventArgs]] { param($sender, $eventArgs) }`,
      17
    );
    await submit('replaced_handler_missing_command', 18);
    if (eventCount() !== 2) throw new Error('runtime handler replacement did not fail closed');
  } finally {
    if (!exited) {
      try {
        pty.kill();
        await waitFor(() => exited, 3000);
      } catch (_error) {
        // The PTY already exited or its native runtime completed cleanup.
      }
    }
    dataSubscription.dispose();
    exitSubscription.dispose();
    gate.dispose();
    integration.dispose();
    rmSync(directory, {recursive: true, force: true});
  }
};

for (const executableName of ['pwsh.exe', 'powershell.exe']) {
  test.serial(`real ${executableName} PTY emits only authoritative command-not-found events`, async (t) => {
    const executable = findExecutable(executableName);
    if (!executable || process.arch !== 'x64') {
      t.pass(`${executableName} or a matching native node-pty runtime is unavailable`);
      return;
    }
    await runRealPtyFixture(executable);
    t.pass();
  });
}
