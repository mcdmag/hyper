import type {ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio} from 'child_process';
import {EventEmitter} from 'events';
import {mkdtempSync, readFileSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import {PassThrough} from 'stream';

import test from 'ava';

import {
  CODEX_APP_SERVER_CONFIG,
  CodexAppServerProvider,
  NliProviderError,
  createCodexChildEnvironment,
  type NliCodexFileSystem
} from '../../app/nli/codex-app-server';
import type {NliChildProcessFactory, NliInterpretationContext} from '../../typings/nli';

interface Message {
  readonly id?: string | number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface ScriptedChild extends ChildProcessWithoutNullStreams {
  received: Message[];
  readonly killedByProvider: boolean;
  pushMessage(message: Message, fragmented?: boolean): void;
  sendRaw(value: string): void;
  pushStderr(value: string): void;
}

type RequestHandler = (message: Message, child: ScriptedChild) => void;

const response = (request: Message, result: unknown): Message => ({id: request.id!, result});
const errorResponse = (request: Message, code: number, message: string): Message => ({
  id: request.id!,
  error: {code, message}
});

const requiredFeatures = [
  'shell_tool',
  'apps',
  'hooks',
  'multi_agent',
  'remote_plugin',
  'memories',
  'goals',
  'shell_snapshot'
];

const isolatedConfig = {
  config: {approval_policy: 'never', sandbox_mode: 'read-only', web_search: 'disabled'},
  layers: [{config: {cli_auth_credentials_store: 'keyring'}}],
  origins: {}
};

const isolatedFeatures = {
  data: requiredFeatures.map((name) => ({name, enabled: false, defaultEnabled: false, stage: 'stable'})),
  nextCursor: null
};

const modernIsolatedConfig = {
  config: {
    ...isolatedConfig.config,
    cli_auth_credentials_store: 'keyring',
    features: Object.fromEntries(requiredFeatures.map((name) => [name, false]))
  },
  layers: isolatedConfig.layers,
  origins: {
    cli_auth_credentials_store: {
      name: 'Hyper NLI private config',
      version: '0.145.0'
    }
  }
};

const makeChild = (handler: RequestHandler): ScriptedChild => {
  const child = new EventEmitter() as ScriptedChild;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const received: Message[] = [];
  let killed = false;
  let input = '';
  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = stderr;
  child.received = received;
  Object.defineProperty(child, 'killed', {get: () => killed});
  Object.defineProperty(child, 'killedByProvider', {get: () => killed});
  child.kill = (() => {
    if (killed) return true;
    killed = true;
    queueMicrotask(() => child.emit('close', null));
    return true;
  }) as ChildProcessWithoutNullStreams['kill'];
  child.pushMessage = (message, fragmented = false) => {
    const line = `${JSON.stringify(message)}\n`;
    if (fragmented) {
      const boundary = Math.max(1, Math.floor(line.length / 2));
      stdout.write(line.slice(0, boundary));
      queueMicrotask(() => stdout.write(line.slice(boundary)));
    } else {
      stdout.write(line);
    }
  };
  child.sendRaw = (value) => stdout.write(value);
  child.pushStderr = (value) => stderr.write(value);
  stdin.setEncoding('utf8');
  stdin.on('data', (chunk: string) => {
    input += chunk;
    for (;;) {
      const newline = input.indexOf('\n');
      if (newline < 0) break;
      const line = input.slice(0, newline);
      input = input.slice(newline + 1);
      const message = JSON.parse(line) as Message;
      received.push(message);
      queueMicrotask(() => handler(message, child));
    }
  });
  return child;
};

class ScriptedFactory implements NliChildProcessFactory {
  readonly children: ScriptedChild[] = [];
  readonly calls: {
    executable: string;
    args: readonly string[];
    options: SpawnOptionsWithoutStdio & {readonly stdio: 'pipe'};
  }[] = [];

  constructor(private readonly handler: RequestHandler) {}

  spawn(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio & {readonly stdio: 'pipe'}) {
    this.calls.push({executable, args, options});
    const child = makeChild(this.handler);
    this.children.push(child);
    return child;
  }
}

const standardHandler =
  (overrides: Partial<Record<string, RequestHandler>> = {}): RequestHandler =>
  (message, child) => {
    if (!message.id || !message.method) return;
    const override = overrides[message.method];
    if (override) {
      override(message, child);
      return;
    }
    switch (message.method) {
      case 'initialize':
        child.pushMessage(
          response(message, {
            userAgent: 'codex-cli/0.144.6',
            codexHome: 'private',
            platformFamily: 'windows',
            platformOs: 'windows'
          }),
          true
        );
        break;
      case 'config/read':
        child.pushMessage(response(message, isolatedConfig));
        break;
      case 'experimentalFeature/list':
        child.pushMessage(response(message, isolatedFeatures));
        break;
      case 'account/read':
        child.pushMessage(response(message, {account: null, requiresOpenaiAuth: true}));
        break;
      case 'account/logout':
      case 'account/login/cancel':
      case 'turn/interrupt':
        child.pushMessage(response(message, {}));
        break;
      default:
        child.pushMessage(errorResponse(message, -32601, 'unsupported fixture request'));
    }
  };

const makeHarness = (handler: RequestHandler = standardHandler(), requestTimeoutMs = 250) => {
  const directory = mkdtempSync(join(tmpdir(), 'hyper-nli-codex-'));
  const factory = new ScriptedFactory(handler);
  const opened: string[] = [];
  const provider = new CodexAppServerProvider({
    executable: 'codex-fixture.exe',
    userDataPath: directory,
    requestTimeoutMs,
    maxOptions: 3,
    childProcessFactory: factory,
    openExternal: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    environment: {
      Path: 'safe-path',
      PATHEXT: '.EXE',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      LANG: 'en_NZ.UTF-8',
      LC_ALL: 'en_NZ.UTF-8',
      OPENAI_API_KEY: 'must-not-cross',
      GITHUB_TOKEN: 'must-not-cross',
      CODEX_HOME: 'must-not-cross',
      HYPER_PROFILE_SECRET: 'must-not-cross',
      MCP_CONFIG: 'must-not-cross',
      CODEX_PLUGIN_PATH: 'must-not-cross'
    }
  });
  return {
    directory,
    factory,
    opened,
    provider,
    async cleanup() {
      await provider.dispose();
      rmSync(directory, {recursive: true, force: true});
    }
  };
};

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof NliProviderError ? error.code : 'unexpected';
  }
};

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for scripted Codex request');
    await flush();
  }
};

const context: NliInterpretationContext = {
  attemptId: 'attempt-1' as NliInterpretationContext['attemptId'],
  submittedLine: 'commit the changes and create a pr',
  shellFamily: 'powershell',
  shellVersion: '7.5.2',
  operatingSystem: 'win32',
  cwdFingerprint: 'private-fingerprint'
};

test('starts hidden with strict config, an empty cwd, and a newly allowlisted environment', async (t) => {
  const harness = makeHarness();
  try {
    t.deepEqual(await harness.provider.getAuthStatus(), {status: 'signed-out'});
    const call = harness.factory.calls[0];
    t.is(call.executable, 'codex-fixture.exe');
    t.deepEqual(call.args, ['app-server', '--stdio', '--strict-config']);
    t.is(call.options.shell, false);
    t.is(call.options.windowsHide, true);
    t.is(call.options.stdio, 'pipe');
    t.truthy(call.options.cwd);
    t.true(String(call.options.cwd).includes('codex-runtime'));
    const environment = call.options.env!;
    t.is(environment.Path, 'safe-path');
    t.is(environment.SystemRoot, 'C:\\Windows');
    t.is(environment.LC_ALL, 'en_NZ.UTF-8');
    t.true(String(environment.CODEX_HOME).includes('codex-home'));
    for (const denied of [
      'OPENAI_API_KEY',
      'GITHUB_TOKEN',
      'HYPER_PROFILE_SECRET',
      'MCP_CONFIG',
      'CODEX_PLUGIN_PATH'
    ]) {
      t.false(denied in environment);
    }
    t.is(Object.values(environment).includes('must-not-cross'), false);
    t.is(readFileSync(join(harness.directory, 'nli', 'codex-home', 'config.toml'), 'utf8'), CODEX_APP_SERVER_CONFIG);
    t.true(harness.factory.children[0].received.some((message) => message.method === 'initialized' && !message.id));
  } finally {
    const cwd = harness.factory.calls[0]?.options.cwd as string | undefined;
    await harness.cleanup();
    if (cwd) t.throws(() => readFileSync(join(cwd, 'anything')));
    t.true(harness.factory.children[0].killedByProvider);
  }
});

test('negotiates modern effective capabilities without depending on version branding or provenance layout', async (t) => {
  for (const initialized of [{userAgent: 'codex-cli/development-build'}, {}]) {
    const harness = makeHarness(
      standardHandler({
        initialize: (message, child) => child.pushMessage(response(message, initialized)),
        'config/read': (message, child) => child.pushMessage(response(message, modernIsolatedConfig)),
        'experimentalFeature/list': () => t.fail('modern effective config must not use the legacy list')
      })
    );
    try {
      t.deepEqual(await harness.provider.getAuthStatus(), {status: 'signed-out'});
      const methods = harness.factory.children[0].received.map((message) => message.method);
      t.true(methods.includes('config/read'));
      t.true(methods.includes('account/read'));
      t.false(methods.includes('experimentalFeature/list'));
    } finally {
      await harness.cleanup();
    }
  }
});

test('modern capability negotiation reaches the existing browser login flow', async (t) => {
  const harness = makeHarness(
    standardHandler({
      initialize: (message, child) =>
        child.pushMessage(response(message, {userAgent: 'hyper-nli-probe/0.145.0 (windows)'})),
      'config/read': (message, child) => child.pushMessage(response(message, modernIsolatedConfig)),
      'experimentalFeature/list': () => t.fail('modern effective config must not use the legacy list'),
      'account/login/start': (message, child) => {
        child.pushMessage(
          response(message, {
            type: 'chatgpt',
            authUrl: 'https://auth.openai.com/start',
            loginId: 'modern-login'
          })
        );
        queueMicrotask(() =>
          child.pushMessage({
            method: 'account/login/completed',
            params: {loginId: 'modern-login', success: true}
          })
        );
      },
      'account/read': (message, child) =>
        child.pushMessage(
          response(message, {
            account: {type: 'chatgpt', email: 'modern@example.test'},
            requiresOpenaiAuth: true
          })
        )
    })
  );
  try {
    t.deepEqual(await harness.provider.login(), {
      status: 'signed-in',
      accountLabel: 'modern@example.test'
    });
    t.deepEqual(harness.opened, ['https://auth.openai.com/start']);
    const methods = harness.factory.children[0].received.map((message) => message.method);
    t.true(methods.includes('account/login/start'));
    t.false(methods.includes('experimentalFeature/list'));
  } finally {
    await harness.cleanup();
  }
});

test('effective capability values take precedence while targeted legacy fallbacks remain fail closed', async (t) => {
  const effectiveWins = makeHarness(
    standardHandler({
      'config/read': (message, child) =>
        child.pushMessage(
          response(message, {
            ...modernIsolatedConfig,
            layers: [{config: {cli_auth_credentials_store: 'file'}}]
          })
        )
    })
  );
  try {
    t.deepEqual(await effectiveWins.provider.getAuthStatus(), {status: 'signed-out'});
  } finally {
    await effectiveWins.cleanup();
  }

  const cases: {name: string; config: unknown; features?: unknown}[] = [
    {
      name: 'unsafe effective credential store does not fall back',
      config: {
        ...modernIsolatedConfig,
        config: {...modernIsolatedConfig.config, cli_auth_credentials_store: 'file'}
      }
    },
    {
      name: 'wrong-typed effective credential store does not fall back',
      config: {
        ...modernIsolatedConfig,
        config: {...modernIsolatedConfig.config, cli_auth_credentials_store: {kind: 'keyring'}}
      }
    },
    {
      name: 'enabled effective feature does not fall back',
      config: {
        ...modernIsolatedConfig,
        config: {
          ...modernIsolatedConfig.config,
          features: {...modernIsolatedConfig.config.features, shell_tool: true}
        }
      }
    },
    {
      name: 'wrong-typed effective feature map does not fall back',
      config: {
        ...modernIsolatedConfig,
        config: {...modernIsolatedConfig.config, features: requiredFeatures}
      }
    },
    {
      name: 'missing feature requires explicit legacy proof',
      config: {
        ...modernIsolatedConfig,
        config: {
          ...modernIsolatedConfig.config,
          features: Object.fromEntries(
            requiredFeatures.filter((name) => name !== 'shell_tool').map((name) => [name, false])
          )
        }
      },
      features: {data: requiredFeatures.filter((name) => name !== 'shell_tool').map((name) => ({name, enabled: false}))}
    },
    {
      name: 'conflicting duplicate legacy feature entries are rejected',
      config: {
        ...modernIsolatedConfig,
        config: {...modernIsolatedConfig.config, features: {}}
      },
      features: {
        data: [...isolatedFeatures.data, {name: 'shell_tool', enabled: true, defaultEnabled: false, stage: 'stable'}]
      }
    }
  ];
  for (const fixture of cases) {
    const harness = makeHarness(
      standardHandler({
        'config/read': (message, child) => child.pushMessage(response(message, fixture.config)),
        ...(fixture.features
          ? {
              'experimentalFeature/list': (message: Message, child: ScriptedChild) =>
                child.pushMessage(response(message, fixture.features))
            }
          : {})
      })
    );
    try {
      t.is(await errorCode(harness.provider.getAuthStatus()), 'NLI_CODEX_INCOMPATIBLE', fixture.name);
    } finally {
      await harness.cleanup();
    }
  }
});

test('environment construction rejects tokens, project variables, and terminal profile values', (t) => {
  const environment = createCodexChildEnvironment(
    {
      PATH: 'path',
      USERPROFILE: 'profile',
      XDG_RUNTIME_DIR: 'runtime',
      DBUS_SESSION_BUS_ADDRESS: 'bus',
      AWS_SECRET_ACCESS_KEY: 'secret',
      OPENAI_API_KEY: 'token',
      npm_config_userconfig: 'project',
      TERM_PROGRAM: 'terminal-profile'
    },
    'private-home'
  );
  t.deepEqual(environment, {
    PATH: 'path',
    USERPROFILE: 'profile',
    XDG_RUNTIME_DIR: 'runtime',
    DBUS_SESSION_BUS_ADDRESS: 'bus',
    CODEX_HOME: 'private-home'
  });
});

test('correlates concurrent responses by request ID even when responses arrive in reverse order', async (t) => {
  const pendingReads: {message: Message; child: ScriptedChild}[] = [];
  const harness = makeHarness(
    standardHandler({
      'account/read': (message, child) => {
        pendingReads.push({message, child});
        if (pendingReads.length !== 2) return;
        pendingReads[1].child.pushMessage(
          response(pendingReads[1].message, {
            account: {type: 'chatgpt', email: 'second@example.test'},
            requiresOpenaiAuth: true
          })
        );
        pendingReads[0].child.pushMessage(response(pendingReads[0].message, {account: null, requiresOpenaiAuth: true}));
      }
    })
  );
  try {
    const first = harness.provider.getAuthStatus();
    const second = harness.provider.getAuthStatus();
    t.deepEqual(await first, {status: 'signed-out'});
    t.deepEqual(await second, {status: 'signed-in', accountLabel: 'second@example.test'});
  } finally {
    await harness.cleanup();
  }
});

test('browser OAuth accepts only HTTPS, completes ChatGPT login, cancels, and logs out', async (t) => {
  let accountSignedIn = false;
  let loginNumber = 0;
  const harness = makeHarness(
    standardHandler({
      'account/login/start': (message, child) => {
        loginNumber++;
        const loginId = `login-${loginNumber}`;
        child.pushMessage(response(message, {type: 'chatgpt', authUrl: 'https://auth.openai.com/start', loginId}));
        if (loginNumber === 1) {
          accountSignedIn = true;
          queueMicrotask(() =>
            child.pushMessage({method: 'account/login/completed', params: {loginId, success: true}})
          );
        }
      },
      'account/read': (message, child) => {
        t.deepEqual(message.params, {refreshToken: false});
        child.pushMessage(
          response(
            message,
            accountSignedIn
              ? {account: {type: 'chatgpt', email: 'user@example.test'}, requiresOpenaiAuth: true}
              : {account: null, requiresOpenaiAuth: true}
          )
        );
      },
      'account/login/cancel': (message, child) => {
        child.pushMessage(response(message, {}));
        child.pushMessage({method: 'account/login/completed', params: {loginId: 'login-2', success: false}});
      }
    })
  );
  try {
    t.deepEqual(await harness.provider.login(), {status: 'signed-in', accountLabel: 'user@example.test'});
    t.deepEqual(harness.opened, ['https://auth.openai.com/start']);
    accountSignedIn = false;
    const cancelledLogin = harness.provider.login();
    await flush();
    await harness.provider.cancelLogin();
    t.deepEqual(await cancelledLogin, {status: 'signed-out'});
    await harness.provider.logout();
    const methods = harness.factory.children[0].received.map((message) => message.method);
    t.true(methods.includes('account/login/cancel'));
    t.true(methods.includes('account/logout'));
  } finally {
    await harness.cleanup();
  }
});

test('rejects non-HTTPS OAuth URLs without opening them', async (t) => {
  const harness = makeHarness(
    standardHandler({
      'account/login/start': (message, child) =>
        child.pushMessage(
          response(message, {type: 'chatgpt', authUrl: 'http://unsafe.example/login', loginId: 'login'})
        )
    })
  );
  try {
    t.is(await errorCode(harness.provider.login()), 'NLI_CODEX_INCOMPATIBLE');
    t.deepEqual(harness.opened, []);
  } finally {
    await harness.cleanup();
  }
});

test('uses ephemeral tool-free turns with outputSchema and returns fragmented structured completion', async (t) => {
  const plan = {
    version: 1,
    kind: 'plan',
    planId: 'plan-1',
    summary: 'Commit and open a pull request.',
    options: [
      {
        optionId: 'option-1',
        label: 'GitHub CLI',
        rationale: 'Commit, push, and open the PR.',
        assumptions: ['The GitHub CLI is authenticated.'],
        purpose: 'Create a pull request.',
        shellText: 'git commit -am "update"; git push; gh pr create'
      }
    ]
  };
  const harness = makeHarness(
    standardHandler({
      'thread/start': (message, child) =>
        child.pushMessage(response(message, {thread: {id: 'thread-1'}, approvalPolicy: 'never', sandbox: 'readOnly'})),
      'turn/start': (message, child) => {
        child.pushMessage(response(message, {turn: {id: 'turn-1'}}));
        queueMicrotask(() =>
          child.pushMessage(
            {
              method: 'turn/completed',
              params: {
                turn: {
                  id: 'turn-1',
                  status: 'completed',
                  items: [{id: 'message-1', type: 'agentMessage', text: JSON.stringify(plan)}]
                }
              }
            },
            true
          )
        );
      }
    })
  );
  try {
    t.deepEqual(await harness.provider.interpret(context, new AbortController().signal), plan);
    const child = harness.factory.children[0];
    const thread = child.received.find((message) => message.method === 'thread/start')!.params as Record<
      string,
      unknown
    >;
    t.is(thread.approvalPolicy, 'never');
    t.is(thread.sandbox, 'readOnly');
    t.deepEqual(thread.dynamicTools, []);
    t.deepEqual(thread.environments, []);
    t.deepEqual(thread.runtimeWorkspaceRoots, []);
    t.is(thread.ephemeral, true);
    const turn = child.received.find((message) => message.method === 'turn/start')!.params as Record<string, unknown>;
    t.deepEqual(turn.environments, []);
    t.deepEqual(turn.runtimeWorkspaceRoots, []);
    t.truthy(turn.outputSchema);
    t.deepEqual(JSON.parse((turn.input as {text: string}[])[0].text), context);
    t.false(JSON.stringify(turn).includes(process.cwd()));
  } finally {
    await harness.cleanup();
  }
});

test('abort and timeout interrupt an active turn without retrying it', async (t) => {
  for (const mode of ['abort', 'timeout'] as const) {
    const harness = makeHarness(
      standardHandler({
        'thread/start': (message, child) => child.pushMessage(response(message, {thread: {id: 'thread-1'}})),
        'turn/start': (message, child) => child.pushMessage(response(message, {turn: {id: 'turn-1'}}))
      }),
      mode === 'timeout' ? 25 : 250
    );
    try {
      const controller = new AbortController();
      const interpretation = harness.provider.interpret(context, controller.signal);
      await waitFor(
        () => harness.factory.children[0]?.received.some((message) => message.method === 'turn/start') === true
      );
      if (mode === 'abort') controller.abort();
      t.is(await errorCode(interpretation), mode === 'abort' ? 'NLI_CANCELLED' : 'NLI_TIMEOUT');
      await flush();
      const child = harness.factory.children[0];
      t.is(child.received.filter((message) => message.method === 'thread/start').length, 1);
      t.is(child.received.filter((message) => message.method === 'turn/start').length, 1);
      t.is(child.received.filter((message) => message.method === 'turn/interrupt').length, 1);
    } finally {
      await harness.cleanup();
    }
  }
});

test('denies every generated server request before terminating interpretation', async (t) => {
  const fixture = JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', 'nli', 'codex-app-server-0.144.6-v2-subset.json'), 'utf8')
  ) as {deniedServerRequests: string[]};
  for (const method of fixture.deniedServerRequests) {
    const harness = makeHarness();
    try {
      await harness.provider.getAuthStatus();
      const child = harness.factory.children[0];
      child.pushMessage({id: 'server-request', method, params: {secret: 'must-not-dispatch'}});
      await flush();
      const denial = child.received.find((message) => message.id === 'server-request');
      t.deepEqual(denial?.error, {code: -32601, message: 'Client capabilities disabled'});
      t.true(child.killedByProvider, method);
    } finally {
      await harness.cleanup();
    }
  }
});

test('a denied server tool request aborts the active interpretation with an incompatible-provider error', async (t) => {
  const harness = makeHarness(
    standardHandler({
      'thread/start': (message, child) => child.pushMessage(response(message, {thread: {id: 'thread-1'}})),
      'turn/start': (message, child) => child.pushMessage(response(message, {turn: {id: 'turn-1'}}))
    })
  );
  try {
    const interpretation = harness.provider.interpret(context, new AbortController().signal);
    await waitFor(
      () => harness.factory.children[0]?.received.some((message) => message.method === 'turn/start') === true
    );
    harness.factory.children[0].pushMessage({
      id: 'tool-request',
      method: 'item/tool/call',
      params: {tool: 'shell', arguments: {command: 'must-not-run'}}
    });
    t.is(await errorCode(interpretation), 'NLI_CODEX_INCOMPATIBLE');
    t.false(JSON.stringify(harness.factory.children[0].received).includes('must-not-run'));
    const denial = harness.factory.children[0].received.find((message) => message.id === 'tool-request');
    t.truthy(denial?.error);
  } finally {
    await harness.cleanup();
  }
});

test('server error notifications abort active turns immediately with a typed failure', async (t) => {
  const harness = makeHarness(
    standardHandler({
      'thread/start': (message, child) => child.pushMessage(response(message, {thread: {id: 'thread-1'}})),
      'turn/start': (message, child) => child.pushMessage(response(message, {turn: {id: 'turn-1'}}))
    })
  );
  try {
    const interpretation = harness.provider.interpret(context, new AbortController().signal);
    await waitFor(
      () => harness.factory.children[0]?.received.some((message) => message.method === 'turn/start') === true
    );
    harness.factory.children[0].pushMessage({
      method: 'error',
      params: {
        error: {message: 'network offline'},
        threadId: 'thread-1',
        turnId: 'turn-1',
        willRetry: false
      }
    });
    t.is(await errorCode(interpretation), 'NLI_OFFLINE');
  } finally {
    await harness.cleanup();
  }
});

test('malformed and oversized JSONL fail closed, while crashes restart on the next request', async (t) => {
  const harness = makeHarness();
  try {
    await harness.provider.getAuthStatus();
    harness.factory.children[0].sendRaw('{not-json}\n');
    await flush();
    t.true(harness.factory.children[0].killedByProvider);
    await harness.provider.getAuthStatus();
    t.is(harness.factory.children.length, 2);
    harness.factory.children[1].sendRaw(`${'x'.repeat(1024 * 1024 + 1)}`);
    await flush();
    t.true(harness.factory.children[1].killedByProvider);
    await harness.provider.getAuthStatus();
    t.is(harness.factory.children.length, 3);
    harness.factory.children[2].emit('close', 1);
    await harness.provider.getAuthStatus();
    t.is(harness.factory.children.length, 4);
  } finally {
    await harness.cleanup();
  }
});

test('maps missing, incompatible, keyring, auth, rate-limit, and userData failures to safe codes', async (t) => {
  const cases: {name: string; handler: RequestHandler; expected: string}[] = [
    {
      name: 'malformed initialize response',
      expected: 'NLI_CODEX_INCOMPATIBLE',
      handler: standardHandler({
        initialize: (message, child) => child.pushMessage(response(message, null))
      })
    },
    {
      name: 'unsafe config',
      expected: 'NLI_CODEX_INCOMPATIBLE',
      handler: standardHandler({
        'config/read': (message, child) =>
          child.pushMessage(
            response(message, {...isolatedConfig, config: {...isolatedConfig.config, web_search: 'live'}})
          )
      })
    },
    {
      name: 'conflicting credential store layer',
      expected: 'NLI_CODEX_INCOMPATIBLE',
      handler: standardHandler({
        'config/read': (message, child) =>
          child.pushMessage(
            response(message, {
              ...isolatedConfig,
              layers: [...isolatedConfig.layers, {config: {cli_auth_credentials_store: 'file'}}]
            })
          )
      })
    },
    {
      name: 'keyring unavailable',
      expected: 'NLI_KEYRING_UNAVAILABLE',
      handler: standardHandler({
        'config/read': (message, child) => child.pushMessage(errorResponse(message, 500, 'OS keyring unavailable'))
      })
    },
    {
      name: 'authentication',
      expected: 'NLI_AUTH_REQUIRED',
      handler: standardHandler({
        'account/read': (message, child) => child.pushMessage(errorResponse(message, 401, 'unauthorized'))
      })
    },
    {
      name: 'missing protocol method',
      expected: 'NLI_CODEX_INCOMPATIBLE',
      handler: standardHandler({
        'account/read': (message, child) => child.pushMessage(errorResponse(message, -32601, 'method not found'))
      })
    },
    {
      name: 'non-ChatGPT account shape',
      expected: 'NLI_CODEX_INCOMPATIBLE',
      handler: standardHandler({
        'account/read': (message, child) =>
          child.pushMessage(response(message, {account: {email: 'ambiguous@example.test'}, requiresOpenaiAuth: true}))
      })
    },
    {
      name: 'rate limit',
      expected: 'NLI_RATE_LIMIT',
      handler: standardHandler({
        'account/read': (message, child) => child.pushMessage(errorResponse(message, 429, 'rate limit'))
      })
    },
    {
      name: 'offline',
      expected: 'NLI_OFFLINE',
      handler: standardHandler({
        'account/read': (message, child) => child.pushMessage(errorResponse(message, 503, 'network offline'))
      })
    }
  ];
  for (const fixture of cases) {
    const harness = makeHarness(fixture.handler);
    try {
      t.is(await errorCode(harness.provider.getAuthStatus()), fixture.expected, fixture.name);
    } finally {
      await harness.cleanup();
    }
  }

  const missingDirectory = mkdtempSync(join(tmpdir(), 'hyper-nli-missing-'));
  const missingFactory: NliChildProcessFactory = {
    spawn() {
      const error = new Error('sensitive executable path') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
  };
  const missing = new CodexAppServerProvider({
    executable: 'missing',
    userDataPath: missingDirectory,
    requestTimeoutMs: 50,
    maxOptions: 3,
    childProcessFactory: missingFactory,
    openExternal: () => Promise.resolve()
  });
  t.is(await errorCode(missing.getAuthStatus()), 'NLI_CODEX_MISSING');
  await missing.dispose();
  rmSync(missingDirectory, {recursive: true, force: true});

  const unwritableFileSystem: NliCodexFileSystem = {
    mkdir: () => Promise.reject(new Error('private path')),
    mkdtemp: () => Promise.reject(new Error('private path')),
    writeFile: () => Promise.reject(new Error('private path')),
    chmod: () => Promise.reject(new Error('private path')),
    readdir: () => Promise.reject(new Error('private path')),
    rm: () => Promise.resolve()
  };
  const unwritable = new CodexAppServerProvider({
    executable: 'codex',
    userDataPath: 'private',
    requestTimeoutMs: 50,
    maxOptions: 3,
    childProcessFactory: new ScriptedFactory(standardHandler()),
    openExternal: () => Promise.resolve(),
    fileSystem: unwritableFileSystem
  });
  t.is(await errorCode(unwritable.getAuthStatus()), 'NLI_USERDATA_UNWRITABLE');
  await unwritable.dispose();
});

test('dispose during private-directory setup cannot spawn a dangling child', async (t) => {
  let releaseSetup!: () => void;
  const setupGate = new Promise<void>((resolve) => {
    releaseSetup = resolve;
  });
  let firstMkdir = true;
  const removed: string[] = [];
  const delayedFileSystem: NliCodexFileSystem = {
    mkdir: async () => {
      if (firstMkdir) {
        firstMkdir = false;
        await setupGate;
      }
    },
    mkdtemp: (prefix) => Promise.resolve(`${prefix}fixture`),
    writeFile: () => Promise.resolve(),
    chmod: () => Promise.resolve(),
    readdir: () => Promise.resolve([]),
    rm: (path) => {
      removed.push(path);
      return Promise.resolve();
    }
  };
  const factory = new ScriptedFactory(standardHandler());
  const provider = new CodexAppServerProvider({
    executable: 'codex',
    userDataPath: 'private',
    requestTimeoutMs: 50,
    maxOptions: 3,
    childProcessFactory: factory,
    openExternal: () => Promise.resolve(),
    fileSystem: delayedFileSystem
  });
  const startup = provider.getAuthStatus();
  await flush();
  const disposal = provider.dispose();
  releaseSetup();
  await disposal;
  t.is(await errorCode(startup), 'NLI_CANCELLED');
  t.is(factory.children.length, 0);
  t.true(removed.some((path) => path.includes('codex-runtime')));
});

test('stderr and inherited token sentinels never cross state, IPC, stores, snapshots, or PTY boundaries', async (t) => {
  const sentinel = 'HYPER_NLI_SENTINEL_SECRET_9f70';
  const harness = makeHarness(
    standardHandler({
      'account/read': (message, child) => {
        child.pushStderr(sentinel);
        child.pushMessage(response(message, {account: null, requiresOpenaiAuth: true}));
      }
    })
  );
  try {
    const state = await harness.provider.getAuthStatus();
    const child = harness.factory.children[0];
    t.false(JSON.stringify(state).includes(sentinel));
    t.false(JSON.stringify(child.received).includes(sentinel));
    const rendererFacingSources = [
      join(__dirname, '..', '..', 'typings', 'nli.d.ts'),
      join(__dirname, '..', '..', 'app', 'nli', 'events.ts'),
      join(__dirname, '..', '..', 'app', 'nli', 'preferences.ts'),
      join(__dirname, '..', '..', 'app', 'nli', 'service.ts'),
      join(__dirname, '..', '..', 'app', 'ui', 'window.ts'),
      join(__dirname, '..', '..', 'app', 'session.ts')
    ].map((path) => readFileSync(path, 'utf8'));
    for (const source of rendererFacingSources) {
      t.false(source.includes(sentinel));
      t.false(source.includes('accessToken'));
      t.false(source.includes('auth.json'));
    }
    const sessionSource = rendererFacingSources.at(-1)!;
    t.false(sessionSource.includes('CODEX_HOME'));
    t.false(sessionSource.includes('createCodexChildEnvironment'));
  } finally {
    await harness.cleanup();
  }
});

test('protocol fixture and source contain no token transport, logging, auth.json, or inherited env spread', (t) => {
  const fixture = JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', 'nli', 'codex-app-server-0.144.6-v2-subset.json'), 'utf8')
  ) as {
    compatibilityBaseline: string;
    sourceCommand: string;
    sourceSchemas: string[];
    clientRequests: string[];
    generatedSchemaSubset: Record<string, {paramsRequired?: string[]; outputSchema?: boolean}>;
  };
  t.is(fixture.compatibilityBaseline, '0.144.6');
  t.is(fixture.sourceCommand, 'codex app-server generate-json-schema --experimental');
  t.true(fixture.sourceSchemas.includes('v2/TurnCompletedNotification.json'));
  t.deepEqual(fixture.generatedSchemaSubset['turn/completed'].paramsRequired, ['threadId', 'turn']);
  t.deepEqual(fixture.generatedSchemaSubset['turn/interrupt'].paramsRequired, ['threadId', 'turnId']);
  t.deepEqual(fixture.generatedSchemaSubset['turn/start'].paramsRequired, ['input', 'threadId']);
  t.is(fixture.generatedSchemaSubset['turn/start'].outputSchema, true);
  for (const method of [
    'initialize',
    'account/read',
    'account/login/start',
    'account/logout',
    'thread/start',
    'turn/start',
    'turn/interrupt'
  ]) {
    t.true(fixture.clientRequests.includes(method));
  }
  const source = readFileSync(join(__dirname, '..', '..', 'app', 'nli', 'codex-app-server.ts'), 'utf8');
  t.false(source.includes('auth.json'));
  t.false(source.includes('console.log'));
  t.false(source.includes('console.error'));
  t.false(source.includes('{...process.env}'));
  t.false(source.includes('accessToken'));
  const rendererState = readFileSync(join(__dirname, '..', '..', 'typings', 'nli.d.ts'), 'utf8');
  t.false(rendererState.includes('accessToken'));
});
