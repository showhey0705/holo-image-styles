<?php
/**
 * Front-end markup injection for core/image (SPEC §4).
 *
 * @package HoloImageStyles
 */

namespace HoloImageStyles;

defined( 'ABSPATH' ) || exit;

/**
 * Wraps the image inside `figure.is-style-holo-*` with `.holo__card` and the shine/glare layers.
 * The saved block markup is never touched; everything happens at render time.
 */
final class Render {

	public const INTERACTIVITY_NS = 'holo-image-styles';

	/**
	 * Attribute defaults. Must be identical to the JS defaults (SPEC §6.1).
	 *
	 * @var array{variant:string,intensity:float|int,tilt:float|int,touch:string,glow:string,click:string,showcase:bool,window:bool}
	 */
	public const DEFAULTS = [
		'variant'   => '',
		'intensity' => 1,
		'tilt'      => 1,
		'touch'     => 'tap',
		'glow'      => 'soft',
		'click'     => 'none',
		'showcase'  => false,
		'window'    => false,
	];

	/**
	 * Hook up.
	 */
	public function register(): void {
		// Priority 20: after core's lightbox filter so the lightbox button is inside the wrapper.
		add_filter( 'render_block_core/image', [ $this, 'inject' ], 20, 2 );
	}

	/**
	 * Detect the family from the block's className attribute.
	 *
	 * @param array<string,mixed> $attrs Block attributes.
	 * @return string Family slug or ''.
	 */
	public static function detect_family( array $attrs ): string {
		$class = isset( $attrs['className'] ) && is_string( $attrs['className'] ) ? $attrs['className'] : '';
		if ( '' === $class || ! preg_match( '/\bis-style-holo-([a-z]+)\b/', $class, $m ) ) {
			return '';
		}
		return Variants::has_family( $m[1] ) ? $m[1] : '';
	}

	/**
	 * Sanitize the `holo` block attribute.
	 *
	 * @param mixed  $raw    Attribute value.
	 * @param string $family Family slug.
	 * @return array{variant:string,intensity:float,tilt:float,touch:string,glow:string,click:string,showcase:array{delay:float,duration:float,path:string,stagger:string,enter:bool}|false,window:bool}
	 */
	public static function sanitize_holo( $raw, string $family ): array {
		$raw   = is_array( $raw ) ? $raw : [];
		$num   = static function ( $v, float $fallback ): float {
			if ( ! is_numeric( $v ) ) {
				return $fallback;
			}
			return max( 0.0, min( 1.5, (float) $v ) );
		};
		$touch = isset( $raw['touch'] ) && is_string( $raw['touch'] ) ? $raw['touch'] : self::DEFAULTS['touch'];
		if ( ! in_array( $touch, [ 'tap', 'glare', 'off' ], true ) ) {
			$touch = self::DEFAULTS['touch'];
		}
		$glow = isset( $raw['glow'] ) && is_string( $raw['glow'] ) ? $raw['glow'] : self::DEFAULTS['glow'];
		if ( ! in_array( $glow, [ 'soft', 'none', 'color' ], true ) ) {
			$glow = self::DEFAULTS['glow'];
		}
		$click = isset( $raw['click'] ) && is_string( $raw['click'] ) ? $raw['click'] : self::DEFAULTS['click'];
		if ( ! in_array( $click, [ 'none', 'lift' ], true ) ) {
			$click = self::DEFAULTS['click'];
		}
		$variant = isset( $raw['variant'] ) && is_string( $raw['variant'] ) ? sanitize_key( $raw['variant'] ) : '';
		return [
			'variant'   => Variants::resolve( $family, $variant ),
			'intensity' => $num( $raw['intensity'] ?? null, (float) self::DEFAULTS['intensity'] ),
			'tilt'      => $num( $raw['tilt'] ?? null, (float) self::DEFAULTS['tilt'] ),
			'touch'     => $touch,
			'glow'      => $glow,
			'click'     => $click,
			'showcase'  => self::sanitize_showcase( $raw['showcase'] ?? false ),
			'window'    => ! empty( $raw['window'] ),
		];
	}

	/**
	 * Showcase defaults (used when the attribute is `true` or a partial object). Mirror the JS SHOWCASE_DEFAULTS.
	 *
	 * @var array{delay:float,duration:float,path:string,stagger:string,enter:bool}
	 */
	public const SHOWCASE_DEFAULTS = [
		'delay'    => 1.0,
		'duration' => 3.0,
		'path'     => 'orbit',
		'stagger'  => 'sequence',
		'enter'    => false,
	];

	/**
	 * Sanitize the showcase sub-attribute: `false`/empty = off, `true` = defaults, object = per-image values.
	 *
	 * @param mixed $raw Attribute value.
	 * @return array{delay:float,duration:float,path:string,stagger:string,enter:bool}|false
	 */
	public static function sanitize_showcase( $raw ) {
		if ( empty( $raw ) ) {
			return false;
		}
		$raw  = is_array( $raw ) ? $raw : [];
		$num  = static function ( $v, float $fallback, float $min, float $max ): float {
			return is_numeric( $v ) ? max( $min, min( $max, (float) $v ) ) : $fallback;
		};
		$path = isset( $raw['path'] ) && is_string( $raw['path'] ) ? $raw['path'] : self::SHOWCASE_DEFAULTS['path'];
		if ( ! in_array( $path, [ 'orbit', 'sweep', 'diagonal' ], true ) ) {
			$path = self::SHOWCASE_DEFAULTS['path'];
		}
		$stagger = isset( $raw['stagger'] ) && is_string( $raw['stagger'] ) ? $raw['stagger'] : self::SHOWCASE_DEFAULTS['stagger'];
		if ( ! in_array( $stagger, [ 'together', 'sequence' ], true ) ) {
			$stagger = self::SHOWCASE_DEFAULTS['stagger'];
		}
		return [
			'delay'    => $num( $raw['delay'] ?? null, self::SHOWCASE_DEFAULTS['delay'], 0.0, 3.0 ),
			'duration' => $num( $raw['duration'] ?? null, self::SHOWCASE_DEFAULTS['duration'], 1.0, 5.0 ),
			'path'     => $path,
			'stagger'  => $stagger,
			'enter'    => ! empty( $raw['enter'] ),
		];
	}

	/**
	 * Build the inline style for `.holo__card` (custom properties only).
	 *
	 * @param string                                                                              $family Family slug.
	 * @param array{variant:string,intensity:float,tilt:float,touch:string,glow:string,click:string,showcase:array{delay:float,duration:float,path:string,stagger:string,enter:bool}|false,window:bool} $holo   Sanitized attribute.
	 * @param array<string,mixed>                                                                 $attrs  Block attributes (for border radius).
	 * @param string                                                                              $img_src Rendered <img src> (for the alpha mask).
	 */
	public static function card_style( string $family, array $holo, array $attrs = [], string $img_src = '' ): string {
		$fam  = Variants::get_family( $family );
		$var  = Variants::variant( $holo['variant'] );
		$vars = [
			'--holo-intensity' => self::fmt( $holo['intensity'] ),
			'--holo-tilt'      => self::fmt( $holo['tilt'] ),
			'--holo-glow'      => $fam['glow'] ?? 'hsl(0 0% 100%)',
		];
		if ( null !== $var ) {
			$i = 0;
			foreach ( array_slice( $var['textures'], 0, 3 ) as $file ) {
				++$i;
				$vars[ '--tex-' . $i ] = 'url(' . plugins_url( 'textures/' . $file, HOLO_IMAGE_STYLES_FILE ) . ')';
			}
		}
		if ( 'cosmos' === $family ) {
			// Random star-field offset (the original does this in JS).
			$vars['--cosmosbg'] = wp_rand( 0, 734 ) . 'px ' . wp_rand( 0, 1280 ) . 'px';
		}
		// Images that can carry transparency (PNG/WebP/GIF/AVIF/SVG): mask the light layers with the image
		// itself so nothing is painted over transparent pixels (rounded corners, cut-outs).
		if ( '' !== $img_src && self::may_have_alpha( $img_src ) ) {
			$vars['--holo-mask'] = 'url(' . esc_url_raw( $img_src ) . ')';
		}
		$radius = $attrs['style']['border']['radius'] ?? null;
		if ( is_string( $radius ) && preg_match( '/^[0-9.]+(px|em|rem|%|vw|vh)$/', $radius ) ) {
			$vars['--holo-radius'] = $radius;
		}
		$style = '';
		foreach ( $vars as $name => $value ) {
			$style .= $name . ':' . $value . ';';
		}
		return $style;
	}

	/**
	 * Filter callback for render_block_core/image.
	 *
	 * @param string              $content Rendered block HTML.
	 * @param array<string,mixed> $block   Parsed block.
	 */
	public function inject( string $content, array $block ): string {
		$attrs  = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : [];
		$family = self::detect_family( $attrs );
		if ( '' === $family || ! str_contains( $content, '<img' ) ) {
			return $content;
		}

		// Find the figure carrying the style class (with alignments the figure sits inside a div.wp-block-image).
		$p     = new \WP_HTML_Tag_Processor( $content );
		$found = false;
		while ( $p->next_tag( [ 'tag_name' => 'FIGURE' ] ) ) {
			if ( $p->has_class( 'is-style-holo-' . $family ) ) {
				$found = true;
				break;
			}
		}
		if ( ! $found ) {
			return $content;
		}
		/*
		 * Namespace of the interactive region. Core's lightbox puts data-wp-interactive="core/image" on the
		 * figure and its directives (img / button) are written without a namespace prefix. A nested
		 * data-wp-interactive changes the default namespace for everything below it, so the wrapper keeps
		 * the figure's namespace when there is one; all of our own directives carry an explicit
		 * "holo-image-styles::" prefix and work in either case.
		 */
		$figure_ns = $p->get_attribute( 'data-wp-interactive' );
		$region_ns = is_string( $figure_ns ) && '' !== $figure_ns ? $figure_ns : self::INTERACTIVITY_NS;
		$p->set_attribute( 'data-holo-marker', '1' );
		$html = $p->get_updated_html();

		$open = strpos( $html, 'data-holo-marker' );
		if ( false === $open ) {
			return $content;
		}
		$gt = strpos( $html, '>', $open );
		if ( false === $gt ) {
			return $content;
		}
		$cap = strpos( $html, '<figcaption', $gt );
		$end = strrpos( $html, '</figure>' );
		if ( false === $end || $end < $gt ) {
			return $content;
		}
		$close = ( false !== $cap && $cap < $end ) ? $cap : $end;
		$inner = substr( $html, $gt + 1, $close - $gt - 1 );
		if ( ! str_contains( $inner, '<img' ) ) {
			return $content;
		}

		$img     = new \WP_HTML_Tag_Processor( $inner );
		$img_src = $img->next_tag( [ 'tag_name' => 'IMG' ] ) ? (string) $img->get_attribute( 'src' ) : '';

		$holo  = self::sanitize_holo( $attrs['holo'] ?? null, $family );
		$style = self::card_style( $family, $holo, $attrs, $img_src );

		$wrapper_open = sprintf(
			'<div class="holo__card" data-holo-variant="%1$s" data-holo-touch="%2$s" data-holo-glow="%8$s" data-holo-click="%9$s"%3$s%4$s style="%5$s" data-wp-interactive="%6$s" data-wp-init="%7$s::callbacks.init" data-wp-on-async--pointermove="%7$s::actions.move" data-wp-on-async--pointerleave="%7$s::actions.leave" data-wp-on-async--pointerdown="%7$s::actions.down" data-wp-on-async--click="%7$s::actions.click">',
			esc_attr( $holo['variant'] ),
			esc_attr( $holo['touch'] ),
			self::showcase_attrs( $holo['showcase'] ),
			$holo['window'] ? ' data-holo-window="1"' : '',
			esc_attr( $style ),
			esc_attr( $region_ns ),
			esc_attr( self::INTERACTIVITY_NS ),
			esc_attr( $holo['glow'] ),
			esc_attr( $holo['click'] )
		);
		$layers       = '<span class="holo__shine" aria-hidden="true"></span><span class="holo__glare" aria-hidden="true"></span>';

		$html = substr( $html, 0, $gt + 1 ) . $wrapper_open . $inner . $layers . '</div>' . substr( $html, $close );
		$html = str_replace( ' data-holo-marker="1"', '', $html );

		Plugin::instance()->enqueue_front_assets( $family );

		return $html;
	}

	/**
	 * Showcase data attributes for the wrapper ('' when off). Read by view/index.js.
	 *
	 * @param array{delay:float,duration:float,path:string,stagger:string,enter:bool}|false $sc Sanitized showcase.
	 */
	private static function showcase_attrs( $sc ): string {
		if ( false === $sc ) {
			return '';
		}
		return sprintf(
			' data-holo-showcase="1" data-holo-sc-delay="%s" data-holo-sc-duration="%s" data-holo-sc-path="%s" data-holo-sc-stagger="%s"%s',
			esc_attr( self::fmt( $sc['delay'] ) ),
			esc_attr( self::fmt( $sc['duration'] ) ),
			esc_attr( $sc['path'] ),
			esc_attr( $sc['stagger'] ),
			$sc['enter'] ? ' data-holo-enter="1"' : ''
		);
	}

	/**
	 * Whether an image URL points to a format that can have an alpha channel.
	 *
	 * @param string $url Image URL.
	 */
	public static function may_have_alpha( string $url ): bool {
		$path = (string) wp_parse_url( $url, PHP_URL_PATH );
		$ext  = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		return in_array( $ext, [ 'png', 'webp', 'gif', 'avif', 'svg' ], true );
	}

	/**
	 * Format a float for CSS without locale issues.
	 *
	 * @param float $v Value.
	 */
	private static function fmt( float $v ): string {
		return rtrim( rtrim( number_format( $v, 3, '.', '' ), '0' ), '.' );
	}
}
