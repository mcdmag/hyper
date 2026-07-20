import test from 'ava';

import getWindowsPtyOptions from '../../app/utils/windows-pty-options';

test('uses the bundled ConPTY by default on Windows', (t) => {
  t.deepEqual(getWindowsPtyOptions('win32'), {useConptyDll: true});
});

test('allows the bundled ConPTY to be disabled', (t) => {
  t.deepEqual(getWindowsPtyOptions('win32', undefined, false), {useConptyDll: false});
});

test('does not select a ConPTY DLL when winpty is requested', (t) => {
  t.deepEqual(getWindowsPtyOptions('win32', false), {useConpty: false});
});

test('does not add Windows PTY options on other platforms', (t) => {
  t.deepEqual(getWindowsPtyOptions('linux'), {});
});
