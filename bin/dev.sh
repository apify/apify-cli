#!/bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${DIR}"/../node_modules/.bin/tsx "${DIR}"/dev.js "$@"
