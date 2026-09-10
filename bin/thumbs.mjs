#!/usr/bin/env node
/**
 * node bin/thumbs.mjs
 *
 * Renders one static thumbnail per variant (src/thumbs/{variant}.webp, 160×224 @1.5x) from the real
 * front-end CSS: base.css + families/*.css + the .holo__card DOM with the pointer variables fixed at a
 * flattering position. No WordPress needed — a self-contained HTML page is screenshotted with Playwright.
 * The sample image is a generated abstract gradient (no third-party artwork).
 *
 * Thumbnails are committed to the repo and copied into dist/{slug}/thumbs/ by build.mjs (whitelist by tier).
 * Set CHROMIUM_PATH when Playwright's own browser is not installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { SRC, loadLedger } from './lib.mjs';

const OUT = path.join( SRC, 'thumbs' );
const W = 160;
const H = 224;
const SCALE = 1.5;

fs.mkdirSync( OUT, { recursive: true } );
const ledger = loadLedger();

const sample = `data:image/svg+xml;utf8,${ encodeURIComponent( `
<svg xmlns="http://www.w3.org/2000/svg" width="${ W * SCALE }" height="${ H * SCALE }" viewBox="0 0 160 224">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b2a49"/><stop offset="0.55" stop-color="#4a3f8f"/><stop offset="1" stop-color="#7a3b8f"/>
    </linearGradient>
    <radialGradient id="r1" cx="0.3" cy="0.3" r="0.4"><stop offset="0" stop-color="#ff9a8b" stop-opacity="0.9"/><stop offset="1" stop-color="#ff9a8b" stop-opacity="0"/></radialGradient>
    <radialGradient id="r2" cx="0.75" cy="0.65" r="0.45"><stop offset="0" stop-color="#5ec8ff" stop-opacity="0.8"/><stop offset="1" stop-color="#5ec8ff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="160" height="224" fill="url(#g)"/>
  <rect width="160" height="224" fill="url(#r1)"/>
  <rect width="160" height="224" fill="url(#r2)"/>
  <circle cx="80" cy="112" r="14" fill="#f5d67a"/>
  <g stroke="#f5d67a" stroke-width="1.2" fill="none">
    <circle cx="80" cy="112" r="34"/>
    <path d="M80 60v104M32 112h96M46 78l68 68M114 78l-68 68"/>
  </g>
</svg>` ) }`;

const cssFiles = [
	path.join( SRC, 'css', 'base.css' ),
	...Object.keys( ledger.families ).map( ( f ) => path.join( SRC, 'css', 'families', `${ f }.css` ) ),
];
const css = cssFiles.map( ( f ) => fs.readFileSync( f, 'utf8' ) ).join( '\n' );

// Pointer position used for every thumbnail (matches the reduced-motion / editor fixed sheen, a bit lower).
const POINTER = {
	'--pointer-x': '32%',
	'--pointer-y': '22%',
	'--background-x': '45%',
	'--background-y': '40%',
	'--pointer-from-center': '0.6',
	'--pointer-from-top': '0.22',
	'--pointer-from-left': '0.32',
	'--card-opacity': '1',
	'--rotate-x': '0deg',
	'--rotate-y': '0deg',
};

const cards = Object.entries( ledger.variants )
	.map( ( [ key, v ] ) => {
		const vars = { ...POINTER, '--holo-glow': ledger.families[ v.family ].glow };
		v.textures.forEach( ( t, i ) => {
			vars[ `--tex-${ i + 1 }` ] = `url(../textures/${ t })`;
		} );
		if ( v.family === 'cosmos' ) {
			vars[ '--cosmosbg' ] = '120px 300px';
		}
		const style = Object.entries( vars ).map( ( [ k, val ] ) => `${ k }:${ val }` ).join( ';' );
		return `<figure class="wp-block-image is-style-holo-${ v.family }" id="v-${ key }">
  <div class="holo__card is-holo-armed" data-holo-variant="${ key }" style="${ style }">
    <img src="${ sample }" width="${ W }" height="${ H }" alt="">
    <span class="holo__shine"></span><span class="holo__glare"></span>
  </div>
</figure>`;
	} )
	.join( '\n' );

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${ css }
body{margin:0;background:#fff;display:flex;flex-wrap:wrap;gap:12px;padding:12px}
figure{margin:0}
.holo__card{transition:none !important}
</style></head><body>${ cards }</body></html>`;

const tmp = path.join( SRC, 'css', '.thumbs-tmp.html' ); // next to css/ so ../textures resolves
fs.writeFileSync( tmp, html );

const browser = await chromium.launch(
	process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage( { viewport: { width: 1200, height: 900 }, deviceScaleFactor: SCALE } );
await page.goto( 'file://' + tmp, { waitUntil: 'networkidle' } );
await page.waitForTimeout( 300 );
try {
	execFileSync( 'convert', [ '-version' ], { stdio: 'ignore' } );
} catch {
	console.error( 'thumbs: ImageMagick (convert) is required to write WebP.' );
	process.exit( 1 );
}
let total = 0;
for ( const key of Object.keys( ledger.variants ) ) {
	const jpg = path.join( OUT, `${ key }.jpg` );
	const out = path.join( OUT, `${ key }.webp` );
	await page.locator( `#v-${ key } .holo__card` ).screenshot( { path: jpg, type: 'jpeg', quality: 85 } );
	execFileSync( 'convert', [ jpg, '-define', 'webp:method=6', '-quality', '62', out ] );
	fs.unlinkSync( jpg );
	total += fs.statSync( out ).size;
}
await browser.close();
fs.unlinkSync( tmp );
console.log(
	`thumbs: ${ Object.keys( ledger.variants ).length } files in src/thumbs (${ ( total / 1024 ).toFixed( 0 ) } KB webp)`
);
