import {mkdirSync, rmSync, writeFileSync} from 'fs';
import {resolve, sep, win32} from 'path';

import type {
  PowerShellIntegration,
  PowerShellIntegrationOptions,
  ShellIntegrationDecision,
  SupportedShellIntegrationDecision
} from '../../typings/nli';

const COMMON_NO_VALUE_FLAGS = new Set(['noexit', 'nologo', 'noprofile', 'mta', 'sta']);
const PWSH_NO_VALUE_FLAGS = new Set(['interactive', 'login', 'noprofileloadtime']);
const COMMON_VALUE_FLAGS = new Set(['executionpolicy', 'inputformat', 'outputformat', 'windowstyle']);
const FORBIDDEN_FLAGS = new Set([
  'c',
  'command',
  'commandwithargs',
  'configurationname',
  'custompipename',
  'e',
  'ec',
  'encodedcommand',
  'f',
  'file',
  'namedpipeservermode',
  'noninteractive',
  'servermode',
  'socketservermode',
  'sshservermode'
]);

const normalizeFlag = (value: string) =>
  value
    .replace(/^[-/]+/, '')
    .split(':', 1)[0]
    .toLowerCase();

const freezeUnsupported = (shell: string, args: readonly string[], reason: string): ShellIntegrationDecision =>
  Object.freeze({
    supported: false,
    reason,
    shell,
    args: Object.freeze([...args])
  });

export const detectShellIntegration = (shell: string, args: string[], enabled: boolean): ShellIntegrationDecision => {
  const shellName = win32.basename(shell).toLowerCase();
  const copiedArgs = [...args];
  const isPwsh = shellName === 'pwsh' || shellName === 'pwsh.exe';
  const seenFlags = new Set<string>();

  if (!enabled) {
    return freezeUnsupported(shell, copiedArgs, 'disabled');
  }
  if (!isPwsh && shellName !== 'powershell' && shellName !== 'powershell.exe') {
    return freezeUnsupported(shell, copiedArgs, 'unsupported-shell');
  }

  for (let index = 0; index < copiedArgs.length; index++) {
    const argument = copiedArgs[index];
    if (argument === '-' || argument === '--%' || (!argument.startsWith('-') && !argument.startsWith('/'))) {
      return freezeUnsupported(shell, copiedArgs, 'conflicting-arguments');
    }

    const normalized = normalizeFlag(argument);
    if (FORBIDDEN_FLAGS.has(normalized)) {
      return freezeUnsupported(shell, copiedArgs, 'conflicting-arguments');
    }
    if (
      seenFlags.has(normalized) ||
      (normalized === 'sta' && seenFlags.has('mta')) ||
      (normalized === 'mta' && seenFlags.has('sta'))
    ) {
      return freezeUnsupported(shell, copiedArgs, 'conflicting-arguments');
    }
    seenFlags.add(normalized);
    if (argument.includes(':') && (COMMON_NO_VALUE_FLAGS.has(normalized) || PWSH_NO_VALUE_FLAGS.has(normalized))) {
      return freezeUnsupported(shell, copiedArgs, 'unsupported-argument-value');
    }
    if (COMMON_NO_VALUE_FLAGS.has(normalized)) {
      continue;
    }
    if (PWSH_NO_VALUE_FLAGS.has(normalized)) {
      if (!isPwsh || (normalized === 'login' && index !== 0)) {
        return freezeUnsupported(shell, copiedArgs, 'unsupported-argument');
      }
      continue;
    }
    if (normalized === 'workingdirectory') {
      if (!isPwsh) {
        return freezeUnsupported(shell, copiedArgs, 'unsupported-argument');
      }
    } else if (!COMMON_VALUE_FLAGS.has(normalized)) {
      return freezeUnsupported(shell, copiedArgs, 'unknown-argument');
    }
    if (COMMON_VALUE_FLAGS.has(normalized) || normalized === 'workingdirectory') {
      let optionValue: string;
      if (argument.includes(':')) {
        optionValue = argument.slice(argument.indexOf(':') + 1);
        if (!optionValue) {
          return freezeUnsupported(shell, copiedArgs, 'missing-argument-value');
        }
      } else {
        optionValue = copiedArgs[++index];
        if (!optionValue || optionValue.startsWith('-') || optionValue.startsWith('/')) {
          return freezeUnsupported(shell, copiedArgs, 'missing-argument-value');
        }
      }
      if ((normalized === 'inputformat' || normalized === 'outputformat') && optionValue.toLowerCase() !== 'text') {
        return freezeUnsupported(shell, copiedArgs, 'unsupported-argument-value');
      }
      continue;
    }
  }

  return Object.freeze({
    supported: true,
    shell,
    args: Object.freeze(copiedArgs),
    family: 'powershell'
  });
};

const quotePowerShellLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

export const augmentPowerShellArgs = (
  decision: SupportedShellIntegrationDecision,
  scriptPath: string
): readonly string[] => {
  const args = [...decision.args];
  if (!args.some((argument) => normalizeFlag(argument) === 'noexit')) {
    args.push('-NoExit');
  }
  args.push('-File', scriptPath);
  return Object.freeze(args);
};

const createHookScript = ({
  sessionUid,
  windowUid,
  nonce,
  maxInputChars
}: Required<Pick<PowerShellIntegrationOptions, 'sessionUid' | 'nonce'>> &
  Pick<PowerShellIntegrationOptions, 'windowUid' | 'maxInputChars'>) => {
  const session = quotePowerShellLiteral(sessionUid);
  const window = quotePowerShellLiteral(windowUid || sessionUid);
  const nonceLiteral = quotePowerShellLiteral(nonce);
  const inputLimit = Math.max(1, Math.min(maxInputChars || 4096, 32768));

  return `# Generated by Hyper. Contains no credentials and is safe to delete after the session exits.
$existingState = Get-Variable -Name '__HyperNliCommandNotFoundState' -Scope Global -ErrorAction SilentlyContinue
if ($null -ne $existingState) {
  if ([object]::ReferenceEquals($ExecutionContext.InvokeCommand.CommandNotFoundAction, $existingState.Value.Wrapper)) { return }
  return
}

$sessionUid = ${session}
$windowUid = ${window}
$nonce = ${nonceLiteral}
$maxInputChars = ${inputLimit}
$state = [pscustomobject]@{
  Previous = $ExecutionContext.InvokeCommand.CommandNotFoundAction
  Wrapper = $null
}

$wrapperScript = {
  param(
    [object] $CommandName,
    [System.Management.Automation.CommandLookupEventArgs] $CommandLookupEventArgs
  )

  $invocation = $MyInvocation
  $submittedLine = [string]$invocation.Line
  $historyId = if ($invocation.HistoryId -ge 0) { [string]$invocation.HistoryId } else { $null }
  $location = $ExecutionContext.SessionState.Path.CurrentLocation
  $providerPath = [string]$location.ProviderPath
  if ([string]::IsNullOrEmpty($providerPath)) { $providerPath = [string]$location.Path }

  if (-not [object]::ReferenceEquals($ExecutionContext.InvokeCommand.CommandNotFoundAction, $state.Wrapper)) {
    if ($null -ne $state.Previous) { $state.Previous.Invoke($CommandName, $CommandLookupEventArgs) }
    return
  }
  $priorErrorCount = $global:Error.Count
  $priorLatestError = if ($priorErrorCount -gt 0) { $global:Error[0] } else { $null }
  try {
    if ($null -ne $state.Previous) { $state.Previous.Invoke($CommandName, $CommandLookupEventArgs) }
  } catch {
    throw
  }
  if (
    $global:Error.Count -gt $priorErrorCount -or
    ($global:Error.Count -gt 0 -and -not [object]::ReferenceEquals($global:Error[0], $priorLatestError))
  ) { return }
  if ($null -ne $CommandLookupEventArgs.Command -or $null -ne $CommandLookupEventArgs.CommandScriptBlock) { return }
  if (-not [object]::ReferenceEquals($ExecutionContext.InvokeCommand.CommandNotFoundAction, $state.Wrapper)) { return }

  if ([string]::IsNullOrWhiteSpace($submittedLine) -or $submittedLine.Contains([char]10) -or $submittedLine.Contains([char]13)) { return }
  if ($submittedLine.Length -gt $maxInputChars) { return }
  if ($providerPath.Length -gt 32768) { return }

  $tokens = $null
  $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($submittedLine, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count -ne 0) { return }
  $matchingCommands = $ast.FindAll({
    param($node)
    if ($node -isnot [System.Management.Automation.Language.CommandAst]) { return $false }
    $name = $node.GetCommandName()
    return $null -ne $name -and $name.Equals([string]$CommandName, [System.StringComparison]::OrdinalIgnoreCase)
  }, $false)
  if ($matchingCommands.Count -eq 0) { return }

  $payload = [ordered]@{
    v = 1
    windowUid = $windowUid
    sessionUid = $sessionUid
    callbackId = [guid]::NewGuid().ToString('N')
    reason = 'command-not-found'
    submittedLine = $submittedLine
    shellVersion = [string]$PSVersionTable.PSVersion
    providerName = [string]$location.Provider.Name
    providerPath = $providerPath
  }
  if ($null -ne $historyId) { $payload.historyId = $historyId }
  $json = Microsoft.PowerShell.Utility\\ConvertTo-Json -InputObject $payload -Compress -Depth 3
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
  if ($encoded.Length -gt (($maxInputChars * 8) + 65536)) { return }
  [Console]::Write(([char]27 + ']1337;HyperNLI;1;' + $nonce + ';' + $encoded + [char]7))
}.GetNewClosure()

$wrapperDelegate = [System.EventHandler[System.Management.Automation.CommandLookupEventArgs]] $wrapperScript
$state.Wrapper = $wrapperDelegate
$global:__HyperNliCommandNotFoundState = $state
$ExecutionContext.InvokeCommand.CommandNotFoundAction = $wrapperDelegate
`;
};

export const createPowerShellIntegration = (options: PowerShellIntegrationOptions): PowerShellIntegration => {
  const safeSessionUid = options.sessionUid.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!/^[a-fA-F0-9]{32,128}$/.test(options.nonce)) {
    throw new Error('NLI shell integration nonce is invalid');
  }
  const safeNonce = options.nonce.slice(0, 32);

  mkdirSync(options.scriptDirectory, {recursive: true});
  const scriptDirectory = resolve(options.scriptDirectory);
  const scriptPath = resolve(scriptDirectory, `hyper-nli-${safeSessionUid}-${safeNonce}.ps1`);
  if (!scriptPath.startsWith(`${scriptDirectory}${sep}`)) {
    throw new Error('NLI shell integration path escaped its directory');
  }
  writeFileSync(scriptPath, createHookScript(options), {
    encoding: 'utf8',
    flag: 'wx'
  });

  let disposed = false;
  return Object.freeze({
    scriptPath,
    dispose() {
      if (disposed) {
        return;
      }
      rmSync(scriptPath, {force: true});
      disposed = true;
    }
  });
};
