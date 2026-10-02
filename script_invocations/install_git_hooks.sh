#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

if [ ! -x .githooks/pre-push ]; then
  echo "Expected executable hook at $repo_root/.githooks/pre-push" >&2
  exit 1
fi

git config --local core.hooksPath .githooks
printf 'Installed repository Git hooks from %s/.githooks\n' "$repo_root"
