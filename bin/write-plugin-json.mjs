#!/usr/bin/env node
/**
 * node bin/write-plugin-json.mjs 1.2.0  → dist/plugin.json (SPEC §8 / §14.5)
 *
 * Uploaded by release.yml to member-downloads/holo-image-styles-all/plugin.json (same shape as
 * BCP Builder's plugin.json). The Edge Function `holo-update` serves it to the plugin's update check;
 * `package` is the unauthenticated `holo-download` function, which redirects to a short-lived signed
 * URL at download time (so nothing here expires).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DOWNLOAD_URI, PRODUCT_URL } from './lib.mjs';

const version = process.argv[ 2 ];
if ( ! /^\d+\.\d+\.\d+$/.test( version || '' ) ) {
	console.error( 'Usage: node bin/write-plugin-json.mjs <x.y.z>' );
	process.exit( 2 );
}
const zip = path.join( ROOT, 'dist', 'holo-image-styles-all.zip' );
const json = {
	id: 'holo-image-styles-all/holo-image-styles-all.php',
	slug: 'holo-image-styles-all',
	name: 'Holo Image Styles (All Effects)',
	version,
	url: PRODUCT_URL + 'changelog/',
	package: DOWNLOAD_URI,
	requires: '6.7',
	requires_php: '8.1',
	tested: '7.1',
	size: fs.existsSync( zip ) ? fs.statSync( zip ).size : 0,
	last_updated: new Date().toISOString().slice( 0, 19 ).replace( 'T', ' ' ),
};
fs.mkdirSync( path.join( ROOT, 'dist' ), { recursive: true } );
fs.writeFileSync( path.join( ROOT, 'dist', 'plugin.json' ), JSON.stringify( json, null, 2 ) + '\n' );
console.log( 'dist/plugin.json written for', version );
