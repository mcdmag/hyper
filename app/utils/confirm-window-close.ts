import {dialog} from 'electron';
import type {BrowserWindow, MessageBoxSyncOptions} from 'electron';

export const closeWindowConfirmationOptions: MessageBoxSyncOptions = {
  type: 'question',
  buttons: ['Close Window', 'Cancel'],
  defaultId: 1,
  cancelId: 1,
  title: 'Close Hyper?',
  message: 'Close this Hyper window?',
  detail: 'All terminal sessions in this window will be terminated.'
};

export const isCloseConfirmed = (response: number) => response === 0;

export default function confirmWindowClose(win: BrowserWindow) {
  return isCloseConfirmed(dialog.showMessageBoxSync(win, closeWindowConfirmationOptions));
}
