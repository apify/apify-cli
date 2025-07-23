#!/usr/bin/env pwsh
param(
    [Parameter(Mandatory = $true)]
    [String]$ProcessID,

    [Parameter(Mandatory = $true)]
    [String]$InstallLocation,

    [Parameter(Mandatory = $true)]
    [String]$URL,

    [Parameter(Mandatory = $true)]
    [String]$Version
)

$ErrorActionPreference = "Stop"

$UpgradeScriptURL = "https://raw.githubusercontent.com/apify/apify-cli/main/scripts/install/upgrade.ps1"

$URLArray = $URL -split ','

if ($URLArray.Count -ne 2) {
    Write-Error "URL parameter must contain exactly 2 comma-delimited URLs"
    exit 1
}

# Check that the process is running
$Process = $null

try {
    $Process = Get-Process -Id $ProcessID

    Write-Output "Waiting for CLI to exit..."
    $Process.WaitForExit(10000)

    # If the process is still running, bail out
    if ($Process.HasExited -eq $false) {
        Write-Error "CLI did not exit in time. Try running the upgrade command again!"
        exit 1
    }
}
catch {
    # Process doesn't exist, so we can continue
}


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

    try {
        # Delete the file if it exists
        Remove-Item -Path $FullPath -Force
    }
    catch {
        Write-Warning "Failed to delete $FullPath`: $($_.Exception.Message)"
    }

    if ($Version) {
        Write-Output "Downloading $FileName version $Version to $FullPath"
    }
    else {
        Write-Output "Downloading $FileName to $FullPath"
    }

    curl.exe "-#SfLo" "$FullPath" "$URL"

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "The command 'curl.exe $URL -o $FullPath' exited with code ${LASTEXITCODE}`nTrying an alternative download method..."

        try {
            # Use Invoke-RestMethod instead of Invoke-WebRequest because Invoke-WebRequest breaks on
            # some machines
            Invoke-RestMethod -Uri $URL -OutFile $FullPath
        }
        catch {
            Write-Error "Upgrade Failed - could not download $URL"
            Write-Error "The command 'Invoke-RestMethod $URL -OutFile $FullPath' exited with error: $_`n"

            if ($ExitOnError) {
                exit 1
            }
        }
    }

}

foreach ($URL in $URLArray) {
    $URLSplit = $URL -split '/'
    $FullCLIName = $URLSplit[-1]

    $CLIName = $FullCLIName.Split('-')[0]

    Download-File-To-Location -URL $URL -FileName $CLIName -Location $InstallLocation -Type 0 -Version $Version
}

# Download the updated upgrade script (should rarely change but just in case)
Download-File-To-Location -URL $UpgradeScriptURL -FileName "upgrade" -Location $InstallLocation -Type 1 -ExitOnError $false

$C_RESET = [char]27 + "[0m"
$C_GREEN = [char]27 + "[1;32m"

Write-Output "${C_GREEN}Success:${C_RESET} Successfully upgraded to ${Version} 👍"
