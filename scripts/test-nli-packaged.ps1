[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Get-DirectoryStamp([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return (Get-Item -LiteralPath $Path).LastWriteTimeUtc.Ticks
}

function Get-DescendantProcesses([int] $RootProcessId) {
  $known = [System.Collections.Generic.HashSet[int]]::new()
  [void] $known.Add($RootProcessId)
  $result = @()
  do {
    $added = $false
    foreach ($candidate in Get-CimInstance Win32_Process) {
      if ($known.Contains([int] $candidate.ParentProcessId) -and -not $known.Contains([int] $candidate.ProcessId)) {
        [void] $known.Add([int] $candidate.ProcessId)
        $result += $candidate
        $added = $true
      }
    }
  } while ($added)
  return $result
}

function Get-LaunchedProcesses([int] $RootProcessId, [string] $ExactBinary, [int[]] $ExcludedProcessIds) {
  $byId = @{}
  foreach ($candidate in Get-DescendantProcesses $RootProcessId) {
    $byId[[int] $candidate.ProcessId] = $candidate
  }
  foreach ($candidate in Get-CimInstance Win32_Process) {
    if ([int] $candidate.ProcessId -eq $RootProcessId -or
        $ExcludedProcessIds -contains [int] $candidate.ProcessId -or
        [string]::IsNullOrWhiteSpace($candidate.ExecutablePath)) {
      continue
    }
    try {
      $candidatePath = [IO.Path]::GetFullPath($candidate.ExecutablePath)
      if ($candidatePath.Equals($ExactBinary, [StringComparison]::OrdinalIgnoreCase)) {
        $byId[[int] $candidate.ProcessId] = $candidate
      }
    } catch {
      # A process can exit between enumeration and path resolution.
    }
  }
  return @($byId.Values)
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$binary = Join-Path $repoRoot 'dist\win-unpacked\Hyper.exe'
$fixture = Join-Path $repoRoot 'test\fixtures\nli\fake-provider-e2e.jsonl'
$binary = [IO.Path]::GetFullPath($binary)
$pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw "Packaged Hyper binary not found: $binary" }
if (-not (Test-Path -LiteralPath $fixture -PathType Leaf)) { throw "NLI E2E fixture not found: $fixture" }

$systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $systemTemp ("hyper-nli-packaged-{0}" -f [guid]::NewGuid().ToString('N'))
$resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
if (-not $resolvedTempRoot.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -or
    -not (Split-Path -Leaf $resolvedTempRoot).StartsWith('hyper-nli-packaged-', [StringComparison]::Ordinal)) {
  throw "Refusing unsafe smoke-test directory: $resolvedTempRoot"
}

$realAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
$realUserProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$realHyper = Join-Path $realAppData 'Hyper'
$realCodex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $realUserProfile '.codex' }
$realHyperStamp = Get-DirectoryStamp $realHyper
$realCodexStamp = Get-DirectoryStamp $realCodex

$savedEnvironment = @{}
foreach ($name in @('APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'HYPER_NLI_E2E_FIXTURE', 'HYPER_SKIP_DEV_EXTENSIONS')) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$rootProcess = $null
$descendants = @()
$preexistingBinaryProcessIds = @(
  Get-CimInstance Win32_Process | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_.ExecutablePath) -and
    ([IO.Path]::GetFullPath($_.ExecutablePath)).Equals($binary, [StringComparison]::OrdinalIgnoreCase)
  } | ForEach-Object { [int] $_.ProcessId }
)
$proof = [ordered]@{
  binary = $binary
  fixture = $fixture
  rootProcessId = $null
  rootWindowVisible = $false
  childProcesses = @()
  childWindows = @()
  realHyperUntouched = $false
  realCodexUntouched = $false
  descendantsExited = $false
  tempRemoved = $false
}

try {
  $appData = Join-Path $resolvedTempRoot 'appdata'
  $localAppData = Join-Path $resolvedTempRoot 'localappdata'
  $profile = Join-Path $resolvedTempRoot 'profile'
  $temp = Join-Path $resolvedTempRoot 'temp'
  $chromiumUserData = Join-Path $resolvedTempRoot 'chromium-user-data'
  # --user-data-dir becomes Electron's app.getPath('userData'), which is also
  # where packaged Hyper reads hyper.json on Windows.
  $configDirectory = $chromiumUserData
  foreach ($directory in @($configDirectory, $localAppData, $profile, $temp, $chromiumUserData)) {
    [void] (New-Item -ItemType Directory -Path $directory -Force)
  }

  $config = [ordered]@{
    config = [ordered]@{
      shell = $pwsh
      shellArgs = @('-NoLogo', '-NoProfile')
      disableAutoUpdates = $true
      defaultSSHApp = $false
      naturalLanguageInterface = [ordered]@{
        enabled = $true
        codexExecutable = 'codex'
        requestTimeoutMs = 10000
        maxInputChars = 4096
        maxOptions = 3
        includeWorkingDirectory = $false
        includeGitMetadata = $false
      }
    }
    plugins = @()
    localPlugins = @()
    keymaps = @{}
  }
  $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $configDirectory 'hyper.json') -Encoding UTF8

  $env:APPDATA = $appData
  $env:LOCALAPPDATA = $localAppData
  $env:USERPROFILE = $profile
  $env:TEMP = $temp
  $env:TMP = $temp
  $env:HYPER_NLI_E2E_FIXTURE = $fixture
  $env:HYPER_SKIP_DEV_EXTENSIONS = '1'

  # Hyper.exe is a GUI subsystem binary, so this creates no console window.
  $rootProcess = Start-Process -FilePath $binary -ArgumentList @("--user-data-dir=$chromiumUserData") -PassThru
  $proof.rootProcessId = $rootProcess.Id
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 200
    $rootProcess.Refresh()
    $descendants = @(Get-LaunchedProcesses $rootProcess.Id $binary $preexistingBinaryProcessIds)
  } while (-not $rootProcess.HasExited -and ($descendants.Count -eq 0 -or $rootProcess.MainWindowHandle -eq 0) -and [DateTime]::UtcNow -lt $deadline)
  if ($rootProcess.HasExited) { throw "Packaged Hyper exited early with code $($rootProcess.ExitCode)" }
  $proof.rootWindowVisible = $rootProcess.MainWindowHandle -ne 0
  if (-not $proof.rootWindowVisible) { throw 'Packaged Hyper did not create its single application window' }

  if ($descendants.Count -eq 0) { throw 'Packaged Hyper created no renderer or terminal child processes' }
  $proof.childProcesses = @($descendants | ForEach-Object { [ordered]@{id = $_.ProcessId; name = $_.Name; executable = $_.ExecutablePath} })
  $childWindows = @(
    $descendants | ForEach-Object {
      $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($process -and $process.MainWindowHandle -ne 0) {
        [ordered]@{id = $process.Id; name = $process.ProcessName; window = $process.MainWindowTitle}
      }
    }
  )
  $proof.childWindows = $childWindows
  if ($childWindows.Count -ne 0) { throw 'A renderer, PTY, fixture, or helper child created a dangling top-level window' }

  $proof.realHyperUntouched = (Get-DirectoryStamp $realHyper) -eq $realHyperStamp
  $proof.realCodexUntouched = (Get-DirectoryStamp $realCodex) -eq $realCodexStamp
  if (-not $proof.realHyperUntouched -or -not $proof.realCodexUntouched) {
    throw 'Packaged smoke touched the real Hyper or Codex user directory'
  }

  Stop-Process -Id $rootProcess.Id -Force
  $rootProcess.WaitForExit(10000)
  $exitDeadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    $living = @($descendants | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
    if ($living.Count -eq 0) { break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $exitDeadline)
  $proof.descendantsExited = $living.Count -eq 0
  if (-not $proof.descendantsExited) { throw 'A packaged Hyper child process remained after Hyper exited' }
} finally {
  foreach ($name in $savedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
  if ($rootProcess -and -not $rootProcess.HasExited) {
    Stop-Process -Id $rootProcess.Id -Force -ErrorAction SilentlyContinue
  }
  foreach ($child in $descendants) {
    $livingChild = Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
    if ($livingChild -and "$($livingChild.ProcessName).exe" -eq $child.Name) {
      Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
  if (Test-Path -LiteralPath $resolvedTempRoot) {
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
  $proof.tempRemoved = -not (Test-Path -LiteralPath $resolvedTempRoot)
  [void] (New-Item -ItemType Directory -Path (Join-Path $repoRoot 'dist\tmp') -Force)
  $proof | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $repoRoot 'dist\tmp\nli-packaged-smoke.json') -Encoding UTF8
}

if (-not $proof.tempRemoved) { throw 'Packaged smoke did not remove its isolated directory' }
Write-Output 'NLI packaged smoke passed: one GUI app window, no console or dangling child window, isolated user data, and no surviving child process.'
