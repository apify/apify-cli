#!/usr/bin/env bash
set -euo pipefail

# This script should be used like so: `/bin/cat dev-test-install.sh | bash`

# Reset
Color_Off=''

# Regular Colors
Red=''
Green=''
Dim='' # White

# Bold
Bold_White=''
Bold_Green=''

if [[ -t 1 ]]; then
    # Reset
    Color_Off='\033[0m' # Text Reset

    # Regular Colors
    Red='\033[0;31m'   # Red
    Green='\033[0;32m' # Green
    Dim='\033[0;2m'    # White

    # Bold
    Bold_Green='\033[1;32m' # Bold Green
    Bold_White='\033[1m'    # Bold White
fi

error() {
    echo -e "${Red}error${Color_Off}:" "$@" >&2
    exit 1
}

info() {
    echo -e "${Dim}$@ ${Color_Off}"
}

info_bold() {
    echo -e "${Bold_White}$@ ${Color_Off}"
}

success() {
    echo -e "${Green}$@ ${Color_Off}"
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
    exit 1
fi

echo "Install directory: $install_dir"
echo "Bin directory: $bin_dir"

# Ensure we have bun installed
if ! command -v bun &> /dev/null; then
    error "bun could not be found. Please install it from https://bun.sh/docs/installation"
    exit 1
fi

# Check package.json for the version
version=$(jq -r '.version' package.json)
echo "Version: $version"

info "Installing dependencies"
yarn

info "Building bundles"
yarn insert-cli-metadata && yarn build-bundles && git checkout origin/master -- src/lib/hooks/useCLIMetadata.ts

info "Installing bundles"

executable_names=("apify" "actor")

for executable_name in "${executable_names[@]}"; do
    output_filename="${executable_name}"

    info "Installing $executable_name bundle for version $version and target $target"

    cp "bundles/$executable_name-$version-$target" "$bin_dir/$output_filename"
    chmod +x "$bin_dir/$output_filename"
done

success "Installed bundles successfully"

if ! [ -t 0 ] && [ -r /dev/tty ]; then
    PROVIDED_INSTALL_DIR="$install_dir" FINAL_BIN_DIR="$bin_dir" APIFY_OPEN_TTY=1 "$bin_dir/apify" install
else
    PROVIDED_INSTALL_DIR="$install_dir" FINAL_BIN_DIR="$bin_dir" "$bin_dir/apify" install
fi
