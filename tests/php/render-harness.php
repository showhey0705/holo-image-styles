<?php
/**
 * Standalone harness for Render::inject (no full WordPress needed).
 * Usage: WP_CORE=/path/to/wordpress php tests/php/render-harness.php
 */
declare(strict_types=1);

$core = getenv( 'WP_CORE' ) ?: dirname( __DIR__, 3 ) . '/wordpress';
define( 'ABSPATH', $core . '/' );
require_once ABSPATH . 'wp-includes/utf8.php';
foreach ( [ 'class-wp-html-attribute-token', 'class-wp-html-span', 'class-wp-html-text-replacement', 'class-wp-html-decoder', 'class-wp-html-tag-processor' ] as $f ) {
	$p = ABSPATH . 'wp-includes/html-api/' . $f . '.php';
	if ( file_exists( $p ) ) {
		require_once $p;
	}
}
if ( ! class_exists( 'WP_HTML_Tag_Processor' ) ) {
	fwrite( STDERR, "WP_HTML_Tag_Processor not found in $core\n" );
	exit( 1 );
}

// Minimal WP function stubs.
function wp_kses_uri_attributes() { return [ 'href', 'src' ]; }
function esc_url( $u ) { return $u; }
function esc_url_raw( $u ) { return $u; }
function wp_parse_url( $u, $c = -1 ) { return parse_url( $u, $c ); }
function esc_attr( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES, 'UTF-8' ); }
function sanitize_key( $k ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $k ) ); }
function plugins_url( $path, $file ) { return 'https://example.test/wp-content/plugins/' . basename( dirname( $file ) ) . '/' . $path; }
function wp_rand( $a, $b ) { return 123; }
function add_filter( ...$a ) {}
function add_action( ...$a ) {}
function plugin_dir_path( $f ) { return dirname( $f ) . '/'; }

$dist = dirname( __DIR__, 2 ) . '/dist/' . ( getenv( 'HOLO_DIST' ) ?: 'holo-image-styles-all' );
define( 'HOLO_EDITION', str_ends_with( $dist, '-all' ) ? 'all' : 'free' );
define( 'HOLO_IMAGE_STYLES_VERSION', '0.0.0' );
define( 'HOLO_IMAGE_STYLES_FILE', $dist . '/' . basename( $dist ) . '.php' );
require $dist . '/inc/class-variants.php';
require $dist . '/inc/class-render.php';

// Stub Plugin::instance()->enqueue_front_assets().
namespace_stub:
eval( 'namespace HoloImageStyles; final class Plugin { public static array $enq = []; public static function instance() { return new self(); } public function enqueue_front_assets( string $f ): void { self::$enq[] = $f; } }' );

use HoloImageStyles\Render;
use HoloImageStyles\Plugin;

$render = new Render();
$fail   = 0;
$check  = function ( string $name, bool $ok ) use ( &$fail ) {
	echo ( $ok ? '  ok   ' : '  FAIL ' ) . $name . "\n";
	if ( ! $ok ) {
		$fail++;
	}
};

$img = '<img src="https://example.test/a.jpg" alt="" class="wp-image-1" width="640" height="480">';

// 1. Plain figure.
$in  = '<figure class="wp-block-image size-large is-style-holo-cosmos">' . $img . '</figure>';
$out = $render->inject( $in, [ 'blockName' => 'core/image', 'attrs' => [ 'className' => 'is-style-holo-cosmos' ] ] );
echo "1: $out\n";
$check( 'wrapper present', str_contains( $out, '<div class="holo__card" data-holo-variant="cosmos"' ) );
$check( 'two layers', substr_count( $out, 'holo__shine' ) === 1 && substr_count( $out, 'holo__glare' ) === 1 );
$check( 'layers after img', strpos( $out, '<img' ) < strpos( $out, 'holo__shine' ) );
$check( 'marker removed', ! str_contains( $out, 'data-holo-marker' ) );
$check( 'cosmos textures', substr_count( $out, '--tex-' ) === 3 && str_contains( $out, '--cosmosbg:123px 123px' ) );
$check( 'interactive ns on card not figure', preg_match( '/<figure[^>]*data-wp-interactive/', $out ) === 0 && str_contains( $out, 'data-wp-interactive="holo-image-styles"' ) );
$check( 'directives carry explicit namespace', str_contains( $out, 'data-wp-init="holo-image-styles::callbacks.init"' ) && str_contains( $out, 'data-wp-on-async--pointermove="holo-image-styles::actions.move"' ) );
$check( 'enqueued family', Plugin::$enq === [ 'cosmos' ] );

// 2. Lightbox markup (button after img, directives on figure).
$in  = '<figure data-wp-context="{}" data-wp-interactive="core/image" class="wp-block-image size-large is-style-holo-holo wp-lightbox-container">' . $img . '<button class="lightbox-trigger" type="button" aria-haspopup="dialog" aria-label="Enlarge" data-wp-init="callbacks.initTriggerButton"><svg></svg></button></figure>';
$out = $render->inject( $in, [ 'attrs' => [ 'className' => 'is-style-holo-holo', 'holo' => [ 'variant' => 'amazing-rare', 'intensity' => '2', 'tilt' => 0.5, 'touch' => 'off', 'window' => 1 ] ] ] );
echo "2: $out\n";
$check( 'card inherits core/image namespace when lightbox is on', str_contains( $out, '<div class="holo__card" data-holo-variant="' ) && preg_match( '/<div class="holo__card"[^>]*data-wp-interactive="core\/image"/', $out ) === 1 );
$check( 'lightbox button inside card', strpos( $out, 'lightbox-trigger' ) < strpos( $out, 'holo__shine' ) && strpos( $out, 'lightbox-trigger' ) > strpos( $out, 'holo__card' ) );
$check( 'variant kept (all) or fallback (free)', str_contains( $out, HOLO_EDITION === 'all' ? 'data-holo-variant="amazing-rare"' : 'data-holo-variant="rare-holo"' ) );
$check( 'intensity clamped to 1.5', str_contains( $out, '--holo-intensity:1.5;' ) );
$check( 'tilt 0.5', str_contains( $out, '--holo-tilt:0.5;' ) );
$check( 'touch off + window', str_contains( $out, 'data-holo-touch="off"' ) && str_contains( $out, 'data-holo-window="1"' ) );

// 3. Caption + link + alignleft (outer div).
$in  = '<div class="wp-block-image"><figure class="alignleft size-full is-style-holo-rainbow is-resized"><a href="https://x.test/"><img src="a.jpg" alt=""></a><figcaption class="wp-element-caption">Cap <b>tion</b></figcaption></figure></div>';
$out = $render->inject( $in, [ 'attrs' => [ 'align' => 'left', 'className' => 'is-style-holo-rainbow', 'holo' => [ 'variant' => 'v-alt' ] ] ] );
echo "3: $out\n";
$check( 'figcaption outside card', strpos( $out, '</div><figcaption' ) !== false );
$check( 'link inside card', preg_match( '#<div class="holo__card"[^>]*><a href#', $out ) === 1 );
$check( 'outer div untouched', str_starts_with( $out, '<div class="wp-block-image"><figure' ) );
$check( 'v-alt only in all edition', str_contains( $out, HOLO_EDITION === 'all' ? 'data-holo-variant="v-alt"' : 'data-holo-variant="rainbow-rare"' ) );

// 4. Pass-through cases.
$check( 'no img → untouched', $render->inject( '<figure class="wp-block-image is-style-holo-glare"></figure>', [ 'attrs' => [ 'className' => 'is-style-holo-glare' ] ] ) === '<figure class="wp-block-image is-style-holo-glare"></figure>' );
$check( 'unknown family → untouched', $render->inject( $in, [ 'attrs' => [ 'className' => 'is-style-holo-nope' ] ] ) === $in );
$check( 'no className → untouched', $render->inject( $in, [ 'attrs' => [] ] ) === $in );
$check( 'other style → untouched', $render->inject( $in, [ 'attrs' => [ 'className' => 'is-style-rounded' ] ] ) === $in );
$check( 'className mismatch with markup → untouched', $render->inject( $in, [ 'attrs' => [ 'className' => 'is-style-holo-holo' ] ] ) === $in );

// 5. Attribute value containing ">" is escaped by WP and does not break slicing.
$in  = '<figure class="wp-block-image is-style-holo-glare"><img src="a.jpg" alt="a &gt; b"></figure>';
$out = $render->inject( $in, [ 'attrs' => [ 'className' => 'is-style-holo-glare' ] ] );
$check( 'escaped > in alt survives', str_contains( $out, 'alt="a &gt; b"' ) && str_contains( $out, '</div></figure>' ) );

// 5b. Alpha-capable formats get a mask, JPEGs do not.
$out = $render->inject( '<figure class="wp-block-image is-style-holo-glare"><img src="https://x.test/a.png?x=1" alt=""></figure>', [ 'attrs' => [ 'className' => 'is-style-holo-glare' ] ] );
$check( 'png gets --holo-mask', str_contains( $out, '--holo-mask:url(https://x.test/a.png?x=1)' ) );
$out = $render->inject( '<figure class="wp-block-image is-style-holo-glare"><img src="https://x.test/a.jpg" alt=""></figure>', [ 'attrs' => [ 'className' => 'is-style-holo-glare' ] ] );
$check( 'jpg gets no mask', ! str_contains( $out, '--holo-mask' ) );

// 6. Border radius passthrough + bad values rejected.
$out = $render->inject( '<figure class="wp-block-image is-style-holo-glare"><img src="a.jpg" alt=""></figure>', [ 'attrs' => [ 'className' => 'is-style-holo-glare', 'style' => [ 'border' => [ 'radius' => '12px' ] ] ] ] );
$check( 'radius 12px', str_contains( $out, '--holo-radius:12px;' ) );
$out = $render->inject( '<figure class="wp-block-image is-style-holo-glare"><img src="a.jpg" alt=""></figure>', [ 'attrs' => [ 'className' => 'is-style-holo-glare', 'style' => [ 'border' => [ 'radius' => '12px;color:red' ] ] ] ] );
$check( 'bad radius rejected', ! str_contains( $out, '--holo-radius' ) );

// 7. Showcase: true = defaults, object = per-image (clamped, whitelisted), enter flag, off.
$fig = '<figure class="wp-block-image is-style-holo-glare"><img src="a.jpg" alt=""></figure>';
$out = $render->inject( $fig, [ 'attrs' => [ 'className' => 'is-style-holo-glare', 'holo' => [ 'showcase' => true ] ] ] );
$check( 'showcase true = defaults', str_contains( $out, ' data-holo-showcase="1" data-holo-sc-delay="1" data-holo-sc-duration="3" data-holo-sc-path="orbit" data-holo-sc-stagger="sequence"' ) && ! str_contains( $out, 'data-holo-enter' ) );
$out = $render->inject( $fig, [ 'attrs' => [ 'className' => 'is-style-holo-glare', 'holo' => [ 'showcase' => [ 'delay' => '0', 'duration' => 9, 'path' => 'sweep', 'stagger' => 'nope', 'enter' => 1 ] ] ] ] );
$check( 'showcase object clamped/whitelisted', str_contains( $out, 'data-holo-sc-delay="0" data-holo-sc-duration="5" data-holo-sc-path="sweep" data-holo-sc-stagger="sequence" data-holo-enter="1"' ) );
$out = $render->inject( $fig, [ 'attrs' => [ 'className' => 'is-style-holo-glare', 'holo' => [ 'showcase' => [ 'path' => 'evil"><script>' ] ] ] ] );
$check( 'showcase bad path falls back', str_contains( $out, 'data-holo-sc-path="orbit"' ) && ! str_contains( $out, '<script>' ) );
$out = $render->inject( $fig, [ 'attrs' => [ 'className' => 'is-style-holo-glare', 'holo' => [ 'showcase' => false ] ] ] );
$check( 'showcase off', ! str_contains( $out, 'data-holo-showcase' ) );

echo $fail ? "\n$fail FAILED\n" : "\nALL OK\n";
exit( $fail ? 1 : 0 );
