<?php
/**
 * Editor integration: block attribute, editor script, editor preview CSS (SPEC §6).
 *
 * @package HoloImageStyles
 */

namespace HoloImageStyles;

defined( 'ABSPATH' ) || exit;

/**
 * Registers the `holo` attribute on core/image and ships the editor assets.
 */
final class Editor {

	/**
	 * Hook up.
	 */
	public function register(): void {
		add_filter( 'register_block_type_args', [ $this, 'add_attribute' ], 10, 2 );
		add_action( 'enqueue_block_editor_assets', [ $this, 'enqueue_editor_script' ] );
		add_action( 'enqueue_block_assets', [ $this, 'enqueue_editor_styles' ] );
	}

	/**
	 * Server-side twin of the JS attribute (so REST rendering sees `$block['attrs']['holo']`).
	 *
	 * @param array<string,mixed> $args Block type args.
	 * @param string              $name Block name.
	 * @return array<string,mixed>
	 */
	public function add_attribute( array $args, string $name ): array {
		if ( 'core/image' !== $name ) {
			return $args;
		}
		if ( ! isset( $args['attributes'] ) || ! is_array( $args['attributes'] ) ) {
			$args['attributes'] = [];
		}
		$args['attributes']['holo'] = [
			'type'    => 'object',
			'default' => Render::DEFAULTS,
		];
		return $args;
	}

	/**
	 * Data handed to the editor script.
	 *
	 * @return array<string,mixed>
	 */
	public static function editor_data(): array {
		$variants = [];
		foreach ( Variants::variants() as $key => $v ) {
			$variants[ $key ] = [
				'family' => $v['family'],
				'tier'   => $v['tier'],
				'label'  => $v['label'],
			];
		}
		return [
			'edition'   => Variants::edition(),
			'version'   => HOLO_IMAGE_STYLES_VERSION,
			'families'  => Variants::all_families(),
			'variants'  => $variants,
			'defaults'  => Render::DEFAULTS,
			'upsellUrl' => 'free' === Variants::edition() ? 'https://pro.jadeclinic.jp/holo-image-styles/' : '',
		];
	}

	/**
	 * Editor script (block filters + inspector panel).
	 */
	public function enqueue_editor_script(): void {
		$asset_file = Plugin::dir( 'build/editor.asset.php' );
		if ( ! is_readable( $asset_file ) ) {
			return;
		}
		$asset = include $asset_file;
		wp_enqueue_script(
			'holo-image-styles-editor',
			Plugin::url( 'build/editor.js' ),
			$asset['dependencies'] ?? [],
			Plugin::asset_version(),
			true
		);
		wp_set_script_translations( 'holo-image-styles-editor', 'holo-image-styles', Plugin::dir( 'languages' ) );
		wp_add_inline_script(
			'holo-image-styles-editor',
			'window.holoImageStyles = ' . wp_json_encode( self::editor_data() ) . ';',
			'before'
		);
	}

	/**
	 * base.css + editor.css inside the editor iframe (enqueue_block_assets runs in the iframe; SPEC §6.3).
	 * On the front end this hook also fires, but there the family CSS is loaded by core via style_handle.
	 */
	public function enqueue_editor_styles(): void {
		if ( ! is_admin() ) {
			return;
		}
		wp_enqueue_style( 'holo-image-styles-editor' );
	}
}
