import test from 'ava';

import inputReportingResetSequence, {INPUT_REPORTING_MODES} from '../../lib/utils/input-reporting-modes';

test('turns off every mouse tracking mode', (t) => {
  [9, 1000, 1002, 1003].forEach((mode) => t.true(INPUT_REPORTING_MODES.includes(mode)));
});

test('turns off focus reporting and the SGR mouse encodings', (t) => {
  [1004, 1006, 1016].forEach((mode) => t.true(INPUT_REPORTING_MODES.includes(mode)));
});

test('emits a DECRST sequence per mode', (t) => {
  t.is(
    inputReportingResetSequence(),
    '\u001b[?9l\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1004l\u001b[?1006l\u001b[?1016l'
  );
});
