// DEC private modes that make the terminal report input back to the running
// program. A program that exits without cleaning up (a crash, or Ctrl+C with no
// signal handler) leaves them enabled, and the shell that regains the prompt
// echoes every mouse move as text. Resetting them recovers the session without
// disturbing the scrollback.
export const INPUT_REPORTING_MODES = [
  9, // X10 mouse tracking
  1000, // VT200 mouse tracking
  1002, // button-event mouse tracking
  1003, // any-event mouse tracking
  1004, // focus in/out reporting
  1006, // SGR mouse encoding
  1016 // SGR pixel mouse encoding
];

export default function inputReportingResetSequence() {
  return INPUT_REPORTING_MODES.map((mode) => `\u001b[?${mode}l`).join('');
}
