import {readFileSync} from 'fs';
import {join} from 'path';

import test from 'ava';

const mockupPath = join(__dirname, '..', '..', 'docs', 'mockups', 'nli-shell-first.html');
const capturePath = join(__dirname, '..', '..', 'scripts', 'capture-nli-mockups.ts');
const html = readFileSync(mockupPath, 'utf8');

const requiredStates = [
  'disabled-setup',
  'unsupported-shell',
  'privacy-and-sign-in',
  'signing-in',
  'signed-in',
  'keyring-error',
  'userdata-error',
  'interpreting',
  'clarification',
  'single-proposal',
  'alternatives',
  'edited-high-risk',
  'offline-rate-limit',
  'malformed-response',
  'stale-context',
  'sent'
];

test('mockup contains every named NLI state', (t) => {
  for (const state of requiredStates) {
    t.regex(html, new RegExp(`data-state="${state}"`), state);
  }

  t.regex(html, /Open Hyper Configuration/);
  t.regex(html, /Accept and sign in with ChatGPT/);
  t.regex(html, /Cancel sign-in/);
  t.regex(html, /Log out of Codex/);
  t.regex(html, /Reset privacy choices/);
  t.regex(html, /keyring is unavailable/);
  t.regex(html, /cannot create its isolated Codex data directory/);
  t.regex(html, /Cancel interpretation/);
  t.regex(html, /3 options/);
  t.regex(html, /High risk — recursive deletion/);
});

test('mockup uses semantic native controls and accessible announcements', (t) => {
  t.regex(html, /<button type="button"/);
  t.regex(html, /<fieldset class="choices">/);
  t.regex(html, /<input type="radio"/);
  t.regex(html, /<input type="checkbox"/);
  t.regex(html, /<label class="field" for="command-edit">/);
  t.regex(html, /<textarea id="command-edit"/);
  t.regex(html, /aria-live="polite"/);
  t.regex(html, /role="alert"/);
  t.regex(html, /:focus-visible/);
  t.regex(html, /@media \(prefers-reduced-motion: reduce\)/);
  t.regex(html, /user-select: text/);
});

test('mockup documents safe keyboard behavior', (t) => {
  t.regex(html, /focus starts on this heading/i);
  t.regex(html, /Tab or Shift\+Tab/);
  t.regex(html, /arrow keys/i);
  t.regex(html, /Escape closes the panel and restores terminal focus/);
  t.regex(html, /never makes Enter run a command/);
  t.regex(html, /event\.key === 'Escape'/);
  t.regex(html, /panel\.replaceChildren\(\)/);
  t.regex(html, /panel\.hidden = true/);
  t.regex(html, /terminalFocus\.focus/);
});

test('mockup defines desktop and 320px narrow fixtures', (t) => {
  t.regex(html, /data-viewport="desktop"/);
  t.regex(html, /@media \(max-width: 480px\)/);
  t.regex(html, /width=device-width, initial-scale=1/);

  const capture = readFileSync(capturePath, 'utf8');
  t.regex(capture, /width: 900, height: 720/);
  t.regex(capture, /width: 320, height: 720/);
  t.regex(capture, /fixture=desktop/);
  t.regex(capture, /fixture=narrow/);
  t.regex(capture, /keyboard\.press\('Escape'\)/);
  t.regex(capture, /panel\?\.hidden === true/);
});

test('mockup includes the exact default-private setup block', (t) => {
  t.regex(html, /enabled: true/);
  t.regex(html, /codexExecutable: 'codex'/);
  t.regex(html, /requestTimeoutMs: 30000/);
  t.regex(html, /maxInputChars: 4096/);
  t.regex(html, /maxOptions: 3/);
  t.regex(html, /includeWorkingDirectory: false/);
  t.regex(html, /includeGitMetadata: false/);
});
