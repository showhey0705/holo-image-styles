#!/usr/bin/env bash
# Creates the fixture posts used by smoke.mjs (post "holo-test") and gallery.mjs (post "all-variants").
# Run inside the WordPress install with WP-CLI available:  bash tests/e2e/setup.sh [/path/to/card.jpg]
# Without an argument the committed tests/e2e/card.jpg is used, so no network access is needed.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
IMG="${1:-$DIR/card.jpg}"
[ -s "$IMG" ] || IMG="$DIR/card.jpg"
[ -s "$IMG" ] || { echo "no fixture image found (looked at $IMG)"; exit 1; }
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
# Note: the wp-env CLI container has PHP/WP-CLI but no Node, so this is PHP, not `node -e`.
php -r '
$j   = json_decode( file_get_contents( $argv[1] ), true );
$id  = (int) $argv[2];
$url = $argv[3];
$out = "";
foreach ( $j["variants"] as $k => $v ) {
	$f    = $v["family"];
	$out .= "<!-- wp:image {\"id\":" . $id . ",\"sizeSlug\":\"full\",\"className\":\"is-style-holo-" . $f . "\",\"holo\":{\"variant\":\"" . $k . "\",\"intensity\":1,\"tilt\":1,\"touch\":\"tap\",\"showcase\":false,\"window\":false}} -->\n";
	$out .= "<figure class=\"wp-block-image size-full is-style-holo-" . $f . "\"><img src=\"" . $url . "\" alt=\"\" class=\"wp-image-" . $id . "\"/><figcaption class=\"wp-element-caption\">" . $k . "</figcaption></figure>\n";
	$out .= "<!-- /wp:image -->\n\n";
}
file_put_contents( "/tmp/all-variants.html", $out );
' "$DIR/../../src/variants.json" "$ID" "$URL"
wp post create /tmp/all-variants.html --post_title="All variants" --post_name=all-variants --post_status=publish
