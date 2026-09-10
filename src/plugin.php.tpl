<?php
/**
 * Plugin Name:       {{NAME}}
 * Plugin URI:        https://github.com/showhey0705/holo-image-styles
 * Description:       Holographic card effects for the Image block. Inspired by pokemon-cards-css by Simon Goellner (GPL-3.0).
 * Version:           {{VERSION}}
 * Requires at least: 6.7
 * Requires PHP:      8.1
 * Author:            Shohei
 * Author URI:        https://photoshopvip.net/
 * License:           GPL-3.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-3.0.html
 * Text Domain:       holo-image-styles
 * Domain Path:       /languages
{{UPDATE_URI}}
 *
 * This file is generated from src/plugin.php.tpl by bin/build.mjs.
 * It intentionally defines no functions: both editions may be loaded at once
 * and only the first one to boot wins (see the plugins_loaded guard below).
 */

defined( 'ABSPATH' ) || exit;

define( 'HOLO_IMAGE_STYLES_EDITION_{{EDITION_UPPER}}', true );

add_action(
	'plugins_loaded',
	static function () {
		if ( defined( 'HOLO_IMAGE_STYLES_BOOTED' ) ) {
			return; // The edition that booted first wins.
		}
		define( 'HOLO_IMAGE_STYLES_BOOTED', '{{EDITION}}' );
		define( 'HOLO_EDITION', '{{EDITION}}' );
		define( 'HOLO_IMAGE_STYLES_VERSION', '{{VERSION}}' );
		define( 'HOLO_IMAGE_STYLES_FILE', __FILE__ );
		require __DIR__ . '/inc/class-plugin.php';
		\HoloImageStyles\Plugin::instance();
	},
	{{PRIORITY}}
);

register_activation_hook(
	__FILE__,
	static function () {
		// CSS handles carry the edition in their version, but page caches may not. Flush once.
		wp_cache_flush();
	}
);
{{ACTIVATION}}
