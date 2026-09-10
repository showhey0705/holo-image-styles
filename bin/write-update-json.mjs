#!/usr/bin/env node
/**
 * node bin/write-update-json.mjs 1.2.0  → dist/update.json (SPEC §8 / §14.5)
 * The package URL is the unauthenticated update endpoint on pro.jadeclinic.jp, not a signed URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, UPDATE_HOST } from './lib.mjs';

const version = process.argv[ 2 ];
if ( ! /^\d+\.\d+\.\d+$/.test( version || '' ) ) {
	console.error( 'Usage: node bin/write-update-json.mjs <x.y.z>' );
	process.exit( 2 );
}
const json = {
	id: 'holo-image-styles-all/holo-image-styles-all.php',
	version,
	url: `https://${ UPDATE_HOST }/holo-image-styles/changelog/`,
	package: `https://${ UPDATE_HOST }/wp-json/jadepro/v1/download/holo-image-styles-all`,
	requires: '6.7',
	requires_php: '8.1',
	tested: '7.1',
};
fs.mkdirSync( path.join( ROOT, 'dist' ), { recursive: true } );
fs.writeFileSync( path.join( ROOT, 'dist', 'update.json' ), JSON.stringify( json, null, 2 ) + '\n' );
console.log( 'dist/update.json written for', version );
