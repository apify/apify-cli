#!/usr/bin/env pwsh
param(
    [String]$Version = "latest",
    # Forces installing the baseline build regardless of what CPU you are actually using.
    [Switch]$ForceBaseline = $false
)

# The following script is adapted from the bun.sh install script
# Licensed under the MIT License (https://github.com/oven-sh/bun/blob/main/LICENSE.md)

$allowedSystemTypes = @("x64-based", "ARM64-based")
$currentSystemType = (Get-CimInstance Win32_ComputerSystem).SystemType

# filter out 32 bit
if (-not ($allowedSystemTypes | Where-Object { $currentSystemType -match $_ })) {
    Write-Output "Install Failed:"
    Write-Output "Apify CLI for Windows is currently only available for 64-bit Windows and ARM64 Windows.`n"
    return 1
}

if ($currentSystemType -match "ARM64") {
    Write-Warning "Warning:"
    Write-Warning "ARM64-based systems are not natively supported yet.`nThe install will still continue but Apify CLI might not work as intended.`n"
}

# This corresponds to .win10_rs5 in build.zig
$MinBuild = 17763;
$MinBuildName = "Windows 10 1809 / Windows Server 2019"

$WinVer = [System.Environment]::OSVersion.Version
if ($WinVer.Major -lt 10 -or ($WinVer.Major -eq 10 -and $WinVer.Build -lt $MinBuild)) {
    Write-Warning "Apify CLI requires at least ${MinBuildName} or newer.`n"
    return 1
}

$ErrorActionPreference = "Stop"

# These three environment functions are roughly copied from https://github.com/prefix-dev/pixi/pull/692
# They are used instead of `SetEnvironmentVariable` because of unwanted variable expansions.
function Publish-Env {
    if (-not ("Win32.NativeMethods" -as [Type])) {
        Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam,
    uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
"@
    }
    $HWND_BROADCAST = [IntPtr] 0xffff
    $WM_SETTINGCHANGE = 0x1a
    $result = [UIntPtr]::Zero
    [Win32.NativeMethods]::SendMessageTimeout($HWND_BROADCAST,
        $WM_SETTINGCHANGE,
        [UIntPtr]::Zero,
        "Environment",
        2,
        5000,
        [ref] $result
    ) | Out-Null
}

function Write-Env {
    param([String]$Key, [String]$Value)

    $RegisterKey = Get-Item -Path 'HKCU:'

    $EnvRegisterKey = $RegisterKey.OpenSubKey('Environment', $true)
    if ($null -eq $Value) {
        $EnvRegisterKey.DeleteValue($Key)
    }
    else {
        $RegistryValueKind = if ($Value.Contains('%')) {
            [Microsoft.Win32.RegistryValueKind]::ExpandString
        }
        elseif ($EnvRegisterKey.GetValue($Key)) {
            $EnvRegisterKey.GetValueKind($Key)
        }
        else {
            [Microsoft.Win32.RegistryValueKind]::String
        }
        $EnvRegisterKey.SetValue($Key, $Value, $RegistryValueKind)
    }

    Publish-Env
}

function Get-Env {
    param([String] $Key)

    $RegisterKey = Get-Item -Path 'HKCU:'
    $EnvRegisterKey = $RegisterKey.OpenSubKey('Environment')
    $EnvRegisterKey.GetValue($Key, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
}

$ExecutableNames = "apify", "actor"

function Get-LatestVersion {
    $LatestVersion = Invoke-RestMethod -Uri "https://api.github.com/repos/apify/apify-cli/releases/latest"
    return $LatestVersion.tag_name.TrimStart('v')
}

# The installation of Apify CLI is it's own function so that in the unlikely case the $IsBaseline check fails, we can do a recursive call.
# There are also lots of sanity checks out of fear of anti-virus software or other weird Windows things happening.
function Install-Apify {
    param(
        [string]$Version,
        [bool]$ForceBaseline = $False
    );

    if (-not ($Version -match "^v?\d+\.\d+\.\d+(-beta\.\d+)?$") -and -not ($Version = 'latest')) {
        Write-Error "Invalid version: $Version"
        return 1
    }

    $Arch = if ($currentSystemType -match "ARM64") { "arm64" } else { "x64" }
    $IsBaseline = $ForceBaseline

    if (-not $IsBaseline) {
        $IsBaseline = !(
            Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);' -Name 'Kernel32' -Namespace 'Win32' -PassThru
        )::IsProcessorFeaturePresent(40)
    }

    $ApifyRoot = if ($env:APIFY_CLI_INSTALL) { $env:APIFY_CLI_INSTALL } else { "${Home}\.apify" }
    $ApifyBin = mkdir -Force "${ApifyRoot}\bin"

    try {
        foreach ($ExecutableName in $ExecutableNames) {
            Remove-Item "${ApifyBin}\${ExecutableName}.exe" -Force
        }

        # Alias apify to apify-cli, as npm does (because otherwise npx apify-cli wouldn't work)
        Remove-Item "${ApifyBin}\apify-cli.exe" -Force
    }
    catch [System.Management.Automation.ItemNotFoundException] {
        # ignore
    }
    catch [System.UnauthorizedAccessException] {
        $openProcesses = Get-Process -Name apify | Where-Object { $_.Path -eq "${ApifyBin}\apify.exe" }
        if ($openProcesses.Count -gt 0) {
            Write-Output "Install Failed - An older installation exists and is open. Please close open Apify CLI processes and try again."
            return 1
        }

        Write-Output "Install Failed - An unknown error occurred while trying to remove the existing installation"
        Write-Output $_
        return 1
    }
    catch {
        Write-Output "Install Failed - An unknown error occurred while trying to remove the existing installation"
        Write-Output $_
        return 1
    }

    $BaseURL = "https://github.com/apify/apify-cli/releases/download/"

    if ($Version -eq "latest") {
        $Version = Get-LatestVersion
    }
    elseif ($Version -match "^v?\d+\.\d+\.\d+(-beta\.\d+)?$") {
        $Version = $Version.TrimStart('v')
    }

    $BaseURL += "v${Version}/"

    $null = mkdir -Force $ApifyBin

    foreach ($ExecutableName in $ExecutableNames) {
        $FileName = "${ExecutableName}.exe"
        $Target = "${ExecutableName}-${Version}-windows-${Arch}${IsBaseline ? '-baseline' : ''}"

        $DownloadURL = "${BaseURL}${Target}.exe"
        $DownloadPath = "${ApifyBin}\${FileName}"

        curl.exe "-#SfLo" "$DownloadPath" "$DownloadURL"

        if ($LASTEXITCODE -ne 0) {
            Write-Warning "The command 'curl.exe $DownloadURL -o $DownloadPath' exited with code ${LASTEXITCODE}`nTrying an alternative download method..."

            try {
                # Use Invoke-RestMethod instead of Invoke-WebRequest because Invoke-WebRequest breaks on
                # some machines, see
                Invoke-RestMethod -Uri $DownloadURL -OutFile $DownloadPath
            }
            catch {
                Write-Output "Install Failed - could not download $DownloadURL"
                Write-Output "The command 'Invoke-RestMethod $DownloadURL -OutFile $DownloadPath' exited with code ${LASTEXITCODE}`n"
                return 1
            }
        }

        $ApifyVersion = "$(& "${ApifyBin}\${FileName}" --version)"
        if ($LASTEXITCODE -eq 1073741795) {
            # STATUS_ILLEGAL_INSTRUCTION
            if ($IsBaseline) {
                Write-Output "Install Failed - apify.exe (baseline) is not compatible with your CPU.`n"
                return 1
            }

            Write-Output "Install Failed - apify.exe is not compatible with your CPU. This should have been detected before downloading.`n"
            Write-Output "Attempting to download apify.exe (baseline) instead.`n"

            Install-Apify -Version $Version -ForceBaseline $True
            return 1
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Output "Install Failed - could not verify apify.exe"
            Write-Output "The command '${ApifyBin}\apify.exe --version' exited with code ${LASTEXITCODE}`n"
            return 1
        }

        if ($ExecutableName -eq "apify") {
            # Alias apify to apify-cli, as npm does (because otherwise npx apify-cli wouldn't work)
            Copy-Item -Path "${ApifyBin}\${FileName}" -Destination "${ApifyBin}\apify-cli.exe" -Force
        }
    }

    $C_RESET = [char]27 + "[0m"
    $C_GREEN = [char]27 + "[1;32m"

    Write-Output "${C_GREEN}Apify CLI ${ApifyVersion} was installed successfully!${C_RESET}"
    Write-Output "The binary is located at ${ApifyBin}\apify.exe`n"

    $hasExistingOther = $false;
    try {
        $existing = Get-Command apify -ErrorAction
        if ($existing.Source -ne "${ApifyBin}\apify.exe") {
            Write-Warning "Note: Another apify.exe is already in %PATH% at $($existing.Source)`nTyping 'apify' in your terminal will not use what was just installed.`n"
            $hasExistingOther = $true;
        }
    }
    catch {}

    if (!$hasExistingOther) {
        # Only try adding to path if there isn't already a apify.exe in the path
        $Path = (Get-Env -Key "Path") -split ';'
        if ($Path -notcontains $ApifyBin) {
            $Path += $ApifyBin
            Write-Env -Key 'Path' -Value ($Path -join ';')
            $env:PATH = $Path;
        }

        Write-Output "To get started, restart your terminal/editor, then type `"apify`"`n"
    }

    $LASTEXITCODE = 0;
}

Install-Apify -Version $Version -ForceBaseline $ForceBaseline
