# PowerShell strict mode
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Function to print colored output
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Function to detect architecture (always return x64 for Windows as requested)
function Get-Architecture {
    $arch = $env:PROCESSOR_ARCHITECTURE
    Write-Info "Detected system architecture: $arch"

    # Check if architecture is 64-bit
    if ($arch -ne "AMD64" -and $arch -ne "ARM64") {
        Write-Error "Unsupported architecture: $arch"
        Write-Error "Only 64-bit architectures (AMD64, ARM64) are supported"
        exit 1
    }

    # Always use x64 for Windows (including ARM64 systems as requested)
    if ($arch -eq "ARM64") {
        Write-Info "ARM64 detected, using x64 version of the CLI"
    }

    return "x64"
}

# Function to fetch latest version from GitHub API
function Get-LatestVersion {
    $apiUrl = "https://api.github.com/repos/apify/apify-cli/releases/latest"

    try {
        Write-Info "Fetching latest version from GitHub API..."
        $response = Invoke-RestMethod -Uri $apiUrl -Method Get

        if (-not $response.tag_name) {
            throw "Failed to parse version from GitHub API response"
        }

        # Strip 'v' prefix if present
        $version = $response.tag_name -replace '^v', ''
        return $version
    }
    catch {
        Write-Error "Failed to fetch version from GitHub API: $($_.Exception.Message)"
        exit 1
    }
}

# Function to construct download URL
function Get-DownloadUrl {
    param(
        [string]$CliName,
        [string]$Version,
        [string]$Platform,
        [string]$Arch
    )

    return "https://github.com/apify/apify-cli/releases/download/v${Version}/${CliName}-${Version}-${Platform}-${Arch}.exe"
}

# Function to download CLI bundle
function Download-Bundle {
    param(
        [string]$CliName,
        [string]$Version,
        [string]$Platform,
        [string]$Arch
    )

    $downloadUrl = Get-DownloadUrl -CliName $CliName -Version $Version -Platform $Platform -Arch $Arch
    $outputFilename = "${CliName}-${Version}-${Platform}-${Arch}.exe"

    Write-Info "Downloading $CliName CLI bundle..."
    Write-Info "URL: $downloadUrl"
    Write-Info "Output: $outputFilename"

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $outputFilename -ErrorAction Stop
        Write-Success "Downloaded $outputFilename"
        return $true
    }
    catch {
        Write-Warning "Failed to download $CliName bundle (might not exist for this platform/arch combination)"
        Write-Warning "Error: $($_.Exception.Message)"
        return $false
    }
}

# Main execution function
function Main {
    Write-Info "Starting Apify CLI installation for Windows..."

    # Set platform (always Windows for this script)
    $Platform = "win32"

    # Detect architecture (always use x64 as requested)
    $Arch = Get-Architecture

    Write-Info "Target platform: $Platform"
    Write-Info "Target architecture: $Arch"

    # Fetch latest version
    $Version = Get-LatestVersion
    Write-Success "Latest version: $Version"

    # CLI names to download
    $CliNames = @("apify", "actor")

    # Download each CLI bundle
    $successCount = 0
    foreach ($cliName in $CliNames) {
        Write-Host ""
        if (Download-Bundle -CliName $cliName -Version $Version -Platform $Platform -Arch $Arch) {
            $successCount++
        }
    }

    Write-Host ""
    Write-Success "Download process completed!"
    Write-Info "Successfully downloaded $successCount out of $($CliNames.Count) CLI bundles"

    # List downloaded files
    Write-Host ""
    Write-Info "Downloaded files:"
    foreach ($cliName in $CliNames) {
        $filename = "${cliName}-${Version}-${Platform}-${Arch}.exe"
        if (Test-Path $filename) {
            Write-Host "  ✓ $filename" -ForegroundColor Green
        } else {
            Write-Host "  ✗ $filename (not found)" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Info "You can now run the downloaded executables directly or add them to your PATH."
}

# Check if we can make web requests
try {
    # Test basic connectivity
    $null = Invoke-WebRequest -Uri "https://api.github.com" -Method Head -TimeoutSec 10
}
catch {
    Write-Error "Cannot connect to GitHub API. Please check your internet connection and try again."
    exit 1
}

# Run main function
try {
    Main
}
catch {
    Write-Error "An unexpected error occurred: $($_.Exception.Message)"
    exit 1
}
