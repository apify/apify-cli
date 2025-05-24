#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to detect OS platform
detect_platform() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')

    case "$os" in
    linux*)
        # Check if it's musl-based (Alpine, etc.)
        if ldd --version 2>&1 | grep -q musl; then
            echo "linux-musl"
        else
            echo "linux"
        fi
        ;;
    darwin*)
        echo "darwin"
        ;;
    *)
        print_error "Unsupported platform: $os"
        print_error "Valid platforms are: linux, linux-musl, darwin"
        exit 1
        ;;
    esac
}

# Function to detect architecture
detect_arch() {
    local arch=$(uname -m)

    case "$arch" in
    x86_64 | amd64)
        echo "x64"
        ;;
    arm64 | aarch64)
        echo "arm64"
        ;;
    *)
        print_error "Unsupported architecture: $arch"
        print_error "Valid architectures are: x64, arm64"
        exit 1
        ;;
    esac
}

# Function to fetch latest version from GitHub API
fetch_latest_version() {
    local api_url="https://api.github.com/repos/apify/apify-cli/releases/latest"
    local response=$(curl -s "$api_url")

    if [ $? -ne 0 ]; then
        print_error "Failed to fetch version from GitHub API"
        exit 1
    fi

    # Extract tag_name and strip 'v' prefix
    local version=$(echo "$response" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' | sed 's/^v//')

    if [ -z "$version" ]; then
        print_error "Failed to parse version from GitHub API response"
        exit 1
    fi

    echo "$version"
}

# Function to construct download URL
construct_download_url() {
    local cli_name="$1"
    local version="$2"
    local platform="$3"
    local arch="$4"

    echo "https://github.com/apify/apify-cli/releases/download/v${version}/${cli_name}-${version}-${platform}-${arch}"
}

# Function to download CLI bundle
download_bundle() {
    local cli_name="$1"
    local version="$2"
    local platform="$3"
    local arch="$4"

    local download_url=$(construct_download_url "$cli_name" "$version" "$platform" "$arch")
    local output_filename="${cli_name}-${version}-${platform}-${arch}"

    print_info "Downloading $cli_name CLI bundle..."
    print_info "URL: $download_url"
    print_info "Output: $output_filename"

    if curl -s -L -f -o "$output_filename" "$download_url"; then
        print_success "Downloaded $output_filename"
        chmod +x "$output_filename"
        print_info "Made $output_filename executable"
    else
        print_warning "Failed to download $cli_name bundle (might not exist for this platform/arch combination)"
        return 1
    fi
}

# Main execution
main() {
    print_info "Detecting system information..."

    # Detect platform and architecture
    PLATFORM=$(detect_platform)
    ARCH=$(detect_arch)

    print_info "Detected platform: $PLATFORM"
    print_info "Detected architecture: $ARCH"

    # Fetch latest version
    VERSION=$(fetch_latest_version)
    print_success "Latest version: $VERSION"

    # CLI names to download
    CLI_NAMES=("apify" "actor")

    # Download each CLI bundle
    local success_count=0
    for cli_name in "${CLI_NAMES[@]}"; do
        echo
        if download_bundle "$cli_name" "$VERSION" "$PLATFORM" "$ARCH"; then
            ((success_count++))
        fi
    done

    echo
    print_success "Download process completed!"
    print_info "Successfully downloaded $success_count out of ${#CLI_NAMES[@]} CLI bundles"

    # List downloaded files
    echo
    print_info "Downloaded files:"
    for cli_name in "${CLI_NAMES[@]}"; do
        local filename="${cli_name}-${VERSION}-${PLATFORM}-${ARCH}"
        if [ -f "$filename" ]; then
            echo "  ✓ $filename"
        else
            echo "  ✗ $filename (not found)"
        fi
    done
}

# Check if curl is available
if ! command -v curl &>/dev/null; then
    print_error "curl is required but not installed. Please install curl and try again."
    exit 1
fi

# Run main function
main "$@"
