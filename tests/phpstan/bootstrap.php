<?php
/**
 * Constants defined by the generated main plugin file (see src/plugin.php.tpl).
 */
define( 'HOLO_EDITION', (string) ( getenv( 'HOLO_EDITION' ) ?: 'all' ) ); // non-literal on purpose: both editions are valid.
define( 'HOLO_IMAGE_STYLES_VERSION', '0.0.0' );
define( 'HOLO_IMAGE_STYLES_FILE', __DIR__ . '/../../dist/holo-image-styles-all/holo-image-styles-all.php' );
define( 'HOLO_IMAGE_STYLES_BOOTED', 'all' );
define( 'HOUR_IN_SECONDS', 3600 );
define( 'DAY_IN_SECONDS', 86400 );
define( 'WP_PLUGIN_DIR', '/tmp/plugins' );
define( 'ABSPATH', __DIR__ . '/../../wordpress/' ); // point at a WordPress checkout (CI downloads core here) so require_once paths resolve.
