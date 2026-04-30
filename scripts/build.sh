#!/usr/bin/env bash
set -euo pipefail
rm -rf web/data
cp -r data web/data
echo "data/ → web/data/ copied"
