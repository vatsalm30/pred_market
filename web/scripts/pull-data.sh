#!/usr/bin/env bash
# Copies the latest market data from the repo's `data` branch (published by the GCP
# pipeline) into the working tree. Run from anywhere; used by CI and for local dev.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git fetch --quiet --depth=1 origin data
git ls-tree -r --name-only FETCH_HEAD | while read -r f; do
  mkdir -p "$(dirname "$f")"
  git show "FETCH_HEAD:$f" > "$f"
done
echo "market data updated from the data branch"
