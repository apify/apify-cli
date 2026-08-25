#!/usr/bin/env bash
set -euo pipefail

# This script installs the CLI in the OLD layout (three full binaries: apify, actor, apify-cli) so you
# can test the single-bundle self-migration locally. It is identical to dev-test-install.sh except for
# the install section.
#
# After running it, your bin directory will hold the legacy 3-binary state. Run `apify` (or `actor`)
# afterwards to trigger the migration to the new single-bundle layout (set APIFY_CLI_DEBUG=1 to watch).
#
# This script should be used from the repo root like so: `cat scripts/install/dev-test-install-legacy.sh | bash`

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

info "Installing bundles in the legacy 3-binary layout"

# Reproduce the OLD install layout: `apify` and `actor` are full binaries, and `apify-cli` is a copy of
# `apify` (the alias the old install scripts created). The build now emits backwards-compatible
# `apify-*`/`actor-*` copies of the single bundle, so we use those to populate apify and actor.
for executable_name in apify actor; do
    info "Installing $executable_name bundle for version $version and target $target"

    cp "bundles/$executable_name-$version-$target" "$bin_dir/$executable_name"
    chmod +x "$bin_dir/$executable_name"
done

# Alias apify to apify-cli, as the old install scripts did
cp "$bin_dir/apify" "$bin_dir/apify-cli"
chmod +x "$bin_dir/apify-cli"

# NOTE: we intentionally do NOT run `apify install` here. The freshly built bundle contains the
# self-migration logic, which runs on the first invocation of any command and would immediately convert
# this legacy layout into the new single-bundle layout - defeating the purpose of this script.
info "Legacy 3-binary layout installed:"
ls -la "$bin_dir/apify" "$bin_dir/actor" "$bin_dir/apify-cli"

echo ""
info "To test the migration, run a command and watch the debug output, e.g.:"
echo "  APIFY_CLI_DEBUG=1 \"$bin_dir/apify\" --version"
echo ""
info "Afterwards, apify and actor should become small wrapper scripts and apify-cli the only binary."
