import type {BrowserWindow, BrowserWindowConstructorOptions, DidCreateWindowDetails} from 'electron';

export const SYSTEM_LINK_BRIDGE_TIMEOUT_MS = 5000;

export type WebLinksOpenMode = 'system' | 'internal';
export type LinkTargetKind = 'web' | 'blank' | 'deny';

export type LinkWindowOpenResponse =
  | {action: 'deny'}
  | {
      action: 'allow';
      outlivesOpener: false;
      overrideBrowserWindowOptions: BrowserWindowConstructorOptions;
    };

interface LinkOpeningControllerOptions {
  readonly owner: BrowserWindow;
  readonly getMode: () => unknown;
  readonly createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly reportOpenFailure: (message: string) => void;
  readonly notifyOpenFailure: (message: string) => void;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export const resolveWebLinksOpenMode = (value: unknown): WebLinksOpenMode =>
  value === 'internal' ? 'internal' : 'system';

export const classifyLinkTarget = (value: unknown): LinkTargetKind => {
  if (typeof value !== 'string' || value.length === 0) return 'deny';
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return 'web';
    if (url.href === 'about:blank') return 'blank';
  } catch (_error) {
    // Invalid links are denied without surfacing their potentially sensitive value.
  }
  return 'deny';
};

const secureChildOptions = (owner: BrowserWindow, show: boolean): BrowserWindowConstructorOptions => ({
  parent: owner,
  show,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    navigateOnDragDrop: false
  }
});

const destroyWindow = (window: BrowserWindow) => {
  if (!window.isDestroyed()) window.destroy();
};

export const createOwnerRecovery = (owner: BrowserWindow) => {
  let recovered = false;
  return () => {
    if (recovered || owner.isDestroyed()) return;
    recovered = true;
    if (owner.isMinimized()) owner.restore();
    if (!owner.isVisible()) owner.show();
    owner.focus();
    if (!owner.webContents.isDestroyed()) owner.webContents.focus();
  };
};

export class LinkOpeningController {
  private readonly options: LinkOpeningControllerOptions;
  private readonly managedWindows = new WeakSet<BrowserWindow>();
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(options: LinkOpeningControllerOptions) {
    this.options = options;
    this.setTimer = options.setTimer || ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer || ((handle) => clearTimeout(handle as NodeJS.Timeout));
  }

  openLink(url: string): boolean {
    if (classifyLinkTarget(url) !== 'web') return false;
    if (this.mode() === 'system') {
      this.launchExternal(url);
      return true;
    }

    const child = this.options.createWindow(secureChildOptions(this.options.owner, true));
    this.manageInternalChild(child);
    void child.loadURL(url).catch(() => destroyWindow(child));
    return true;
  }

  handleWindowOpen({url}: {url: string}): LinkWindowOpenResponse {
    const target = classifyLinkTarget(url);
    if (target === 'deny') return {action: 'deny'};

    if (this.mode() === 'system') {
      if (target === 'web') {
        this.launchExternal(url);
        return {action: 'deny'};
      }
      return this.allowResponse(false);
    }

    return this.allowResponse(true);
  }

  handleCreatedWindow(child: BrowserWindow, details: Pick<DidCreateWindowDetails, 'url' | 'options'>): void {
    if (this.managedWindows.has(child)) return;
    const target = classifyLinkTarget(details.url);
    if (target === 'deny') {
      destroyWindow(child);
      return;
    }
    if (target === 'blank' && details.options.show === false) {
      this.manageSystemBridge(child);
      return;
    }
    this.manageInternalChild(child);
  }

  private mode() {
    return resolveWebLinksOpenMode(this.options.getMode());
  }

  private allowResponse(show: boolean): LinkWindowOpenResponse {
    return {
      action: 'allow',
      outlivesOpener: false,
      overrideBrowserWindowOptions: secureChildOptions(this.options.owner, show)
    };
  }

  private launchExternal(url: string) {
    void Promise.resolve()
      .then(() => this.options.openExternal(url))
      .catch(() => {
        const message = 'Hyper could not open a web link in the system browser.';
        this.options.reportOpenFailure(message);
        this.options.notifyOpenFailure(message);
      });
  }

  private installChildPolicy(child: BrowserWindow) {
    child.webContents.setWindowOpenHandler((details) => this.handleWindowOpen(details));
    child.webContents.on('did-create-window', (nestedChild, details) => {
      this.handleCreatedWindow(nestedChild, details);
    });
  }

  private manageInternalChild(child: BrowserWindow) {
    if (this.managedWindows.has(child)) return;
    this.managedWindows.add(child);
    this.installChildPolicy(child);

    const preventUnsupportedNavigation = (event: Electron.Event, url: string) => {
      if (classifyLinkTarget(url) === 'deny') event.preventDefault();
    };
    child.webContents.on('will-navigate', preventUnsupportedNavigation);
    child.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
      if (isMainFrame) preventUnsupportedNavigation(event, url);
    });

    const recoverOwner = createOwnerRecovery(this.options.owner);
    const onOwnerClosed = () => destroyWindow(child);
    this.options.owner.once('closed', onOwnerClosed);
    child.once('closed', () => {
      this.options.owner.removeListener('closed', onOwnerClosed);
      recoverOwner();
    });
  }

  private manageSystemBridge(child: BrowserWindow) {
    if (this.managedWindows.has(child)) return;
    this.managedWindows.add(child);
    this.installChildPolicy(child);

    let finished = false;
    const onOwnerClosed = () => finish();
    const onShow = () => {
      if (!child.isDestroyed()) child.hide();
    };
    const cleanup = () => {
      this.clearTimer(timer);
      this.options.owner.removeListener('closed', onOwnerClosed);
      child.removeListener('show', onShow);
    };
    const finish = (url?: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (url && classifyLinkTarget(url) === 'web') this.launchExternal(url);
      destroyWindow(child);
    };

    child.on('show', onShow);
    child.once('closed', cleanup);
    this.options.owner.once('closed', onOwnerClosed);
    child.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      finish(url);
    });
    const timer = this.setTimer(() => finish(), SYSTEM_LINK_BRIDGE_TIMEOUT_MS);
  }
}
