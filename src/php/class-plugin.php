<?php
/**
 * Plugin bootstrap: block styles, assets, sub-components.
 *
 * @package HoloImageStyles
 */

namespace HoloImageStyles;

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/class-variants.php';
require_once __DIR__ . '/class-render.php';
require_once __DIR__ . '/class-editor.php';
require_once __DIR__ . '/class-edition.php';

/**
 * Singleton entry point (created from the main plugin file on plugins_loaded).
 */
final class Plugin {

	/**
	 * Instance.
	 *
	 * @var Plugin|null
	 */
	private static ?Plugin $instance = null;

	/**
	 * Families whose CSS has been requested during this request.
	 *
	 * @var array<string,bool>
	 */
	private array $enqueued = [];

	/**
	 * Get / create the instance.
	 */
	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
			self::$instance->boot();
		}
		return self::$instance;
	}

	/**
	 * Plugin directory URL with trailing slash.
	 */
	public static function url( string $path = '' ): string {
		return plugins_url( $path, HOLO_IMAGE_STYLES_FILE );
	}

	/**
	 * Plugin directory path with trailing slash.
	 */
	public static function dir( string $path = '' ): string {
		return plugin_dir_path( HOLO_IMAGE_STYLES_FILE ) . $path;
	}

	/**
	 * Cache-busting version that includes the edition (SPEC §4.5, error #11).
	 */
	public static function asset_version(): string {
		return HOLO_IMAGE_STYLES_VERSION . '-' . HOLO_EDITION;
	}

	/**
	 * Wire everything up.
	 */
	private function boot(): void {
		add_action( 'init', [ $this, 'load_textdomain' ], 5 );
		add_action( 'init', [ $this, 'register_assets_and_styles' ] );
		( new Render() )->register();
		( new Editor() )->register();
		( new Edition() )->register();
	}

	/**
	 * Translations. wp.org language packs take precedence for the free edition.
	 */
	public function load_textdomain(): void {
		load_plugin_textdomain( 'holo-image-styles', false, dirname( plugin_basename( HOLO_IMAGE_STYLES_FILE ) ) . '/languages' );
	}

	/**
	 * Register CSS handles, the view script module and one block style per family.
	 */
	public function register_assets_and_styles(): void {
		$ver = self::asset_version();

		wp_register_style( 'holo-image-styles-base', self::url( 'css/base.css' ), [], $ver );
		wp_register_style( 'holo-image-styles-editor', self::url( 'css/editor.css' ), [ 'holo-image-styles-base' ], $ver );

		foreach ( Variants::all_families() as $family => $def ) {
			$handle = 'holo-image-styles-' . $family;
			wp_register_style( $handle, self::url( 'css/families/' . $family . '.css' ), [ 'holo-image-styles-base' ], $ver );
			register_block_style(
				'core/image',
				[
					'name'         => 'holo-' . $family,
					'label'        => $def['label'],
					'style_handle' => $handle,
				]
			);
		}

		$asset = self::dir( 'build/view.asset.php' );
		$meta  = is_readable( $asset ) ? include $asset : [];
		if ( function_exists( 'wp_register_script_module' ) ) {
			wp_register_script_module(
				'holo-image-styles-view',
				self::url( 'build/view.js' ),
				$meta['dependencies'] ?? [ '@wordpress/interactivity' ],
				$ver
			);
		}
	}

	/**
	 * Called by Render when a holo image is actually rendered.
	 * Core already enqueues the family style via `style_handle`; this makes sure the
	 * base CSS and the view module go out even when block styles are loaded in one bundle.
	 *
	 * @param string $family Family slug.
	 */
	public function enqueue_front_assets( string $family ): void {
		if ( isset( $this->enqueued[ $family ] ) ) {
			return;
		}
		$this->enqueued[ $family ] = true;
		wp_enqueue_style( 'holo-image-styles-' . $family );
		if ( function_exists( 'wp_enqueue_script_module' ) ) {
			wp_enqueue_script_module( 'holo-image-styles-view' );
		}
	}
}
