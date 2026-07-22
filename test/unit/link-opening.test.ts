import {EventEmitter} from 'events';
import {readFileSync} from 'fs';
import {resolve} from 'path';

import type {BrowserWindow, BrowserWindowConstructorOptions, DidCreateWindowDetails} from 'electron';

import test from 'ava';

import {
  LinkOpeningController,
  SYSTEM_LINK_BRIDGE_TIMEOUT_MS,
  classifyLinkTarget,
  createOwnerRecovery,
  resolveWebLinksOpenMode
} from '../../app/utils/link-opening';

type Proxyquire = (request: string, stubs: Record<string, unknown>) => unknown;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const proxyquireModule = require('proxyquire') as {noCallThru(): Proxyquire};
const proxyquire = proxyquireModule.noCallThru();

class FakeNavigationEvent {
  defaultPrevented = false;
  preventDefault() {
    this.defaultPrevented = true;
  }
}

class FakeWebContents extends EventEmitter {
  destroyed = false;
  focusCalls = 0;
  windowOpenHandler?: (details: {url: string}) => unknown;

  setWindowOpenHandler(handler: (details: {url: string}) => unknown) {
    this.windowOpenHandler = handler;
  }

  isDestroyed() {
    return this.destroyed;
  }

  focus() {
    this.focusCalls++;
  }
}

class FakeWindow extends EventEmitter {
  readonly webContents = new FakeWebContents();
  destroyed = false;
  minimized = false;
  visible = true;
  destroyCalls = 0;
  hideCalls = 0;
  restoreCalls = 0;
  showCalls = 0;
  focusCalls = 0;
  loadURLs: string[] = [];

  isDestroyed() {
    return this.destroyed;
  }

  isMinimized() {
    return this.minimized;
  }

  isVisible() {
    return this.visible;
  }

  restore() {
    this.minimized = false;
    this.restoreCalls++;
  }

  show() {
    this.visible = true;
    this.showCalls++;
  }

  hide() {
    this.visible = false;
    this.hideCalls++;
  }

  focus() {
    this.focusCalls++;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.destroyCalls++;
    this.emit('closed');
  }

  loadURL(url: string) {
    this.loadURLs.push(url);
    return Promise.resolve();
  }
}

const asBrowserWindow = (window: FakeWindow) => window as unknown as BrowserWindow;
const flush = () => new Promise<void>((resolveFlush) => setImmediate(resolveFlush));

const makeHarness = () => {
  const owner = new FakeWindow();
  const created: Array<{
    window: FakeWindow;
    options: BrowserWindowConstructorOptions;
  }> = [];
  const externalURLs: string[] = [];
  const errors: string[] = [];
  const notifications: string[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  let mode: unknown = 'system';
  let rejectExternal = false;
  const controller = new LinkOpeningController({
    owner: asBrowserWindow(owner),
    getMode: () => mode,
    createWindow: (options) => {
      const window = new FakeWindow();
      created.push({window, options});
      return asBrowserWindow(window);
    },
    openExternal: (url) => {
      externalURLs.push(url);
      return rejectExternal ? Promise.reject(new Error(`secret failure for ${url}`)) : Promise.resolve();
    },
    reportOpenFailure: (message) => errors.push(message),
    notifyOpenFailure: (message) => notifications.push(message),
    setTimer: (callback) => {
      const handle = nextTimer++;
      timers.set(handle, callback);
      return handle;
    },
    clearTimer: (handle) => timers.delete(handle as number)
  });
  return {
    owner,
    controller,
    created,
    externalURLs,
    errors,
    notifications,
    timers,
    setMode(value: unknown) {
      mode = value;
    },
    rejectExternal() {
      rejectExternal = true;
    }
  };
};

const createdDetails = (url: string, options: BrowserWindowConstructorOptions): DidCreateWindowDetails =>
  ({url, options}) as DidCreateWindowDetails;

test('URL and config decisions fail closed and default to the system browser', (t) => {
  t.is(classifyLinkTarget('https://example.test/path'), 'web');
  t.is(classifyLinkTarget('http://example.test'), 'web');
  t.is(classifyLinkTarget('about:blank'), 'blank');
  for (const value of ['file:///private.txt', 'javascript:alert(1)', 'not a URL', '', undefined]) {
    t.is(classifyLinkTarget(value), 'deny');
  }
  t.is(resolveWebLinksOpenMode('internal'), 'internal');
  for (const value of ['system', 'invalid', undefined, null]) {
    t.is(resolveWebLinksOpenMode(value), 'system');
  }
});

test('window.open policy covers direct system, hidden bridge, internal, and deny outcomes', async (t) => {
  const harness = makeHarness();
  const system = harness.controller.handleWindowOpen({
    url: 'https://example.test'
  });
  t.deepEqual(system, {action: 'deny'});
  await flush();
  t.deepEqual(harness.externalURLs, ['https://example.test']);
  t.is(harness.created.length, 0);

  const bridge = harness.controller.handleWindowOpen({url: 'about:blank'});
  t.is(bridge.action, 'allow');
  if (bridge.action === 'allow') {
    t.false(bridge.outlivesOpener);
    t.false(bridge.overrideBrowserWindowOptions.show);
    t.is(bridge.overrideBrowserWindowOptions.parent, asBrowserWindow(harness.owner));
    t.deepEqual(bridge.overrideBrowserWindowOptions.webPreferences, {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      navigateOnDragDrop: false
    });
  }

  t.deepEqual(harness.controller.handleWindowOpen({url: 'file:///private.txt'}), {action: 'deny'});
  harness.setMode('internal');
  for (const url of ['https://example.test/internal', 'about:blank']) {
    const internal = harness.controller.handleWindowOpen({url});
    t.is(internal.action, 'allow');
    if (internal.action === 'allow') {
      t.false(internal.outlivesOpener);
      t.true(internal.overrideBrowserWindowOptions.show);
      t.false(internal.overrideBrowserWindowOptions.webPreferences?.nodeIntegration);
      t.true(internal.overrideBrowserWindowOptions.webPreferences?.contextIsolation);
      t.true(internal.overrideBrowserWindowOptions.webPreferences?.sandbox);
    }
  }
});

test('typed RPC launches externally by default and directly creates one managed internal child', async (t) => {
  const harness = makeHarness();
  t.true(harness.controller.openLink('https://example.test/system'));
  await flush();
  t.deepEqual(harness.externalURLs, ['https://example.test/system']);
  t.is(harness.created.length, 0);
  t.false(harness.controller.openLink('about:blank'));

  harness.setMode('internal');
  t.true(harness.controller.openLink('https://example.test/internal'));
  t.is(harness.created.length, 1);
  const [{window, options}] = harness.created;
  t.deepEqual(window.loadURLs, ['https://example.test/internal']);
  t.true(options.show);
  t.is(options.parent, asBrowserWindow(harness.owner));
  t.deepEqual(options.webPreferences, {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    navigateOnDragDrop: false
  });
  t.truthy(window.webContents.windowOpenHandler);
});

test('internal children deny unsupported navigation and recursively govern nested popups', async (t) => {
  const harness = makeHarness();
  harness.setMode('internal');
  const response = harness.controller.handleWindowOpen({
    url: 'https://example.test/child'
  });
  t.is(response.action, 'allow');
  const child = new FakeWindow();
  harness.controller.handleCreatedWindow(
    asBrowserWindow(child),
    createdDetails(
      'https://example.test/child',
      response.action === 'allow' ? response.overrideBrowserWindowOptions : {}
    )
  );

  const deniedNavigation = new FakeNavigationEvent();
  child.webContents.emit('will-navigate', deniedNavigation, 'file:///private.txt');
  t.true(deniedNavigation.defaultPrevented);
  const safeNavigation = new FakeNavigationEvent();
  child.webContents.emit('will-navigate', safeNavigation, 'https://example.test/next');
  t.false(safeNavigation.defaultPrevented);

  const nested = child.webContents.windowOpenHandler?.({
    url: 'https://example.test/nested'
  }) as {
    action: string;
    overrideBrowserWindowOptions?: BrowserWindowConstructorOptions;
  };
  t.is(nested.action, 'allow');
  t.false(nested.overrideBrowserWindowOptions?.webPreferences?.nodeIntegration);
  harness.setMode('system');
  t.deepEqual(child.webContents.windowOpenHandler?.({url: 'javascript:alert(1)'}), {action: 'deny'});
  t.deepEqual(
    child.webContents.windowOpenHandler?.({
      url: 'https://example.test/external'
    }),
    {action: 'deny'}
  );
  await flush();
  t.deepEqual(harness.externalURLs, ['https://example.test/external']);
});

test('system about:blank bridge stays hidden, launches once, and cleans up on navigation or timeout', async (t) => {
  const safeHarness = makeHarness();
  const response = safeHarness.controller.handleWindowOpen({
    url: 'about:blank'
  });
  t.is(response.action, 'allow');
  const bridge = new FakeWindow();
  bridge.visible = false;
  safeHarness.controller.handleCreatedWindow(
    asBrowserWindow(bridge),
    createdDetails('about:blank', response.action === 'allow' ? response.overrideBrowserWindowOptions : {})
  );
  t.is(safeHarness.timers.size, 1);
  bridge.emit('show');
  t.is(bridge.hideCalls, 1);
  const navigation = new FakeNavigationEvent();
  bridge.webContents.emit('will-navigate', navigation, 'https://example.test/from-bridge');
  t.true(navigation.defaultPrevented);
  await flush();
  t.deepEqual(safeHarness.externalURLs, ['https://example.test/from-bridge']);
  t.is(bridge.destroyCalls, 1);
  t.is(safeHarness.timers.size, 0);

  const deniedHarness = makeHarness();
  const deniedResponse = deniedHarness.controller.handleWindowOpen({
    url: 'about:blank'
  });
  const deniedBridge = new FakeWindow();
  deniedHarness.controller.handleCreatedWindow(
    asBrowserWindow(deniedBridge),
    createdDetails('about:blank', deniedResponse.action === 'allow' ? deniedResponse.overrideBrowserWindowOptions : {})
  );
  const denied = new FakeNavigationEvent();
  deniedBridge.webContents.emit('will-navigate', denied, 'file:///private.txt');
  t.true(denied.defaultPrevented);
  t.deepEqual(deniedHarness.externalURLs, []);
  t.true(deniedBridge.destroyed);

  const timeoutHarness = makeHarness();
  const timeoutResponse = timeoutHarness.controller.handleWindowOpen({
    url: 'about:blank'
  });
  const timedBridge = new FakeWindow();
  timeoutHarness.controller.handleCreatedWindow(
    asBrowserWindow(timedBridge),
    createdDetails(
      'about:blank',
      timeoutResponse.action === 'allow' ? timeoutResponse.overrideBrowserWindowOptions : {}
    )
  );
  t.is(SYSTEM_LINK_BRIDGE_TIMEOUT_MS, 5000);
  [...timeoutHarness.timers.values()][0]();
  t.true(timedBridge.destroyed);
});

test('external launch failure is caught, redacted, and recoverable', async (t) => {
  const harness = makeHarness();
  const secretURL = 'https://example.test/private?token=do-not-log';
  harness.rejectExternal();
  t.true(harness.controller.openLink(secretURL));
  await flush();
  await flush();
  t.is(harness.errors.length, 1);
  t.is(harness.notifications.length, 1);
  t.false(harness.errors[0].includes(secretURL));
  t.false(harness.notifications[0].includes(secretURL));
  t.false(harness.owner.destroyed);
});

test('owner recovery is idempotent and preserves the existing owner', (t) => {
  const owner = new FakeWindow();
  owner.minimized = true;
  owner.visible = false;
  const recover = createOwnerRecovery(asBrowserWindow(owner));
  recover();
  recover();
  t.is(owner.restoreCalls, 1);
  t.is(owner.showCalls, 1);
  t.is(owner.focusCalls, 1);
  t.is(owner.webContents.focusCalls, 1);
  t.false(owner.destroyed);
});

test('default config and profile merge retain system default and explicit internal opt-in', (t) => {
  const defaultConfig = JSON.parse(
    readFileSync(resolve(__dirname, '../../app/config/config-default.json'), 'utf8')
  ) as {config: {webLinksOpenMode: string}};
  const configInit = proxyquire('../../app/config/init', {
    '../notify': () => undefined
  }) as {
    _init: (
      userConfig: unknown,
      defaults: unknown
    ) => {
      config: {
        webLinksOpenMode: string;
        profiles: Array<{config: {webLinksOpenMode?: string}}>;
      };
    };
  };
  const omitted = configInit._init({config: {profiles: [{name: 'default', config: {}}]}}, defaultConfig);
  t.is(omitted.config.webLinksOpenMode, 'system');
  const optedIn = configInit._init(
    {
      config: {
        profiles: [{name: 'default', config: {webLinksOpenMode: 'internal'}}]
      }
    },
    defaultConfig
  );
  t.is(optedIn.config.webLinksOpenMode, 'system');
  t.is(optedIn.config.profiles[0].config.webLinksOpenMode, 'internal');
});

test('core renderer links use typed policy RPC while explicit external compatibility remains', (t) => {
  const term = readFileSync(resolve(__dirname, '../../lib/components/term.tsx'), 'utf8');
  const notifications = readFileSync(resolve(__dirname, '../../lib/components/notifications.tsx'), 'utf8');
  const windowSource = readFileSync(resolve(__dirname, '../../app/ui/window.ts'), 'utf8');
  t.regex(term, /window\.rpc\.emit\('open link', \{url: uri\}\)/);
  t.false(term.includes('shell.openExternal(uri)'));
  t.regex(notifications, /window\.rpc\.emit\('open link', \{url:/);
  t.false(notifications.includes("window.require('electron').shell.openExternal"));
  t.regex(windowSource, /rpc\.on\('open link'/);
  t.regex(windowSource, /rpc\.on\('open external',[\s\S]*?shell\.openExternal/);
});
