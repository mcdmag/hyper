import type {BrowserWindow, MenuItemConstructorOptions} from 'electron';

const toolsMenu = (
  commands: Record<string, string>,
  execCommand: (command: string, focusedWindow?: BrowserWindow) => void
): MenuItemConstructorOptions => {
  return {
    label: 'Tools',
    submenu: [
      {
        label: 'Update plugins',
        accelerator: commands['plugins:update'],
        click() {
          execCommand('plugins:update');
        }
      },
      {
        label: 'Natural Language Setup',
        accelerator: commands['nli:setup'],
        click(_menuItem, focusedWindow) {
          execCommand('nli:setup', focusedWindow);
        }
      },
      {
        label: 'Install Hyper CLI command in PATH',
        click() {
          execCommand('cli:install');
        }
      },
      {
        type: 'separator'
      },
      ...(process.platform === 'win32'
        ? <MenuItemConstructorOptions[]>[
            {
              label: 'Add Hyper to system context menu',
              click() {
                execCommand('systemContextMenu:add');
              }
            },
            {
              label: 'Remove Hyper from system context menu',
              click() {
                execCommand('systemContextMenu:remove');
              }
            },
            {
              type: 'separator'
            }
          ]
        : [])
    ]
  };
};

export default toolsMenu;
