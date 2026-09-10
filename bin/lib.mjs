/**
 * Shared helpers for bin/*.mjs (ledger loading, CSS block extraction, minify).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
export const SRC = path.join( ROOT, 'src' );

export const EDITIONS = {
	free: {
		slug: 'holo-image-styles',
		name: 'Holo Image Styles',
		priority: 10,
		tiers: [ 'free' ],
	},
	all: {
		slug: 'holo-image-styles-all',
		name: 'Holo Image Styles (All Effects)',
		priority: 5,
		tiers: [ 'free', 'all' ],
	},
};

/**
 * Supabase project host of JADE Pro (§8 / §14). The All Effects edition's `Update URI` points at the
 * Edge Function `holo-update` there; `holo-download` hands out the signed zip URL (same project as
 * BCP Builder's `builder-update` / `download-url`).
 */
export const UPDATE_HOST = process.env.HOLO_UPDATE_HOST || 'jhbzbqsondftxlcsevpn.supabase.co';
export const UPDATE_URI = `https://${ UPDATE_HOST }/functions/v1/holo-update`;
export const DOWNLOAD_URI = `https://${ UPDATE_HOST }/functions/v1/holo-download`;
/** Public product page (changelog, "View details" link). */
export const PRODUCT_URL = 'https://pro.jadeclinic.jp/holo-image-styles/';

export function loadLedger() {
	const raw = fs.readFileSync( path.join( SRC, 'variants.json' ), 'utf8' );
	return JSON.parse( raw );
}

export function readPackageVersion() {
	return JSON.parse( fs.readFileSync( path.join( ROOT, 'package.json' ), 'utf8' ) ).version;
}

/** Filter the ledger to the variants included in an edition. Families are always kept. */
export function filterLedger( ledger, tiers ) {
	const variants = {};
	for ( const [ key, def ] of Object.entries( ledger.variants ) ) {
		if ( tiers.includes( def.tier ) ) {
			variants[ key ] = def;
		}
	}
	return { families: ledger.families, variants };
}

/**
 * Split a family CSS file into { head, blocks: Map<variant, css> }.
 * Blocks are delimited by `/* @variant name *\/` … `/* @end *\/`.
 * Anything outside the markers is "head" (family-level rules) and is always kept.
 */
export function splitFamilyCss( css, file = 'css' ) {
	const blocks = new Map();
	let head = '';
	let cursor = 0;
	const re = /\/\*\s*@variant\s+([a-z0-9-]+)\s*\*\//g;
	let m;
	while ( ( m = re.exec( css ) ) ) {
		head += css.slice( cursor, m.index );
		const endIdx = css.indexOf( '/* @end */', m.index );
		if ( endIdx === -1 ) {
			throw new Error( `${ file }: "@variant ${ m[ 1 ] }" has no matching "/* @end */"` );
		}
		const body = css.slice( m.index + m[ 0 ].length, endIdx );
		if ( body.includes( '@variant' ) ) {
			throw new Error( `${ file }: nested @variant inside "${ m[ 1 ] }"` );
		}
		if ( blocks.has( m[ 1 ] ) ) {
			throw new Error( `${ file }: duplicate @variant "${ m[ 1 ] }"` );
		}
		blocks.set( m[ 1 ], body );
		cursor = endIdx + '/* @end */'.length;
		re.lastIndex = cursor;
	}
	head += css.slice( cursor );
	return { head, blocks };
}

/**
 * Conservative CSS minifier: strips comments and collapses whitespace but never
 * touches spacing inside calc() operators (it only removes spaces around { } ; : ,).
 */
export function minifyCss( css ) {
	let out = css.replace( /\/\*[\s\S]*?\*\//g, '' );
	out = out.replace( /\s+/g, ' ' );
	out = out.replace( /\s*([{};,>])\s*/g, '$1' );
	out = out.replace( /([a-zA-Z-])\s*:\s+/g, '$1:' );
	out = out.replace( /;}/g, '}' );
	return out.trim();
}

export function ensureDir( dir ) {
	fs.mkdirSync( dir, { recursive: true } );
}

export function rmrf( dir ) {
	fs.rmSync( dir, { recursive: true, force: true } );
}

export function copyDir( from, to ) {
	if ( ! fs.existsSync( from ) ) {
		return;
	}
	ensureDir( to );
	for ( const entry of fs.readdirSync( from, { withFileTypes: true } ) ) {
		const s = path.join( from, entry.name );
		const d = path.join( to, entry.name );
		if ( entry.isDirectory() ) {
			copyDir( s, d );
		} else {
			fs.copyFileSync( s, d );
		}
	}
}

/** Serialize a JSON-ish value as a PHP array literal (short syntax). */
export function toPhp( value, indent = 0 ) {
	const pad = '\t'.repeat( indent );
	const inner = '\t'.repeat( indent + 1 );
	if ( Array.isArray( value ) ) {
		if ( ! value.length ) {
			return '[]';
		}
		return '[\n' + value.map( ( v ) => `${ inner }${ toPhp( v, indent + 1 ) },` ).join( '\n' ) + `\n${ pad }]`;
	}
	if ( value && typeof value === 'object' ) {
		const keys = Object.keys( value );
		if ( ! keys.length ) {
			return '[]';
		}
		return (
			'[\n' +
			keys.map( ( k ) => `${ inner }${ phpString( k ) } => ${ toPhp( value[ k ], indent + 1 ) },` ).join( '\n' ) +
			`\n${ pad }]`
		);
	}
	if ( typeof value === 'string' ) {
		return phpString( value );
	}
	if ( typeof value === 'boolean' ) {
		return value ? 'true' : 'false';
	}
	if ( value === null || value === undefined ) {
		return 'null';
	}
	return String( value );
}

function phpString( s ) {
	return "'" + String( s ).replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" ) + "'";
}
