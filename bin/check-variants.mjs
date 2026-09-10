#!/usr/bin/env node
/**
 * Validates src/variants.json against the rules in SPEC §2.1 and the real files:
 *  - every variant's family exists
 *  - every family default exists, belongs to that family and is tier "free"
 *  - every referenced texture exists in src/textures/
 *  - every family has src/css/families/{family}.css
 *  - every variant has exactly one `@variant` block in its family CSS, and
 *    no CSS block references a variant that is not in the ledger
 *  - CSS never hard-codes texture URLs (server injects --tex-n)
 * Exit 1 on any failure (used by CI and by build.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { SRC, loadLedger, splitFamilyCss } from './lib.mjs';

const errors = [];
const fail = ( msg ) => errors.push( msg );

const ledger = loadLedger();
const { families, variants } = ledger;

if ( ! families || ! variants ) {
	fail( 'variants.json must have "families" and "variants".' );
}

for ( const [ key, def ] of Object.entries( variants ) ) {
	if ( ! /^[a-z0-9-]+$/.test( key ) ) {
		fail( `variant key "${ key }" must match ^[a-z0-9-]+$ (it is written to data-holo-variant).` );
	}
	if ( ! families[ def.family ] ) {
		fail( `variant "${ key }": family "${ def.family }" does not exist.` );
	}
	if ( ! [ 'free', 'all' ].includes( def.tier ) ) {
		fail( `variant "${ key }": tier must be "free" or "all".` );
	}
	if ( ! def.label ) {
		fail( `variant "${ key }": label is required.` );
	}
	if ( ! Array.isArray( def.textures ) ) {
		fail( `variant "${ key }": textures must be an array.` );
	} else {
		for ( const tex of def.textures ) {
			if ( ! fs.existsSync( path.join( SRC, 'textures', tex ) ) ) {
				fail( `variant "${ key }": texture "${ tex }" is missing from src/textures/.` );
			}
		}
		if ( ! fs.existsSync( path.join( SRC, 'thumbs', `${ key }.webp` ) ) ) {
			fail( `variant "${ key }": src/thumbs/${ key }.webp is missing (run "npm run thumbs").` );
		}
		if ( def.textures.length > 3 ) {
			fail( `variant "${ key }": at most 3 textures are supported (--tex-1..3).` );
		}
	}
}

for ( const [ family, def ] of Object.entries( families ) ) {
	if ( ! /^[a-z]+$/.test( family ) ) {
		fail( `family key "${ family }" must match ^[a-z]+$ (it is used in is-style-holo-{family}).` );
	}
	const d = variants[ def.default ];
	if ( ! d ) {
		fail( `family "${ family }": default "${ def.default }" is not a variant.` );
	} else {
		if ( d.family !== family ) {
			fail( `family "${ family }": default "${ def.default }" belongs to family "${ d.family }".` );
		}
		if ( d.tier !== 'free' ) {
			fail( `family "${ family }": default "${ def.default }" must be tier "free" (fallback target for the free edition).` );
		}
	}
	if ( ! def.glow ) {
		fail( `family "${ family }": glow is required.` );
	}

	const cssFile = path.join( SRC, 'css', 'families', `${ family }.css` );
	if ( ! fs.existsSync( cssFile ) ) {
		fail( `family "${ family }": src/css/families/${ family }.css is missing.` );
		continue;
	}
	const css = fs.readFileSync( cssFile, 'utf8' );
	if ( /url\s*\(/i.test( css ) ) {
		fail( `families/${ family }.css: contains url(); textures must come from --tex-n variables set by the server.` );
	}
	let blocks;
	try {
		( { blocks } = splitFamilyCss( css, `families/${ family }.css` ) );
	} catch ( e ) {
		fail( e.message );
		continue;
	}
	for ( const name of blocks.keys() ) {
		if ( ! variants[ name ] ) {
			fail( `families/${ family }.css: @variant "${ name }" is not in the ledger.` );
		} else if ( variants[ name ].family !== family ) {
			fail( `families/${ family }.css: @variant "${ name }" belongs to family "${ variants[ name ].family }".` );
		}
	}
	for ( const [ name, v ] of Object.entries( variants ) ) {
		if ( v.family === family && ! blocks.has( name ) ) {
			fail( `families/${ family }.css: no @variant block for "${ name }".` );
		}
	}
}

if ( errors.length ) {
	console.error( `check-variants: ${ errors.length } problem(s)` );
	for ( const e of errors ) {
		console.error( '  - ' + e );
	}
	process.exit( 1 );
}
console.log(
	`check-variants: OK (${ Object.keys( families ).length } families, ${ Object.keys( variants ).length } variants)`
);
