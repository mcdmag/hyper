import {readFileSync} from 'fs';
import {join} from 'path';

import test from 'ava';

const source = readFileSync(join(__dirname, '..', '..', 'scripts', 'test-nli-packaged.ps1'), 'utf8');
const e2eSource = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');

test('packaged smoke isolates Hyper and Codex paths and validates cleanup scope', (t) => {
  t.regex(source, /hyper-nli-packaged-/);
  t.regex(source, /StartsWith\(\$systemTemp/);
  t.regex(source, /APPDATA/);
  t.regex(source, /LOCALAPPDATA/);
  t.regex(source, /USERPROFILE/);
  t.regex(source, /HYPER_NLI_E2E_FIXTURE/);
  t.regex(source, /realHyperUntouched/);
  t.regex(source, /realCodexUntouched/);
  t.regex(source, /Remove-Item -LiteralPath \$resolvedTempRoot -Recurse -Force/);
  t.false(source.includes('Remove-Item -Recurse -Force $env:'));
});

test('packaged smoke checks child windows and requires every captured descendant to exit', (t) => {
  t.regex(source, /Get-DescendantProcesses/);
  t.regex(source, /MainWindowHandle/);
  t.regex(source, /childWindows\.Count -ne 0/);
  t.regex(source, /descendantsExited/);
  t.regex(source, /Get-Process -Id \$_\.ProcessId/);
  t.regex(source, /Stop-Process -Id \$rootProcess\.Id -Force/);
});

test('Playwright creates its overridden Electron userData directory before launch', (t) => {
  t.regex(e2eSource, /fs\.ensureDir\(chromiumUserData\)/);
  t.regex(e2eSource, /args: \[`--user-data-dir=\$\{chromiumUserData\}`\]/);
});
