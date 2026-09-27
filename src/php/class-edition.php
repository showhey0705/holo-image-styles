<?php
/**
 * Edition handling: free → All Effects migration notice, "delete free" button, All Effects updates (SPEC §7, §8).
 *
 * @package HoloImageStyles
 */

namespace HoloImageStyles;

defined( 'ABSPATH' ) || exit;

/**
 * Everything that differs between the two editions at runtime lives here.
 */
final class Edition {

	public const FREE_BASENAME  = 'holo-image-styles/holo-image-styles.php';
	public const TRANSIENT      = 'holo_offer_delete_free';
	public const UPDATE_CACHE   = 'holo_image_styles_update';
	public const ACTION_DELETE  = 'holo_delete_free';
	public const ACTION_DISMISS = 'holo_dismiss_delete_free';

	/**
	 * Hook up.
	 */
	public function register(): void {
		if ( 'all' !== HOLO_EDITION ) {
			return;
		}
		add_action( 'admin_notices', [ $this, 'notice' ] );
		add_action( 'network_admin_notices', [ $this, 'notice' ] );
		add_action( 'admin_post_' . self::ACTION_DELETE, [ $this, 'handle_delete' ] );
		add_action( 'admin_post_' . self::ACTION_DISMISS, [ $this, 'handle_dismiss' ] );

		$host = self::update_host();
		if ( '' !== $host ) {
			add_filter( 'update_plugins_' . $host, [ $this, 'check_update' ], 10, 3 );
			add_filter( 'plugins_api', [ $this, 'plugin_info' ], 10, 3 );
			// Keep the 12h cache from hiding a fresh release: drop it on Dashboard → Updates → "Check again",
			// whenever WordPress drops its own update data (activate / delete), and after an update ran.
			add_action( 'upgrader_process_complete', [ $this, 'flush' ], 10, 0 );
			add_action( 'delete_site_transient_update_plugins', [ $this, 'flush' ], 10, 0 );
			add_action( 'load-update-core.php', [ $this, 'flush_on_force_check' ], 10, 0 );
			// "Check for updates" link in the plugin row (same as the PUC-based plugins).
			add_filter( 'plugin_row_meta', [ $this, 'row_meta' ], 10, 2 );
			add_action( 'admin_post_holo_check_update', [ $this, 'handle_check' ] );
			add_action( 'admin_notices', [ $this, 'check_notice' ] );
		}
	}

	/**
	 * Host part of the Update URI header ('' when not set, e.g. in a dev checkout).
	 */
	public static function update_host(): string {
		if ( ! function_exists( 'get_file_data' ) ) {
			return '';
		}
		$data = get_file_data( HOLO_IMAGE_STYLES_FILE, [ 'UpdateURI' => 'Update URI' ] );
		$uri  = $data['UpdateURI'] ?? '';
		if ( '' === $uri ) {
			return '';
		}
		$host = wp_parse_url( $uri, PHP_URL_HOST );
		return is_string( $host ) ? $host : '';
	}

	/**
	 * Whether the free edition's files are still on disk.
	 */
	private static function free_installed(): bool {
		return file_exists( WP_PLUGIN_DIR . '/' . self::FREE_BASENAME );
	}

	/**
	 * Admin notice offering to delete the (now deactivated) free edition (SPEC §7.3).
	 */
	public function notice(): void {
		if ( ! get_site_transient( self::TRANSIENT ) || ! self::free_installed() || ! current_user_can( 'delete_plugins' ) ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $screen && ! in_array( $screen->base, [ 'plugins', 'plugins-network', 'dashboard', 'dashboard-network' ], true ) ) {
			return;
		}
		$error = get_site_transient( self::TRANSIENT . '_error' );
		if ( is_string( $error ) && '' !== $error ) {
			delete_site_transient( self::TRANSIENT . '_error' );
		}

		require_once ABSPATH . 'wp-admin/includes/file.php';
		$direct = 'direct' === get_filesystem_method();
		?>
		<div class="notice notice-info">
			<p>
				<strong><?php esc_html_e( 'Holo Image Styles (All Effects) is active.', 'holo-image-styles' ); ?></strong>
				<?php esc_html_e( 'The free edition has been deactivated; the All Effects edition includes everything it had.', 'holo-image-styles' ); ?>
			</p>
			<?php if ( is_string( $error ) && '' !== $error ) : ?>
				<p class="error-message"><?php echo esc_html( $error ); ?></p>
			<?php endif; ?>
			<?php if ( $direct ) : ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline-block;margin-right:1em">
					<?php wp_nonce_field( self::ACTION_DELETE ); ?>
					<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_DELETE ); ?>">
					<button type="submit" class="button button-primary"><?php esc_html_e( 'Delete the free edition', 'holo-image-styles' ); ?></button>
				</form>
			<?php else : ?>
				<p><?php esc_html_e( 'Please delete "Holo Image Styles" (free edition) from the Plugins list.', 'holo-image-styles' ); ?></p>
			<?php endif; ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline-block">
				<?php wp_nonce_field( self::ACTION_DISMISS ); ?>
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_DISMISS ); ?>">
				<button type="submit" class="button-link"><?php esc_html_e( 'Not now', 'holo-image-styles' ); ?></button>
			</form>
		</div>
		<?php
	}

	/**
	 * admin-post handler: deactivate (if still active) and delete the free edition.
	 */
	public function handle_delete(): void {
		check_admin_referer( self::ACTION_DELETE );
		if ( ! current_user_can( 'delete_plugins' ) ) {
			wp_die( esc_html__( 'You are not allowed to delete plugins.', 'holo-image-styles' ) );
		}
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';

		if ( self::free_installed() ) {
			if ( is_plugin_active_for_network( self::FREE_BASENAME ) ) {
				deactivate_plugins( self::FREE_BASENAME, true, true );
			} elseif ( is_plugin_active( self::FREE_BASENAME ) ) {
				deactivate_plugins( self::FREE_BASENAME, true, false );
			}
			$result = delete_plugins( [ self::FREE_BASENAME ] );
			if ( is_wp_error( $result ) ) {
				set_site_transient( self::TRANSIENT . '_error', $result->get_error_message(), HOUR_IN_SECONDS );
				$this->back();
			}
		}
		delete_site_transient( self::TRANSIENT );
		$this->back();
	}

	/**
	 * admin-post handler: dismiss the notice.
	 */
	public function handle_dismiss(): void {
		check_admin_referer( self::ACTION_DISMISS );
		if ( ! current_user_can( 'delete_plugins' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'holo-image-styles' ) );
		}
		delete_site_transient( self::TRANSIENT );
		$this->back();
	}

	/**
	 * Redirect back to where the form was submitted from.
	 */
	private function back(): never {
		$referer = wp_get_referer();
		wp_safe_redirect( $referer ? $referer : admin_url( 'plugins.php' ) );
		exit;
	}

	/**
	 * Drop the cached update metadata.
	 */
	public function flush(): void {
		delete_site_transient( self::UPDATE_CACHE );
	}

	/**
	 * Dashboard → Updates → "Check again" (force-check=1) also drops our cache.
	 */
	public function flush_on_force_check(): void {
		if ( ! empty( $_GET['force-check'] ) && current_user_can( 'update_plugins' ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$this->flush();
		}
	}

	/**
	 * "Check for updates" link next to "View details".
	 *
	 * @param array<int,string> $links Row meta links.
	 * @param string            $file  Plugin basename.
	 * @return array<int,string>
	 */
	public function row_meta( $links, $file ) {
		if ( plugin_basename( HOLO_IMAGE_STYLES_FILE ) !== $file || ! current_user_can( 'update_plugins' ) ) {
			return $links;
		}
		$url     = wp_nonce_url( admin_url( 'admin-post.php?action=holo_check_update' ), 'holo_check_update' );
		$links[] = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Check for updates', 'holo-image-styles' ) . '</a>';
		return $links;
	}

	/**
	 * Refetch now (our cache + WordPress' update data), then back to Plugins with the result.
	 */
	public function handle_check(): void {
		if ( ! current_user_can( 'update_plugins' ) ) {
			wp_die( esc_html__( 'You are not allowed to update plugins.', 'holo-image-styles' ), 403 );
		}
		check_admin_referer( 'holo_check_update' );
		$this->flush();
		delete_site_transient( 'update_plugins' );
		if ( ! function_exists( 'wp_update_plugins' ) ) {
			require_once ABSPATH . 'wp-includes/update.php';
		}
		wp_update_plugins();
		$json  = $this->fetch_update_json();
		$state = 'error';
		if ( false !== $json ) {
			$state = version_compare( (string) $json['version'], HOLO_IMAGE_STYLES_VERSION, '>' ) ? 'available' : 'latest';
		}
		wp_safe_redirect( add_query_arg( 'holo_update_check', $state, self_admin_url( 'plugins.php' ) ) );
		exit;
	}

	/**
	 * Result of "Check for updates", above the plugin list.
	 */
	public function check_notice(): void {
		$state = isset( $_GET['holo_update_check'] ) ? sanitize_key( wp_unslash( $_GET['holo_update_check'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( '' === $state || ! current_user_can( 'update_plugins' ) ) {
			return;
		}
		if ( 'available' === $state ) {
			$json = $this->fetch_update_json();
			/* translators: 1: plugin name, 2: new version */
			$msg  = sprintf( __( '%1$s %2$s is available. Use "Update now" in the list to install it.', 'holo-image-styles' ), 'Holo Image Styles', is_array( $json ) ? (string) $json['version'] : '' );
			$type = 'warning';
		} elseif ( 'latest' === $state ) {
			/* translators: 1: plugin name, 2: installed version */
			$msg  = sprintf( __( '%1$s is up to date (%2$s).', 'holo-image-styles' ), 'Holo Image Styles', HOLO_IMAGE_STYLES_VERSION );
			$type = 'success';
		} else {
			/* translators: %s: plugin name */
			$msg  = sprintf( __( 'Could not fetch update information for %s. Please try again later.', 'holo-image-styles' ), 'Holo Image Styles' );
			$type = 'error';
		}
		printf( '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>', esc_attr( $type ), esc_html( $msg ) );
	}

	/**
	 * Fetch update.json (cached 12h; false on any failure = no update; SPEC §8).
	 *
	 * @return array<string,mixed>|false
	 */
	private function fetch_update_json() {
		$cached = get_site_transient( self::UPDATE_CACHE );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		if ( 'none' === $cached ) {
			return false;
		}
		$data = get_file_data( HOLO_IMAGE_STYLES_FILE, [ 'UpdateURI' => 'Update URI' ] );
		$uri  = $data['UpdateURI'] ?? '';
		if ( '' === $uri ) {
			return false;
		}
		$response = wp_remote_get( $uri, [ 'timeout' => 8 ] );
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			set_site_transient( self::UPDATE_CACHE, 'none', HOUR_IN_SECONDS );
			return false;
		}
		$json = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $json ) || empty( $json['version'] ) || empty( $json['package'] ) ) {
			set_site_transient( self::UPDATE_CACHE, 'none', HOUR_IN_SECONDS );
			return false;
		}
		set_site_transient( self::UPDATE_CACHE, $json, 12 * HOUR_IN_SECONDS );
		return $json;
	}

	/**
	 * update_plugins_{host} filter.
	 *
	 * @param array<string,mixed>|false $update      Existing update data.
	 * @param array<string,mixed>       $plugin_data Plugin headers.
	 * @param string                    $plugin_file Plugin basename.
	 * @return array<string,mixed>|false
	 */
	public function check_update( $update, array $plugin_data, string $plugin_file ) {
		if ( plugin_basename( HOLO_IMAGE_STYLES_FILE ) !== $plugin_file ) {
			return $update;
		}
		$json = $this->fetch_update_json();
		if ( false === $json ) {
			return false;
		}
		if ( ! version_compare( (string) $json['version'], HOLO_IMAGE_STYLES_VERSION, '>' ) ) {
			return false;
		}
		return [
			'id'           => $json['id'] ?? $plugin_file,
			'slug'         => 'holo-image-styles-all',
			'plugin'       => $plugin_file,
			'version'      => (string) $json['version'],
			'url'          => (string) ( $json['url'] ?? '' ),
			'package'      => (string) $json['package'],
			'requires'     => (string) ( $json['requires'] ?? '6.7' ),
			'requires_php' => (string) ( $json['requires_php'] ?? '8.1' ),
			'tested'       => (string) ( $json['tested'] ?? '' ),
			'icons'        => [],
			'banners'      => [],
		];
	}

	/**
	 * Minimal "View details" support (SPEC §8, optional).
	 *
	 * @param false|object|array<string,mixed> $result Result.
	 * @param string                           $action Action.
	 * @param object                           $args   Args.
	 * @return false|object|array<string,mixed>
	 */
	public function plugin_info( $result, string $action, object $args ) {
		if ( 'plugin_information' !== $action || ! isset( $args->slug ) || 'holo-image-styles-all' !== $args->slug ) {
			return $result;
		}
		$json = $this->fetch_update_json();
		if ( false === $json ) {
			return $result;
		}
		return (object) [
			'name'          => 'Holo Image Styles (All Effects)',
			'slug'          => 'holo-image-styles-all',
			'version'       => (string) $json['version'],
			'author'        => 'Shohei',
			'homepage'      => (string) ( $json['url'] ?? '' ),
			'requires'      => (string) ( $json['requires'] ?? '6.7' ),
			'requires_php'  => (string) ( $json['requires_php'] ?? '8.1' ),
			'tested'        => (string) ( $json['tested'] ?? '' ),
			'download_link' => (string) $json['package'],
			'sections'      => [
				'description' => esc_html__( 'All 23 holographic effects for the Image block.', 'holo-image-styles' ),
				'changelog'   => sprintf(
					'<a href="%s">%s</a>',
					esc_url( (string) ( $json['url'] ?? '' ) ),
					esc_html__( 'View the changelog', 'holo-image-styles' )
				),
			],
		];
	}
}
