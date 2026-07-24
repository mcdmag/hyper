import type {ChildProcessWithoutNullStreams} from 'child_process';
import {promises as fs} from 'fs';
import {join} from 'path';

import type {
  NliAuthState,
  NliChildProcessFactory,
  NliErrorCode,
  NliInterpretationContext,
  NliProvider,
  NliProviderResult
} from '../../typings/nli';

import {NLI_PROVIDER_OUTPUT_SCHEMA, validateCommandPlan} from './command-plan';

const MAX_JSONL_BYTES = 1024 * 1024;
const REQUIRED_FEATURES = Object.freeze([
  'shell_tool',
  'apps',
  'hooks',
  'multi_agent',
  'remote_plugin',
  'memories',
  'goals',
  'shell_snapshot'
]);
const SAFE_ENVIRONMENT_NAMES = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'LANG',
  'XDG_RUNTIME_DIR',
  'DBUS_SESSION_BUS_ADDRESS'
]);

export const CODEX_APP_SERVER_CONFIG = `cli_auth_credentials_store = "keyring"
approval_policy = "never"
sandbox_mode = "read-only"
web_search = "disabled"

[features]
shell_tool = false
apps = false
hooks = false
multi_agent = false
remote_plugin = false
memories = false
goals = false
shell_snapshot = false
`;

export interface NliCodexFileSystem {
  mkdir(path: string, options: {recursive: true; mode: number}): Promise<unknown>;
  mkdtemp(prefix: string): Promise<string>;
  writeFile(path: string, contents: string, options: {encoding: 'utf8'; mode: number}): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  readdir(path: string): Promise<string[]>;
  rm(path: string, options: {recursive: true; force: true}): Promise<void>;
}

export interface CodexAppServerProviderOptions {
  readonly executable: string;
  readonly userDataPath: string;
  readonly requestTimeoutMs: number;
  readonly maxOptions: number;
  readonly childProcessFactory: NliChildProcessFactory;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly environment?: NodeJS.ProcessEnv;
  readonly fileSystem?: NliCodexFileSystem;
}

interface JsonObject {
  [key: string]: unknown;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
  readonly abort?: () => void;
}

interface NotificationWaiter {
  readonly predicate: (params: unknown) => boolean;
  readonly resolve: (params: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
  readonly abort?: () => void;
}

export class NliProviderError extends Error {
  readonly code: NliErrorCode;

  constructor(code: NliErrorCode) {
    super('Natural-language provider request failed');
    this.name = 'NliProviderError';
    this.code = code;
  }
}

const providerError = (code: NliErrorCode) => new NliProviderError(code);

export const createCodexChildEnvironment = (source: NodeJS.ProcessEnv, codexHome: string): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(source)) {
    const canonicalName = name.toUpperCase();
    if (
      value !== undefined &&
      !seen.has(canonicalName) &&
      (SAFE_ENVIRONMENT_NAMES.has(canonicalName) || canonicalName.startsWith('LC_'))
    ) {
      environment[name] = value;
      seen.add(canonicalName);
    }
  }
  environment.CODEX_HOME = codexHome;
  return environment;
};

const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readString = (value: unknown, key: string): string | undefined => {
  if (!isObject(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : undefined;
};

const classifyProviderFailure = (value: unknown, fallback: NliErrorCode = 'NLI_PROVIDER_FAILED'): NliProviderError => {
  const text = isObject(value)
    ? `${typeof value.code === 'number' ? value.code : ''} ${typeof value.message === 'string' ? value.message : ''}`
    : '';
  if (isObject(value) && value.code === -32601) return providerError('NLI_CODEX_INCOMPATIBLE');
  if (/\b401\b|unauthenticated|unauthorized/i.test(text)) return providerError('NLI_AUTH_REQUIRED');
  if (/\b429\b|rate.?limit|too many requests/i.test(text)) return providerError('NLI_RATE_LIMIT');
  if (/keyring|credential store|secure storage/i.test(text)) return providerError('NLI_KEYRING_UNAVAILABLE');
  if (/offline|network|connect|dns|timed? out/i.test(text)) return providerError('NLI_OFFLINE');
  return providerError(fallback);
};

const accountState = (response: unknown): NliAuthState => {
  if (!isObject(response) || typeof response.requiresOpenaiAuth !== 'boolean') {
    throw providerError('NLI_CODEX_INCOMPATIBLE');
  }
  if (!isObject(response.account)) return {status: 'signed-out'};
  const accountType = readString(response.account, 'type');
  if (accountType !== 'chatgpt') throw providerError('NLI_CODEX_INCOMPATIBLE');
  return {
    status: 'signed-in',
    accountLabel: readString(response.account, 'email')
  };
};

const extractTurnResult = (params: unknown): unknown => {
  if (!isObject(params) || !isObject(params.turn)) throw providerError('NLI_VALIDATION_FAILED');
  const turn = params.turn;
  if (turn.status !== 'completed' || !Array.isArray(turn.items)) {
    throw classifyProviderFailure(turn.error, 'NLI_PROVIDER_FAILED');
  }
  const messages = turn.items.filter(
    (item): item is JsonObject => isObject(item) && item.type === 'agentMessage' && typeof item.text === 'string'
  );
  if (messages.length === 0) throw providerError('NLI_VALIDATION_FAILED');
  try {
    return JSON.parse(messages[messages.length - 1].text as string) as unknown;
  } catch (_error) {
    throw providerError('NLI_VALIDATION_FAILED');
  }
};

export class CodexAppServerProvider implements NliProvider {
  private readonly options: CodexAppServerProviderOptions;
  private readonly fileSystem: NliCodexFileSystem;
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private nextRequestId = 0;
  private stdoutBuffer = '';
  private disposed = false;
  private loginId: string | null = null;
  private pending = new Map<string, PendingRequest>();
  private notificationWaiters = new Map<string, Set<NotificationWaiter>>();
  private recentNotifications = new Map<string, unknown[]>();
  private activeInterpretations = new Set<AbortController>();
  private children = new Set<ChildProcessWithoutNullStreams>();
  private emptyCwd: string | null = null;
  private emptyCwds = new Set<string>();

  constructor(options: CodexAppServerProviderOptions) {
    this.options = options;
    this.fileSystem = options.fileSystem || fs;
  }

  async getAuthStatus(signal?: AbortSignal): Promise<NliAuthState> {
    await this.ensureReady();
    return accountState(await this.request('account/read', {refreshToken: false}, signal));
  }

  async login(signal?: AbortSignal): Promise<NliAuthState> {
    await this.ensureReady();
    const response = await this.request(
      'account/login/start',
      {
        type: 'chatgpt',
        codexStreamlinedLogin: true,
        useHostedLoginSuccessPage: true
      },
      signal
    );
    if (
      !isObject(response) ||
      response.type !== 'chatgpt' ||
      typeof response.authUrl !== 'string' ||
      typeof response.loginId !== 'string'
    ) {
      throw providerError('NLI_CODEX_INCOMPATIBLE');
    }
    let authUrl: URL;
    try {
      authUrl = new URL(response.authUrl);
    } catch (_error) {
      throw providerError('NLI_CODEX_INCOMPATIBLE');
    }
    if (authUrl.protocol !== 'https:') throw providerError('NLI_CODEX_INCOMPATIBLE');
    this.loginId = response.loginId;
    const completion = this.waitForNotification(
      'account/login/completed',
      (params) =>
        isObject(params) &&
        typeof params.success === 'boolean' &&
        (params.loginId === undefined || params.loginId === null || params.loginId === response.loginId),
      signal
    );
    try {
      await this.options.openExternal(authUrl.toString());
      await completion;
      return this.getAuthStatus(signal);
    } catch (error) {
      void completion.catch(() => undefined);
      if (error instanceof NliProviderError && error.code === 'NLI_TIMEOUT' && !signal?.aborted) {
        const recovered = await this.getAuthStatus(signal).catch(() => null);
        if (recovered?.status === 'signed-in') return recovered;
      }
      if (this.loginId && this.child) {
        await this.request('account/login/cancel', {loginId: this.loginId}).catch(() => undefined);
      }
      throw error;
    } finally {
      this.loginId = null;
    }
  }

  async cancelLogin(): Promise<void> {
    if (!this.loginId || !this.child) return;
    const loginId = this.loginId;
    this.loginId = null;
    await this.request('account/login/cancel', {loginId});
  }

  async logout(): Promise<void> {
    await this.ensureReady();
    await this.request('account/logout', null);
  }

  async interpret(context: NliInterpretationContext, signal: AbortSignal): Promise<NliProviderResult> {
    await this.ensureReady();
    if (signal.aborted) throw providerError('NLI_CANCELLED');
    const deadline = new AbortController();
    const timeout = setTimeout(() => deadline.abort(providerError('NLI_TIMEOUT')), this.options.requestTimeoutMs);
    const cancel = () => deadline.abort(providerError('NLI_CANCELLED'));
    signal.addEventListener('abort', cancel, {once: true});
    this.activeInterpretations.add(deadline);
    let threadId: string | undefined;
    let turnId: string | undefined;
    try {
      const threadResponse = await this.request(
        'thread/start',
        {
          approvalPolicy: 'never',
          baseInstructions:
            'Return only JSON matching the supplied output schema. Propose PowerShell commands only. Never use tools, files, shell execution, network search, skills, plugins, or additional user input.',
          cwd: this.emptyCwd,
          dynamicTools: [],
          environments: [],
          ephemeral: true,
          runtimeWorkspaceRoots: [],
          sandbox: 'readOnly'
        },
        deadline.signal
      );
      threadId = readString(isObject(threadResponse) ? threadResponse.thread : undefined, 'id');
      if (!threadId) throw providerError('NLI_CODEX_INCOMPATIBLE');
      const outputSchema = JSON.parse(JSON.stringify(NLI_PROVIDER_OUTPUT_SCHEMA)) as JsonObject;
      const planSchema = (outputSchema.oneOf as JsonObject[])[0];
      const properties = planSchema.properties as JsonObject;
      const options = properties.options as JsonObject;
      options.maxItems = Math.max(1, Math.min(3, this.options.maxOptions));
      const turnResponse = await this.request(
        'turn/start',
        {
          threadId,
          input: [{type: 'text', text: JSON.stringify(context)}],
          cwd: this.emptyCwd,
          approvalPolicy: 'never',
          environments: [],
          runtimeWorkspaceRoots: [],
          outputSchema
        },
        deadline.signal
      );
      turnId = readString(isObject(turnResponse) ? turnResponse.turn : undefined, 'id');
      if (!turnId) throw providerError('NLI_CODEX_INCOMPATIBLE');
      const completion = await this.waitForNotification(
        'turn/completed',
        (params) => readString(isObject(params) ? params.turn : undefined, 'id') === turnId,
        deadline.signal
      );
      return validateCommandPlan(extractTurnResult(completion), this.options.maxOptions);
    } catch (error) {
      if (threadId && turnId && this.child) {
        void this.request('turn/interrupt', {threadId, turnId}).catch(() => undefined);
      }
      if (deadline.signal.aborted) {
        throw deadline.signal.reason instanceof NliProviderError
          ? deadline.signal.reason
          : providerError(signal.aborted ? 'NLI_CANCELLED' : 'NLI_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      this.activeInterpretations.delete(deadline);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const error = providerError('NLI_CANCELLED');
    this.rejectAll(error);
    this.activeInterpretations.forEach((controller) => controller.abort());
    this.activeInterpretations.clear();
    const starting = this.starting;
    this.child = null;
    await Promise.all([...this.children].map((child) => this.terminateChild(child)));
    if (starting) await starting.catch(() => undefined);
    for (const emptyCwd of this.emptyCwds) {
      await this.fileSystem.rm(emptyCwd, {recursive: true, force: true}).catch(() => undefined);
    }
    this.emptyCwds.clear();
    this.emptyCwd = null;
  }

  private async ensureReady(): Promise<void> {
    if (this.disposed) throw providerError('NLI_CANCELLED');
    if (this.child) return;
    if (!this.starting) {
      this.starting = this.start().finally(() => {
        this.starting = null;
      });
    }
    await this.starting;
  }

  private async start(): Promise<void> {
    const root = join(this.options.userDataPath, 'nli');
    const codexHome = join(root, 'codex-home');
    const runtimeRoot = join(root, 'codex-runtime');
    let emptyCwd: string;
    try {
      await this.fileSystem.mkdir(codexHome, {recursive: true, mode: 0o700});
      await this.fileSystem.mkdir(runtimeRoot, {recursive: true, mode: 0o700});
      emptyCwd = await this.fileSystem.mkdtemp(join(runtimeRoot, 'session-'));
      if ((await this.fileSystem.readdir(emptyCwd)).length !== 0) throw providerError('NLI_CODEX_INCOMPATIBLE');
      const configPath = join(codexHome, 'config.toml');
      await this.fileSystem.writeFile(configPath, CODEX_APP_SERVER_CONFIG, {
        encoding: 'utf8',
        mode: 0o600
      });
      await this.fileSystem.chmod(codexHome, 0o700);
      await this.fileSystem.chmod(configPath, 0o600);
    } catch (error) {
      if (error instanceof NliProviderError) throw error;
      throw providerError('NLI_USERDATA_UNWRITABLE');
    }
    this.emptyCwd = emptyCwd;
    this.emptyCwds.add(emptyCwd);
    if (this.disposed) {
      await this.fileSystem.rm(emptyCwd, {recursive: true, force: true}).catch(() => undefined);
      this.emptyCwds.delete(emptyCwd);
      this.emptyCwd = null;
      throw providerError('NLI_CANCELLED');
    }
    const environment = createCodexChildEnvironment(this.options.environment || process.env, codexHome);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.options.childProcessFactory.spawn(
        this.options.executable,
        ['app-server', '--stdio', '--strict-config'],
        {
          cwd: emptyCwd,
          env: environment,
          shell: false,
          windowsHide: true,
          stdio: 'pipe'
        }
      );
    } catch (error) {
      throw this.classifySpawnError(error);
    }
    this.child = child;
    this.children.add(child);
    this.stdoutBuffer = '';
    child.stdout.on('data', (chunk: Buffer | string) => this.onStdout(child, chunk));
    child.stderr.on('data', () => undefined);
    child.on('error', (error) => this.onChildFailure(child, this.classifySpawnError(error)));
    child.on('close', () => {
      this.children.delete(child);
      this.onChildFailure(child, providerError('NLI_CODEX_CRASHED'));
    });

    try {
      const initialized = await this.request('initialize', {
        clientInfo: {
          name: 'hyper-nli',
          title: 'Hyper Natural Language Interface',
          version: '1.0.0'
        },
        capabilities: {experimentalApi: true}
      });
      if (!isObject(initialized)) throw providerError('NLI_CODEX_INCOMPATIBLE');
      this.notify('initialized', {});
      const config = await this.request('config/read', {cwd: emptyCwd, includeLayers: true});
      const missingFeatures = this.getMissingIsolatedFeatures(config);
      if (!missingFeatures) throw providerError('NLI_CODEX_INCOMPATIBLE');
      if (missingFeatures.length > 0) {
        const features = await this.request('experimentalFeature/list', {limit: 200});
        if (!this.isIsolatedFeatureList(features, missingFeatures)) {
          throw providerError('NLI_CODEX_INCOMPATIBLE');
        }
      }
    } catch (error) {
      const failure = error instanceof NliProviderError ? error : providerError('NLI_CODEX_INCOMPATIBLE');
      this.onChildFailure(child, failure);
      throw failure;
    }
  }

  private getMissingIsolatedFeatures(configResponse: unknown): readonly string[] | undefined {
    if (!isObject(configResponse) || !isObject(configResponse.config)) return undefined;
    const config = configResponse.config;
    if (
      config.approval_policy !== 'never' ||
      (config.sandbox_mode !== 'read-only' && config.sandbox_mode !== 'readOnly') ||
      config.web_search !== 'disabled'
    ) {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(config, 'cli_auth_credentials_store')) {
      if (config.cli_auth_credentials_store !== 'keyring') return undefined;
    } else {
      if (!Array.isArray(configResponse.layers)) return undefined;
      const credentialStores = configResponse.layers.flatMap((layer) => {
        if (
          !isObject(layer) ||
          !isObject(layer.config) ||
          !Object.prototype.hasOwnProperty.call(layer.config, 'cli_auth_credentials_store')
        ) {
          return [];
        }
        return [layer.config.cli_auth_credentials_store];
      });
      if (credentialStores.length === 0 || credentialStores.some((value) => value !== 'keyring')) {
        return undefined;
      }
    }

    let features: JsonObject = {};
    if (Object.prototype.hasOwnProperty.call(config, 'features')) {
      if (!isObject(config.features)) return undefined;
      features = config.features;
    }
    const missingFeatures: string[] = [];
    for (const name of REQUIRED_FEATURES) {
      if (Object.prototype.hasOwnProperty.call(features, name)) {
        if (features[name] !== false) return undefined;
      } else {
        missingFeatures.push(name);
      }
    }
    return missingFeatures;
  }

  private isIsolatedFeatureList(featureResponse: unknown, requiredFeatures: readonly string[]): boolean {
    if (!isObject(featureResponse)) return false;
    const features = featureResponse.data;
    if (!Array.isArray(features)) return false;
    return requiredFeatures.every((name) => {
      const matching = features.filter((feature: unknown) => isObject(feature) && feature.name === name);
      return matching.length > 0 && matching.every((feature) => feature.enabled === false);
    });
  }

  private request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!this.child) return Promise.reject(providerError('NLI_CODEX_CRASHED'));
    if (signal?.aborted) return Promise.reject(providerError('NLI_CANCELLED'));
    const id = String(++this.nextRequestId);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(providerError('NLI_TIMEOUT'));
      }, this.options.requestTimeoutMs);
      const abort = signal
        ? () => {
            const pending = this.pending.get(id);
            if (!pending) return;
            clearTimeout(pending.timeout);
            this.pending.delete(id);
            reject(signal.reason instanceof NliProviderError ? signal.reason : providerError('NLI_CANCELLED'));
          }
        : undefined;
      if (abort) signal!.addEventListener('abort', abort, {once: true});
      this.pending.set(id, {resolve, reject, timeout, abort});
      try {
        this.write({id, method, params});
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : providerError('NLI_CODEX_CRASHED'));
      }
    });
  }

  private notify(method: string, params: unknown): void {
    this.write({method, params});
  }

  private write(message: JsonObject): void {
    if (!this.child || this.child.stdin.destroyed) throw providerError('NLI_CODEX_CRASHED');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onStdout(child: ChildProcessWithoutNullStreams, chunk: Buffer | string): void {
    if (child !== this.child) return;
    this.stdoutBuffer += chunk.toString();
    if (Buffer.byteLength(this.stdoutBuffer, 'utf8') > MAX_JSONL_BYTES) {
      this.onChildFailure(child, providerError('NLI_CODEX_INCOMPATIBLE'));
      return;
    }
    for (;;) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).replace(/\r$/, '');
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch (_error) {
        this.onChildFailure(child, providerError('NLI_CODEX_INCOMPATIBLE'));
        return;
      }
      this.onMessage(message);
    }
  }

  private onMessage(message: unknown): void {
    if (!isObject(message)) {
      if (this.child) this.onChildFailure(this.child, providerError('NLI_CODEX_INCOMPATIBLE'));
      return;
    }
    if ((typeof message.id === 'string' || typeof message.id === 'number') && typeof message.method === 'string') {
      this.write({
        id: message.id,
        error: {code: -32601, message: 'Client capabilities disabled'}
      });
      if (this.child) this.onChildFailure(this.child, providerError('NLI_CODEX_INCOMPATIBLE'));
      return;
    }
    if (typeof message.id === 'string' || typeof message.id === 'number') {
      const id = String(message.id);
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      if (pending.abort) {
        // AbortSignal listeners use once:true and become inert after request settlement.
      }
      if (isObject(message.error)) pending.reject(classifyProviderFailure(message.error));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method === 'string') this.receiveNotification(message.method, message.params);
  }

  private receiveNotification(method: string, params: unknown): void {
    if (method === 'error') {
      const error = classifyProviderFailure(isObject(params) && isObject(params.error) ? params.error : params);
      this.rejectAll(error);
      this.activeInterpretations.forEach((controller) => controller.abort(error));
      return;
    }
    const waiters = this.notificationWaiters.get(method);
    let handled = false;
    if (waiters) {
      for (const waiter of [...waiters]) {
        if (!waiter.predicate(params)) continue;
        handled = true;
        waiters.delete(waiter);
        clearTimeout(waiter.timeout);
        waiter.resolve(params);
      }
      if (waiters.size === 0) this.notificationWaiters.delete(method);
    }
    if (!handled) {
      const recent = this.recentNotifications.get(method) || [];
      recent.push(params);
      this.recentNotifications.set(method, recent.slice(-8));
    }
  }

  private waitForNotification(
    method: string,
    predicate: (params: unknown) => boolean,
    signal?: AbortSignal
  ): Promise<unknown> {
    const recent = this.recentNotifications.get(method) || [];
    const existingIndex = recent.findIndex(predicate);
    if (existingIndex >= 0) {
      const [existing] = recent.splice(existingIndex, 1);
      return Promise.resolve(existing);
    }
    if (signal?.aborted) return Promise.reject(providerError('NLI_CANCELLED'));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(waiter);
        reject(providerError('NLI_TIMEOUT'));
      }, this.options.requestTimeoutMs);
      const abort = signal
        ? () => {
            waiters.delete(waiter);
            clearTimeout(timeout);
            reject(signal.reason instanceof NliProviderError ? signal.reason : providerError('NLI_CANCELLED'));
          }
        : undefined;
      const waiter: NotificationWaiter = {
        predicate,
        resolve,
        reject,
        timeout,
        abort
      };
      const waiters = this.notificationWaiters.get(method) || new Set<NotificationWaiter>();
      waiters.add(waiter);
      this.notificationWaiters.set(method, waiters);
      if (abort) signal!.addEventListener('abort', abort, {once: true});
    });
  }

  private onChildFailure(child: ChildProcessWithoutNullStreams, error: NliProviderError): void {
    if (child !== this.child) return;
    this.child = null;
    this.stdoutBuffer = '';
    this.rejectAll(error);
    this.activeInterpretations.forEach((controller) => controller.abort(error));
    if (!child.killed) child.kill();
  }

  private rejectAll(error: NliProviderError): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    for (const waiters of this.notificationWaiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(error);
      }
    }
    this.notificationWaiters.clear();
    this.recentNotifications.clear();
  }

  private classifySpawnError(error: unknown): NliProviderError {
    if (isObject(error) && error.code === 'ENOENT') return providerError('NLI_CODEX_MISSING');
    return classifyProviderFailure(error, 'NLI_CODEX_CRASHED');
  }

  private terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null && child.exitCode !== undefined) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        child.removeListener('close', finish);
        resolve();
      };
      const timeout = setTimeout(finish, 1000);
      child.once('close', finish);
      if (!child.killed) child.kill();
    });
  }
}
