#!/usr/bin/env bash
# Regenerate translation files after changing UI strings (needs WP-CLI):
#   bash bin/i18n.sh    (or: npm run i18n)
# 1. .pot from src/ (JS + PHP)   2. merge into ja.po (translate the new msgids by hand, then re-run)
# 3. .mo / .l10n.php / .json — the JSON must be named md5("build/editor.js") because that is the
#    script path WordPress hashes at runtime (wp_set_script_translations), not the src/ path in the .po.
set -euo pipefail
cd "$(dirname "$0")/.."
WP=( wp )
[ "$(id -u)" = "0" ] && WP+=( --allow-root )
"${WP[@]}" i18n make-pot . languages/holo-image-styles.pot --domain=holo-image-styles --exclude=node_modules,vendor,dist,build,tests,bin,wordpress
"${WP[@]}" i18n update-po languages/holo-image-styles.pot languages/holo-image-styles-ja.po
cd languages
"${WP[@]}" i18n make-mo holo-image-styles-ja.po
"${WP[@]}" i18n make-php holo-image-styles-ja.po
rm -f holo-image-styles-ja-*.json
"${WP[@]}" i18n make-json holo-image-styles-ja.po --no-purge --pretty-print=false
HASH=$(printf '%s' 'build/editor.js' | md5sum | cut -d' ' -f1)
for f in holo-image-styles-ja-*.json; do
  [ "$f" = "holo-image-styles-ja-$HASH.json" ] || mv "$f" "holo-image-styles-ja-$HASH.json"
done
ls -1
