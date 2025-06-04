#!/usr/bin/env bash
set -euo pipefail

# The following script is adapted from the bun.sh install script
# Licensed under the MIT License (https://github.com/oven-sh/bun/blob/main/LICENSE.md)

platform=$(uname -ms)

# Invoke the ps1 script if on Windows
if [[ ${OS:-} = Windows_NT ]]; then
    if [[ $platform != MINGW64* ]]; then
        powershell -c "irm https://apify.com/install-cli.ps1|iex"
        exit $?
    fi
fi

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

if [[ $# -gt 1 ]]; then
    error 'Too many arguments, only 1 is allowed. The first can be a specific tag of Apify CLI to install. (e.g. "0.28.0")'
fi

# Check if curl is available
if ! command -v curl &>/dev/null; then
    error "curl is required but not installed. Please install curl and try again."
fi

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

if [[ $target = darwin-x64 ]]; then
    # Is this process running in Rosetta?
    # redirect stderr to devnull to avoid error message when not running in Rosetta
    if [[ $(sysctl -n sysctl.proc_translated 2>/dev/null) = 1 ]]; then
        target=darwin-arm64
        info "Your shell is running in Rosetta 2. Downloading Apify CLI for $target instead"
    fi
fi

GITHUB=${GITHUB-"https://github.com"}

github_repo="$GITHUB/apify/apify-cli"

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

# Function to fetch latest version from GitHub API
fetch_latest_version() {
    local api_url="https://api.github.com/repos/apify/apify-cli/releases/latest"
    local response=$(curl -s "$api_url")

    if [ $? -ne 0 ]; then
        error "Failed to fetch latest version from GitHub API"
    fi

    # Extract tag_name and strip 'v' prefix
    local version=$(echo "$response" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' | sed 's/^v//')

    if [ -z "$version" ]; then
        error "Failed to parse version from GitHub API response"
    fi

    echo "$version"
}

executable_names=("apify" "actor")

if [[ $# = 0 || $1 = "latest" ]]; then
    version=$(fetch_latest_version)
else
    version=$1

    # Validate version format
    if [[ ! $version =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]]; then
        error "Invalid version format: $version. Expected format: x.y.z or x.y.z-beta.n (with optional 'v' prefix)"
    fi

    # Trim 'v' prefix if present
    version=${version#v}
fi

# Function to construct download URL
construct_download_url() {
    local cli_name="$1"
    local edition="$2"

    echo "https://github.com/apify/apify-cli/releases/download/v${version}/${cli_name}-${version}-${edition}"
}

install_env=APIFY_CLI_INSTALL
bin_env=\$$install_env/bin

install_dir=${!install_env:-$HOME/.apify}
bin_dir=$install_dir/bin

if [[ ! -d $bin_dir ]]; then
    mkdir -p "$bin_dir" ||
        error "Failed to create install directory \"$bin_dir\""
fi

for executable_name in "${executable_names[@]}"; do
    download_url=$(construct_download_url "$executable_name" "$target")
    output_filename="${executable_name}"

    curl --fail --location --progress-bar --output "$bin_dir/$output_filename" "$download_url" 2>/dev/null ||
        error "Failed to download $executable_name bundle for version $version and target $target (might not exist for this platform/arch combination)"

    chmod +x "$bin_dir/$output_filename" ||
        error "Failed to set permissions on $executable_name executable"

    # Alias apify to apify-cli, as npm does (because otherwise npx apify-cli wouldn't work)
    if [[ $executable_name = "apify" ]]; then
        cp "$bin_dir/$output_filename" "$bin_dir/apify-cli"
    fi
done

tildify() {
    if [[ $1 = $HOME/* ]]; then
        local replacement=\~/

        echo "${1/$HOME\//$replacement}"
    else
        echo "$1"
    fi
}

success "Apify CLI was installed successfully to $Bold_Green$(tildify "$bin_dir/apify")"
success "Actor CLI was installed successfully to $Bold_Green$(tildify "$bin_dir/actor")"

if command -v apify >/dev/null; then
    success "Run 'apify --help' to get started"
    exit
fi

refresh_command=''

tilde_bin_dir=$(tildify "$bin_dir")
quoted_install_dir=\"${install_dir//\"/\\\"}\"

if [[ $quoted_install_dir = \"$HOME/* ]]; then
    quoted_install_dir=${quoted_install_dir/$HOME\//\$HOME/}
fi

echo

case $(basename "$SHELL") in
fish)
    commands=(
        "set --export $install_env $quoted_install_dir"
        "set --export PATH $bin_env \$PATH"
    )

    fish_config=$HOME/.config/fish/config.fish
    tilde_fish_config=$(tildify "$fish_config")

    if [[ -w $fish_config ]]; then
        {
            echo -e '\n# apify cli'

            for command in "${commands[@]}"; do
                echo "$command"
            done
        } >>"$fish_config"

        info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_fish_config\""

        refresh_command="source $tilde_fish_config"
    else
        echo "Manually add the directory to $tilde_fish_config (or similar):"

        for command in "${commands[@]}"; do
            info_bold "  $command"
        done
    fi
    ;;
zsh)
    commands=(
        "export $install_env=$quoted_install_dir"
        "export PATH=\"$bin_env:\$PATH\""
    )

    zsh_config=$HOME/.zshrc
    tilde_zsh_config=$(tildify "$zsh_config")

    if [[ -w $zsh_config ]]; then
        {
            echo -e '\n# apify cli'

            for command in "${commands[@]}"; do
                echo "$command"
            done
        } >>"$zsh_config"

        info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_zsh_config\""

        refresh_command="exec $SHELL"
    else
        echo "Manually add the directory to $tilde_zsh_config (or similar):"

        for command in "${commands[@]}"; do
            info_bold "  $command"
        done
    fi
    ;;
bash)
    commands=(
        "export $install_env=$quoted_install_dir"
        "export PATH=\"$bin_env:\$PATH\""
    )

    bash_configs=(
        "$HOME/.bashrc"
        "$HOME/.bash_profile"
    )

    if [[ ${XDG_CONFIG_HOME:-} ]]; then
        bash_configs+=(
            "$XDG_CONFIG_HOME/.bash_profile"
            "$XDG_CONFIG_HOME/.bashrc"
            "$XDG_CONFIG_HOME/bash_profile"
            "$XDG_CONFIG_HOME/bashrc"
        )
    fi

    set_manually=true
    for bash_config in "${bash_configs[@]}"; do
        tilde_bash_config=$(tildify "$bash_config")

        if [[ -w $bash_config ]]; then
            {
                echo -e '\n# apify cli'

                for command in "${commands[@]}"; do
                    echo "$command"
                done
            } >>"$bash_config"

            info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_bash_config\""

            refresh_command="source $bash_config"
            set_manually=false
            break
        fi
    done

    if [[ $set_manually = true ]]; then
        echo "Manually add the directory to $tilde_bash_config (or similar):"

        for command in "${commands[@]}"; do
            info_bold "  $command"
        done
    fi
    ;;
*)
    echo 'Manually add the directory to ~/.bashrc (or similar):'
    info_bold "  export $install_env=$quoted_install_dir"
    info_bold "  export PATH=\"$bin_env:\$PATH\""
    ;;
esac

echo
info "To get started, run:"
echo

if [[ $refresh_command ]]; then
    info_bold "  $refresh_command $(info "(if the shell is not automatically refreshed)")"
fi

info_bold "  apify --help"
echo

# Not ideal but its the only way to refresh the shell (this also means if you type exit / CTRL+D, you'll need to do it twice)
exec $SHELL
