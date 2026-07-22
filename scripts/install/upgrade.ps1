#!/usr/bin/env pwsh
param(
    [Parameter(Mandatory = $true)]
    [String]$ProcessID,

    [Parameter(Mandatory = $true)]
    [String]$InstallLocation,

    [Parameter(Mandatory = $true)]
    [String]$AllUrls,

    [Parameter(Mandatory = $true)]
    [String]$Version
)

$UpgradeScriptURL = "https://raw.githubusercontent.com/apify/apify-cli/refs/heads/master/scripts/install/upgrade.ps1"

$URLArray = $AllUrls -split ','

if ($URLArray.Count -lt 1) {
    Write-Error "URL parameter must contain at least 1 URL"
    exit 1
}

Write-Output "Apify and Actor CLI Upgrade Script - Starting Upgrade to version ${Version}...`n`n"

# Check that the process is running
$Process = $null

try {
    $Process = (Get-Process -Id $ProcessID) 2>$null

    Write-Output "Waiting for CLI to exit..."
    $null = $Process.WaitForExit(10000)

    # If the process is still running, bail out
    if ($Process.HasExited -eq $false) {
        Write-Error "CLI did not exit in time. Try running the upgrade command again!"

        Write-Output "Press any key to exit the upgrade script."

        # Press any key to continue
        [System.Console]::ReadKey($true) | Out-Null

        exit 1
    }
}
catch {
    # Process doesn't exist, so we can continue
}

Write-Output "CLI exited successfully. Starting upgrade...`n`n"

function Download-File-To-Location {
    param(
        [Parameter(Mandatory = $true)]
        [String]$URL,
        [Parameter(Mandatory = $true)]
        [String]$FileName,
        [Parameter(Mandatory = $true)]
        [Int]$Type,
        [Parameter(Mandatory = $true)]
        [String]$Location,
        [String]$Version,
        [Boolean]$ExitOnError = $true
    )
    switch ($Type) {
        0 {
            $FileName += ".exe"
        }
        1 {
            $FileName += ".ps1"
        }
    }

    $FullPath = Join-Path $Location $FileName

    if (-not $ExitOnError) {
        try {
            # Delete the file if it exists
            Remove-Item -Path $FullPath -Force 2>$null
        }
        catch {
            Write-Warning "Failed to delete $FullPath`: $($_.Exception.Message)"
        }
    }

    if ($Version) {
        Write-Output "Downloading $FileName version $Version to $FullPath"
    }
    else {
        Write-Output "Downloading $FileName to $FullPath"
    }

    curl.exe "-#SfLo" "$FullPath" "$URL"

    if ($LASTEXITCODE -ne 0 -and $ExitOnError) {
        Write-Warning "The command 'curl.exe $URL -o $FullPath' exited with code ${LASTEXITCODE}`nTrying an alternative download method..."

        try {
            # Use Invoke-RestMethod instead of Invoke-WebRequest because Invoke-WebRequest breaks on
            # some machines
            Invoke-RestMethod -Uri $URL -OutFile $FullPath 2>$null
        }
        catch {
            Write-Error "Upgrade Failed - could not download $URL"
            Write-Error "The command 'Invoke-RestMethod $URL -OutFile $FullPath' exited with error: $_`n"
            Write-Output "Press any key to exit the upgrade script."

            # Press any key to continue
            [System.Console]::ReadKey($true) | Out-Null

            exit 1
        }
    }

}

# We now ship a single `apify-cli` bundle. Download it (the URL list may contain backwards-compatible
# backup URLs too, but they are all copies of the same bundle, so the first one is enough).
Download-File-To-Location -URL $URLArray[0] -FileName "apify-cli" -Location $InstallLocation -Type 0 -Version $Version

# Let the freshly downloaded bundle (re)create the `apify`/`actor` wrapper scripts (.cmd, .ps1 and a POSIX
# shim), so the shim content lives in one place rather than being duplicated here.
# Skip the bundle's automatic version check - we just downloaded the requested version.
$env:APIFY_CLI_SKIP_UPDATE_CHECK = "1"
& (Join-Path $InstallLocation "apify-cli.exe") install --shims-only

# Clean up any legacy full bundles the wrappers replace, so the wrappers (not the `.exe`) resolve on PATH.
foreach ($Entrypoint in @("apify", "actor")) {
    Remove-Item -Path (Join-Path $InstallLocation "${Entrypoint}.exe") -Force -ErrorAction Ignore
    Remove-Item -Path (Join-Path $InstallLocation "${Entrypoint}.exe.old") -Force -ErrorAction Ignore
}

# Download the updated upgrade script (should rarely change but just in case)
Download-File-To-Location -URL $UpgradeScriptURL -FileName "upgrade" -Location $InstallLocation -Type 1 -ExitOnError $false

$C_RESET = [char]27 + "[0m"
$C_GREEN = [char]27 + "[1;32m"

Write-Output "`n`n${C_GREEN}Success:${C_RESET} Successfully upgraded to ${Version}!"

Write-Output "Press any key to exit the upgrade script."

# Press any key to continue
[System.Console]::ReadKey($true) | Out-Null
