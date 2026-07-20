import test from 'ava';

import {closeWindowConfirmationOptions, isCloseConfirmed} from '../../app/utils/confirm-window-close';

test('isCloseConfirmed returns true only for the close button', (t) => {
  t.true(isCloseConfirmed(0));
  t.false(isCloseConfirmed(1));
});

test('close confirmation defaults to cancel', (t) => {
  t.deepEqual(closeWindowConfirmationOptions.buttons, ['Close Window', 'Cancel']);
  t.is(closeWindowConfirmationOptions.defaultId, 1);
  t.is(closeWindowConfirmationOptions.cancelId, 1);
});
