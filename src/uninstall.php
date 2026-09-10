<?php
/**
 * Uninstall (free edition only; SPEC §7.4).
 * The All Effects edition ships no uninstall.php so a site can move back to the free edition
 * without losing settings.
 *
 * @package HoloImageStyles
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'holo_image_styles' );
delete_site_option( 'holo_image_styles' );
delete_site_transient( 'holo_offer_delete_free' );
delete_site_transient( 'holo_offer_delete_free_error' );
delete_site_transient( 'holo_image_styles_update' );
