import {existsSync} from 'fs';
import {isAbsolute, normalize, sep} from 'path';
import {URL, fileURLToPath} from 'url';

import {app, BrowserWindow, shell, Menu} from 'electron';
import type {BrowserWindowConstructorOptions, IpcMainEvent} from 'electron';

import {enable as remoteEnable} from '@electron/remote/main';
import isDev from 'electron-is-dev';
import {getWorkingDirectoryFromPID} from 'native-process-working-directory';
import {v4 as uuidv4} from 'uuid';

import type {sessionExtraOptions} from '../../typings/common';
import type {configOptions} from '../../typings/config';
import type {SessionUid, ShellSemanticEvent} from '../../typings/nli';
import {execCommand} from '../commands';
import {getDefaultProfile} from '../config';
import {icon, homeDirectory} from '../config/paths';
import {CodexAppServerProvider} from '../nli/codex-app-server';
import {cryptoNonceSource, nodeChildProcessFactory, systemClock} from '../nli/dependencies';
import {NLI_RPC_EVENTS, NLI_SESSION_EVENTS} from '../nli/events';
import {executeApprovedCommand} from '../nli/execution';
import {collectNliGitMetadata} from '../nli/git-metadata';
import {createNliPreferencesStore} from '../nli/preferences';
import {NliService} from '../nli/service';
import fetchNotifications from '../notifications';
import notify from '../notify';
import {decorateSessionOptions, decorateSessionClass} from '../plugins';
import createRPC from '../rpc';
import Session from '../session';
import updater from '../updater';
import {setRendererType, unsetRendererType} from '../utils/renderer-utils';
import toElectronBackgroundColor from '../utils/to-electron-background-color';

import contextMenuTemplate from './contextmenu';

export function newWindow(
  options_: BrowserWindowConstructorOptions,
  cfg: configOptions,
  fn?: (win: BrowserWindow) => void,
  profileName: string = getDefaultProfile()
): BrowserWindow {
  const classOpts = Object.assign({uid: uuidv4()});
  app.plugins.decorateWindowClass(classOpts);

  const winOpts: BrowserWindowConstructorOptions = {
    minWidth: 370,
    minHeight: 190,
    backgroundColor: toElectronBackgroundColor(cfg.backgroundColor || '#000'),
    titleBarStyle: 'hiddenInset',
    title: 'Hyper.app',
    // we want to go frameless on Windows and Linux
    frame: process.platform === 'darwin',
    transparent: process.platform === 'darwin',
    icon,
    show: Boolean(process.env.HYPER_DEBUG || process.env.HYPERTERM_DEBUG || isDev),
    acceptFirstMouse: true,
    webPreferences: {
      nodeIntegration: true,
      navigateOnDragDrop: true,
      contextIsolation: false
    },
    ...options_
  };
  const window = new BrowserWindow(app.plugins.getDecoratedBrowserOptions(winOpts));

  window.profileName = profileName;

  // Enable remote module on this window
  remoteEnable(window.webContents);

  window.uid = classOpts.uid;

  app.plugins.onWindowClass(window);
  window.uid = classOpts.uid;

  const rpc = createRPC(window);
  const sessions = new Map<string, Session>();
  const nliService = new NliService({
    windowUid: window.uid,
    approvalIdentity: {windowId: window.id, rendererId: window.webContents.id},
    enabled: () => cfg.naturalLanguageInterface.enabled,
    preferences: createNliPreferencesStore(app.getPath('userData')),
    providerFactory: () =>
      new CodexAppServerProvider({
        executable: cfg.naturalLanguageInterface.codexExecutable,
        userDataPath: app.getPath('userData'),
        requestTimeoutMs: cfg.naturalLanguageInterface.requestTimeoutMs,
        maxOptions: cfg.naturalLanguageInterface.maxOptions,
        childProcessFactory: nodeChildProcessFactory,
        openExternal: (url) => shell.openExternal(url)
      }),
    clock: systemClock,
    nonceSource: cryptoNonceSource,
    emitState: (state) => rpc.emit(NLI_RPC_EVENTS.state, state),
    getSessionSnapshot: (sessionUid) => {
      const session = sessions.get(sessionUid);
      const pid = session?.pty?.pid;
      if (!session || pid === undefined) return undefined;
      try {
        return {
          shell: session.shell,
          workingDirectory: getWorkingDirectoryFromPID(pid) || undefined
        };
      } catch (_error) {
        return {shell: session.shell};
      }
    },
    includeWorkingDirectory: () => cfg.naturalLanguageInterface.includeWorkingDirectory,
    includeGitMetadata: () => cfg.naturalLanguageInterface.includeGitMetadata,
    maxOptions: () => cfg.naturalLanguageInterface.maxOptions,
    collectGitMetadata: collectNliGitMetadata
  });

  const updateBackgroundColor = () => {
    const cfg_ = app.plugins.getDecoratedConfig(profileName);
    window.setBackgroundColor(toElectronBackgroundColor(cfg_.backgroundColor || '#000'));
  };

  // config changes
  const cfgUnsubscribe = app.config.subscribe(() => {
    const wasNliEnabled = cfg.naturalLanguageInterface.enabled;
    const cfg_ = app.plugins.getDecoratedConfig(profileName);

    // notify renderer
    window.webContents.send('config change');

    // notify user that shell changes require new sessions
    if (cfg_.shell !== cfg.shell || JSON.stringify(cfg_.shellArgs) !== JSON.stringify(cfg.shellArgs)) {
      notify('Shell configuration changed!', 'Open a new tab or window to start using the new shell');
    }

    // update background color if necessary
    updateBackgroundColor();

    cfg = cfg_;
    if (wasNliEnabled && !cfg.naturalLanguageInterface.enabled) {
      void nliService.setEnabled(false);
    }
  });

  rpc.on('init', () => {
    window.show();
    updateBackgroundColor();

    // If no callback is passed to createWindow,
    // a new session will be created by default.
    if (!fn) {
      fn = (win: BrowserWindow) => {
        win.rpc.emit('termgroup add req', {});
      };
    }

    // app.windowCallback is the createWindow callback
    // that can be set before the 'ready' app event
    // and createWindow definition. It's executed in place of
    // the callback passed as parameter, and deleted right after.
    (app.windowCallback || fn)(window);
    app.windowCallback = undefined;
    fetchNotifications(window);
    // auto updates
    if (!isDev) {
      updater(window);
    } else {
      console.log('ignoring auto updates during dev');
    }
  });

  function createSession(extraOptions: sessionExtraOptions = {}) {
    const uid = uuidv4();
    const extraOptionsFiltered: sessionExtraOptions = {};
    Object.keys(extraOptions).forEach((key) => {
      if (extraOptions[key] !== undefined) extraOptionsFiltered[key] = extraOptions[key];
    });

    const profile = extraOptionsFiltered.profile || profileName;
    const activeSession = extraOptionsFiltered.activeUid ? sessions.get(extraOptionsFiltered.activeUid) : undefined;
    let cwd = '';
    if (cfg.preserveCWD !== false && activeSession && activeSession.profile === profile) {
      const activePID = activeSession.pty?.pid;
      if (activePID !== undefined) {
        try {
          cwd = getWorkingDirectoryFromPID(activePID) || '';
        } catch (error) {
          console.error(error);
        }
      }
      cwd = cwd && isAbsolute(cwd) && existsSync(cwd) ? cwd : '';
    }

    const profileCfg = app.plugins.getDecoratedConfig(profile);

    // set working directory
    let argPath = process.argv[1];
    if (argPath && process.platform === 'win32') {
      if (/[a-zA-Z]:"/.test(argPath)) {
        argPath = argPath.replace('"', sep);
      }
      argPath = normalize(argPath + sep);
    }
    let workingDirectory = homeDirectory;
    if (argPath && isAbsolute(argPath)) {
      workingDirectory = argPath;
    } else if (profileCfg.workingDirectory && isAbsolute(profileCfg.workingDirectory)) {
      workingDirectory = profileCfg.workingDirectory;
    }

    // remove the rows and cols, the wrong value of them will break layout when init create
    const defaultOptions = Object.assign(
      {
        cwd: cwd || workingDirectory,
        splitDirection: undefined,
        shell: profileCfg.shell,
        shellArgs: profileCfg.shellArgs && Array.from(profileCfg.shellArgs)
      },
      extraOptionsFiltered,
      {
        profile: extraOptionsFiltered.profile || profileName,
        uid,
        windowUid: window.uid,
        nliUserDataPath: app.getPath('userData'),
        naturalLanguageInterface: profileCfg.naturalLanguageInterface
      }
    );
    const options = decorateSessionOptions(defaultOptions);
    const DecoratedSession = decorateSessionClass(Session);
    const session = new DecoratedSession(options);
    sessions.set(uid, session);
    return {session, options};
  }

  rpc.on('new', (extraOptions) => {
    const {session, options} = createSession(extraOptions);

    sessions.set(options.uid, session);
    rpc.emit('session add', {
      rows: options.rows,
      cols: options.cols,
      uid: options.uid,
      splitDirection: options.splitDirection,
      shell: session.shell,
      pid: session.pty ? session.pty.pid : null,
      activeUid: options.activeUid ?? undefined,
      profile: options.profile
    });

    session.on('data', (data: string) => {
      rpc.emit('session data', data);
    });

    session.on(NLI_SESSION_EVENTS.shellSemantic, (event: ShellSemanticEvent) => {
      nliService.onCommandNotFound(event);
    });

    session.on('exit', () => {
      nliService.disposeSession(options.uid as SessionUid);
      rpc.emit('session exit', {uid: options.uid});
      unsetRendererType(options.uid);
      sessions.delete(options.uid);
    });
  });

  rpc.on('exit', ({uid}) => {
    const session = sessions.get(uid);
    if (session) {
      session.exit();
    }
  });
  rpc.on('unmaximize', () => {
    window.unmaximize();
  });
  rpc.on('maximize', () => {
    window.maximize();
  });
  rpc.on('minimize', () => {
    window.minimize();
  });
  rpc.on('resize', ({uid, cols, rows}) => {
    const session = sessions.get(uid);
    if (session) {
      session.resize({cols, rows});
    }
  });
  rpc.on('data', ({uid, data, escaped}) => {
    const session = uid && sessions.get(uid);
    if (session) {
      if (escaped) {
        const escapedData = session.shell?.endsWith('cmd.exe')
          ? `"${data}"` // This is how cmd.exe does it
          : `'${data.replace(/'/g, `'\\''`)}'`; // Inside a single-quoted string nothing is interpreted

        session.write(escapedData);
        nliService.onUserInput(uid as SessionUid);
      } else {
        session.write(data);
        nliService.onUserInput(uid as SessionUid);
      }
    }
  });
  const isCurrentNliSender = (event: IpcMainEvent) =>
    !window.isDestroyed() && !event.sender.isDestroyed() && event.sender === window.webContents;

  rpc.onWithEvent(NLI_RPC_EVENTS.approve, (event, request) => {
    executeApprovedCommand({
      request,
      identity: {windowId: window.id, rendererId: event.sender.id},
      service: nliService,
      getSession: (sessionUid) => sessions.get(sessionUid),
      isRendererCurrent: () => isCurrentNliSender(event),
      restoreTerminalFocus: (sessionUid) => {
        rpc.emit(NLI_RPC_EVENTS.focusTerminal, {sessionUid});
      }
    });
  });
  rpc.onWithEvent(NLI_RPC_EVENTS.cancel, (event, request) => {
    if (!isCurrentNliSender(event)) return;
    nliService.cancel(request);
  });
  rpc.on(NLI_RPC_EVENTS.cancelLogin, ({sessionUid}) => {
    void nliService
      .cancelLogin()
      .then(() => rpc.emit(NLI_RPC_EVENTS.authState, {sessionUid, auth: {status: 'signed-out'}}));
  });
  rpc.on(NLI_RPC_EVENTS.clarify, (request) => {
    void nliService.clarify(request);
  });
  rpc.onWithEvent(NLI_RPC_EVENTS.edit, (event, request) => {
    if (!isCurrentNliSender(event)) return;
    nliService.edit(request);
  });
  rpc.on(NLI_RPC_EVENTS.privacy, ({sessionUid, preferences}) => {
    void nliService
      .setPrivacyPreferences(preferences)
      .then(() => nliService.login(sessionUid).then((auth) => rpc.emit(NLI_RPC_EVENTS.authState, {sessionUid, auth})));
  });
  rpc.on(NLI_RPC_EVENTS.resetPrivacy, ({sessionUid}) => {
    void nliService
      .resetPrivacyPreferences()
      .then(() => rpc.emit(NLI_RPC_EVENTS.authState, {sessionUid, auth: {status: 'unknown'}}));
  });
  rpc.on(NLI_RPC_EVENTS.reject, (request) => {
    nliService.reject(request);
  });
  rpc.on(NLI_RPC_EVENTS.retry, (request) => {
    nliService.retry(request);
  });
  rpc.on(NLI_RPC_EVENTS.login, ({sessionUid}) => {
    rpc.emit(NLI_RPC_EVENTS.authState, {sessionUid, auth: {status: 'signing-in'}});
    void nliService.login(sessionUid).then((auth) => rpc.emit(NLI_RPC_EVENTS.authState, {sessionUid, auth}));
  });
  rpc.on(NLI_RPC_EVENTS.logout, ({sessionUid}) => {
    void nliService.logout().then(() => rpc.emit(NLI_RPC_EVENTS.authState, {sessionUid, auth: {status: 'signed-out'}}));
  });
  rpc.on(NLI_RPC_EVENTS.status, ({sessionUid}) => {
    void nliService.getAuthStatus().then((auth) => rpc.emit(NLI_RPC_EVENTS.authState, {sessionUid, auth}));
  });
  rpc.on('info renderer', ({uid, type}) => {
    // Used in the "About" dialog
    setRendererType(uid, type);
  });
  rpc.on('open external', ({url}) => {
    void shell.openExternal(url);
  });
  rpc.on('open context menu', (selection) => {
    const {createWindow} = app;
    Menu.buildFromTemplate(contextMenuTemplate(createWindow, selection)).popup({window});
  });
  rpc.on('open hamburger menu', ({x, y}) => {
    Menu.getApplicationMenu()!.popup({x: Math.ceil(x), y: Math.ceil(y)});
  });
  // Same deal as above, grabbing the window titlebar when the window
  // is maximized on Windows results in unmaximize, without hitting any
  // app buttons
  const onGeometryChange = () => rpc.emit('windowGeometry change', {isMaximized: window.isMaximized()});
  window.on('maximize', onGeometryChange);
  window.on('unmaximize', onGeometryChange);
  window.on('minimize', onGeometryChange);
  window.on('restore', onGeometryChange);

  window.on('move', () => {
    const position = window.getPosition();
    rpc.emit('move', {bounds: {x: position[0], y: position[1]}});
  });
  rpc.on('close', () => {
    window.close();
  });
  rpc.on('command', (command) => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    execCommand(command, focusedWindow!);
  });
  // pass on the full screen events from the window to react
  rpc.win.on('enter-full-screen', () => {
    rpc.emit('enter full screen');
  });
  rpc.win.on('leave-full-screen', () => {
    rpc.emit('leave full screen');
  });
  const deleteSessions = () => {
    sessions.forEach((session, key) => {
      nliService.disposeSession(key as SessionUid);
      session.removeAllListeners();
      session.destroy();
      sessions.delete(key);
    });
  };
  // we reset the rpc channel only upon
  // subsequent refreshes (ie: F5)
  let i = 0;
  window.webContents.on('did-navigate', () => {
    if (i++) {
      deleteSessions();
    }
  });

  const handleDroppedURL = (url: string) => {
    const protocol = typeof url === 'string' && new URL(url).protocol;
    if (protocol === 'file:') {
      const path = fileURLToPath(url);
      return {uid: null, data: path, escaped: true};
    } else if (protocol === 'http:' || protocol === 'https:') {
      return {uid: null, data: url};
    }
  };

  // If file is dropped onto the terminal window, navigate and new-window events are prevented
  // and it's path is added to active session.
  window.webContents.on('will-navigate', (event, url) => {
    const data = handleDroppedURL(url);
    if (data) {
      event.preventDefault();
      rpc.emit('session data send', data);
    }
  });
  window.webContents.setWindowOpenHandler(({url}) => {
    const data = handleDroppedURL(url);
    if (data) {
      rpc.emit('session data send', data);
      return {action: 'deny'};
    }
    return {action: 'allow'};
  });

  // expose internals to extension authors
  window.rpc = rpc;
  window.sessions = sessions;

  const load = () => {
    app.plugins.onWindow(window);
  };

  // load plugins
  load();

  const pluginsUnsubscribe = app.plugins.subscribe((err: any) => {
    if (!err) {
      load();
      window.webContents.send('plugins change');
      updateBackgroundColor();
    }
  });

  // Keep track of focus time of every window, to figure out
  // which one of the existing window is the last focused.
  // Works nicely even if a window is closed and removed.
  const updateFocusTime = () => {
    window.focusTime = process.uptime();
  };

  window.on('focus', () => {
    updateFocusTime();
  });

  // the window can be closed by the browser process itself
  window.clean = () => {
    app.config.winRecord(window);
    void nliService.dispose();
    rpc.destroy();
    deleteSessions();
    cfgUnsubscribe();
    pluginsUnsubscribe();
  };
  // Ensure focusTime is set on window open. The focus event doesn't
  // fire from the dock (see bug #583)
  updateFocusTime();

  return window;
}
