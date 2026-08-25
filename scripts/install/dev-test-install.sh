#!/usr/bin/env bash
set -euo pipefail

# This script should be used from the repo root like so: `cat scripts/install/dev-test-install.sh | bash`

# Reset
Color_Off=''

# Regular Colors
Red=''
Dim='' # White

if [[ -t 1 ]]; then
    # Reset
    Color_Off='\033[0m' # Text Reset

    # Regular Colors
    Red='\033[0;31m'   # Red
    Dim='\033[0;2m'    # White
fi

error() {
    echo -e "${Red}error${Color_Off}:" "$@" >&2
    exit 1
}

info() {
    echo -e "${Dim}$@ ${Color_Off}"
}

platform=$(uname -ms)

case $platform in
'Darwin x86_64')
    target=darwin-x64
    ;;
'Darwin arm64')
    target=darwin-arm64
    ;;
'Linux aarch64' | 'Linux arm64')
    target=linux-arm64
    ;;
'MINGW64'*)
    target=windows-x64
    ;;
'Linux x86_64' | *)
    target=linux-x64
    ;;
esac

case "$target" in
'linux'*)
    if [ -f /etc/alpine-release ]; then
        target="$target-musl"
    fi
    ;;
esac

# If AVX2 isn't supported, use the -baseline build
case "$target" in
'darwin-x64'*)
    if [[ $(sysctl -a | grep machdep.cpu | grep AVX2) == '' ]]; then
        target="$target-baseline"
    fi
    ;;
'linux-x64'*)
    # If AVX2 isn't supported, use the -baseline build
    if [[ $(cat /proc/cpuinfo | grep avx2) = '' ]]; then
        target="$target-baseline"
    fi
    ;;
esac

install_env=APIFY_CLI_INSTALL
install_dir=${!install_env:-$HOME/.apify}
bin_dir=$install_dir/bin

if [[ ! -d $bin_dir ]]; then
    mkdir -p "$bin_dir" ||
        error "Failed to create install directory \"$bin_dir\""
fi

# Ensure we are in the apify-cli root by checking for ./package.json
if [[ ! -f ./package.json ]]; then
    error "Not in the apify-cli root"
fi

echo "Install directory: $install_dir"
echo "Bin directory: $bin_dir"

# Ensure we have bun installed
if ! command -v bun &> /dev/null; then
    error "bun could not be found. Please install it from https://bun.sh/docs/installation"
    exit 1
fi

# Ensure we have jq installed
if ! command -v jq &> /dev/null; then
    error "jq could not be found. Please install it from https://stedolan.github.io/jq/"
    exit 1
fi
# Check package.json for the version
version=$(jq -r '.version' package.json)
echo "Version: $version"

info "Installing dependencies"
pnpm install

info "Building bundles"
pnpm run insert-cli-metadata && pnpm run build-bundles && git checkout -- src/lib/hooks/useCLIMetadata.ts

info "Installing bundle"

# We now ship a single `apify-cli` bundle. The `apify` and `actor` commands are tiny wrapper scripts
# that invoke it with APIFY_CLI_ENTRYPOINT set, instead of dropping the same binary three times.
info "Installing apify-cli bundle for version $version and target $target"

cp "bundles/apify-cli-$version-$target" "$bin_dir/apify-cli"
chmod +x "$bin_dir/apify-cli"

# Invoke the bundle to create the `apify`/`actor` wrapper scripts and handle shell integration.
if ! [ -t 0 ] && [ -r /dev/tty ]; then
    PROVIDED_INSTALL_DIR="$install_dir" FINAL_BIN_DIR="$bin_dir" APIFY_CLI_SKIP_UPDATE_CHECK=1 APIFY_OPEN_TTY=1 "$bin_dir/apify-cli" install
else
    PROVIDED_INSTALL_DIR="$install_dir" FINAL_BIN_DIR="$bin_dir" APIFY_CLI_SKIP_UPDATE_CHECK=1 "$bin_dir/apify-cli" install
fi
