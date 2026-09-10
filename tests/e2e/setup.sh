#!/usr/bin/env bash
# Creates the fixture posts used by smoke.mjs (post "holo-test") and gallery.mjs (post "all-variants").
# Run inside the WordPress install with WP-CLI available:  bash tests/e2e/setup.sh /path/to/card.jpg
set -euo pipefail
IMG="${1:-}"
[ -f "$IMG" ] || { echo "usage: $0 /path/to/image.jpg"; exit 1; }
ID=$(wp media import "$IMG" --porcelain)
URL=$(wp post get "$ID" --field=guid)
cat > /tmp/holo-test.html <<HTML
<!-- wp:image {"id":$ID,"sizeSlug":"full","className":"is-style-holo-cosmos"} -->
<figure class="wp-block-image size-full is-style-holo-cosmos"><img src="$URL" alt="" class="wp-image-$ID"/></figure>
<!-- /wp:image -->

<!-- wp:image {"id":$ID,"sizeSlug":"full","className":"is-style-holo-holo","lightbox":{"enabled":true},"holo":{"variant":"amazing-rare","intensity":1.2,"tilt":0.8,"touch":"tap","showcase":true,"window":false}} -->
<figure class="wp-block-image size-full is-style-holo-holo"><img src="$URL" alt="" class="wp-image-$ID"/></figure>
<!-- /wp:image -->

<!-- wp:image {"id":$ID,"align":"left","sizeSlug":"full","className":"is-style-holo-rainbow"} -->
<figure class="wp-block-image alignleft size-full is-style-holo-rainbow"><a href="https://example.com/"><img src="$URL" alt="" class="wp-image-$ID"/></a><figcaption class="wp-element-caption">Caption <em>here</em></figcaption></figure>
<!-- /wp:image -->

<!-- wp:image {"id":$ID,"sizeSlug":"full","className":"is-style-holo-glare","holo":{"variant":"","intensity":1,"tilt":1,"touch":"off","showcase":false,"window":true}} -->
<figure class="wp-block-image size-full is-style-holo-glare"><img src="$URL" alt="" class="wp-image-$ID"/></figure>
<!-- /wp:image -->

<!-- wp:image {"id":$ID,"sizeSlug":"full","className":"is-style-rounded"} -->
<figure class="wp-block-image size-full is-style-rounded"><img src="$URL" alt="" class="wp-image-$ID"/></figure>
<!-- /wp:image -->
HTML
wp post create /tmp/holo-test.html --post_title="Holo test" --post_name=holo-test --post_status=publish
node -e '
const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));let out="";
for (const [k,v] of Object.entries(j.variants)) out+=`<!-- wp:image {"id":${process.argv[2]},"sizeSlug":"full","className":"is-style-holo-${v.family}","holo":{"variant":"${k}","intensity":1,"tilt":1,"touch":"tap","showcase":false,"window":false}} -->\n<figure class="wp-block-image size-full is-style-holo-${v.family}"><img src="${process.argv[3]}" alt="" class="wp-image-${process.argv[2]}"/><figcaption class="wp-element-caption">${k}</figcaption></figure>\n<!-- /wp:image -->\n\n`;
require("fs").writeFileSync("/tmp/all-variants.html",out);' "$(dirname "$0")/../../src/variants.json" "$ID" "$URL"
wp post create /tmp/all-variants.html --post_title="All variants" --post_name=all-variants --post_status=publish
