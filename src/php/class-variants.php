<?php
/**
 * Variants ledger access (generated inc/variants.php).
 *
 * @package HoloImageStyles
 */

namespace HoloImageStyles;

defined( 'ABSPATH' ) || exit;

/**
 * Read-only access to the edition's ledger of families and variants.
 *
 * @phpstan-type Family array{label:string,default:string,glow:string}
 * @phpstan-type Variant array{family:string,tier:string,label:string,source:string,textures:list<string>}
 */
final class Variants {

	/**
	 * Loaded ledger.
	 *
	 * @var array{edition:string,version:string,families:array<string,Family>,variants:array<string,Variant>}|null
	 */
	private static ?array $ledger = null;

	/**
	 * Load and validate inc/variants.php once.
	 *
	 * @return array{edition:string,version:string,families:array<string,Family>,variants:array<string,Variant>}
	 */
	public static function ledger(): array {
		if ( null !== self::$ledger ) {
			return self::$ledger;
		}
		$file = dirname( HOLO_IMAGE_STYLES_FILE ) . '/inc/variants.php';
		$data = is_readable( $file ) ? include $file : null;
		if ( ! is_array( $data ) || empty( $data['families'] ) || ! is_array( $data['families'] ) || ! isset( $data['variants'] ) || ! is_array( $data['variants'] ) ) {
			// Broken install: fall back to a ledger that renders nothing (render passes content through).
			$data = [
				'edition'  => HOLO_EDITION,
				'version'  => HOLO_IMAGE_STYLES_VERSION,
				'families' => [],
				'variants' => [],
			];
		}
		// Drop variants whose family is unknown, so downstream code never has to re-check.
		foreach ( $data['variants'] as $key => $variant ) {
			if ( ! is_array( $variant ) || ! isset( $variant['family'], $data['families'][ $variant['family'] ] ) ) {
				unset( $data['variants'][ $key ] );
			}
		}
		self::$ledger = $data;
		return self::$ledger;
	}

	/**
	 * Edition this ledger was built for ('free' | 'all').
	 */
	public static function edition(): string {
		return self::ledger()['edition'];
	}

	/**
	 * All families.
	 *
	 * @return array<string,Family>
	 */
	public static function all_families(): array {
		return self::ledger()['families'];
	}

	/**
	 * All variants in this edition.
	 *
	 * @return array<string,Variant>
	 */
	public static function variants(): array {
		return self::ledger()['variants'];
	}

	/**
	 * Whether a family exists.
	 *
	 * @param string $family Family slug.
	 */
	public static function has_family( string $family ): bool {
		return isset( self::all_families()[ $family ] );
	}

	/**
	 * Whether a variant exists in this edition.
	 *
	 * @param string $variant Variant slug.
	 */
	public static function has_variant( string $variant ): bool {
		return isset( self::variants()[ $variant ] );
	}

	/**
	 * Family definition or null.
	 *
	 * @param string $family Family slug.
	 * @return Family|null
	 */
	public static function get_family( string $family ): ?array {
		return self::all_families()[ $family ] ?? null;
	}

	/**
	 * Variant definition or null.
	 *
	 * @param string $variant Variant slug.
	 * @return Variant|null
	 */
	public static function variant( string $variant ): ?array {
		return self::variants()[ $variant ] ?? null;
	}

	/**
	 * Default variant slug of a family ('' if the family is unknown).
	 *
	 * @param string $family Family slug.
	 */
	public static function default_for( string $family ): string {
		return (string) ( self::all_families()[ $family ]['default'] ?? '' );
	}

	/**
	 * Resolve a requested variant for a family, falling back to the family default
	 * when the variant is unknown, belongs to another family, or is not in this edition (SPEC §4.4).
	 *
	 * @param string $family  Family slug (must exist).
	 * @param string $variant Requested variant slug (may be '').
	 */
	public static function resolve( string $family, string $variant ): string {
		$def = self::variant( $variant );
		if ( null !== $def && $def['family'] === $family ) {
			return $variant;
		}
		return self::default_for( $family );
	}

	/**
	 * Variants belonging to one family, in ledger order (kept for the Abilities API, SPEC §10).
	 *
	 * @param string $family Family slug.
	 * @return array<string,Variant>
	 */
	public static function variants_for( string $family ): array {
		return array_filter(
			self::variants(),
			static fn( array $v ): bool => $v['family'] === $family
		);
	}
}
