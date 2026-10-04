#!/bin/sh
# bump the cache-busting version (so browsers fetch the new files), commit and push
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M%S)
sed -i -E "s/(main\.js|style\.css)(\?v=[0-9]+)?\"/\1?v=$V\"/g" index.html
sed -i -E "s/(thermal\.js|thermal\.css|style\.css)(\?v=[0-9]+)?\"/\1?v=$V\"/g" thermal/index.html
sed -i -E "s/(viewer\.js|viewer\.css|style\.css)(\?v=[0-9]+)?\"/\1?v=$V\"/g" viewer/index.html
git add -A
git commit -q -m "${1:-Update site} (v$V)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q
echo "deployed v$V"
