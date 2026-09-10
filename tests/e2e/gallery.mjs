import { chromium } from 'playwright';
const browser = await chromium.launch( process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} );
const page = await browser.newPage( { viewport: { width: 1000, height: 900 } } );
const errors = [];
page.on( 'console', ( m ) => { if ( m.type() === 'error' ) errors.push( m.text() ); } );
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
await page.goto( ( process.env.WP_BASE || 'http://127.0.0.1:8089' ) + '/?name=all-variants', { waitUntil: 'networkidle' } );
const cards = page.locator( '.holo__card' );
const n = await cards.count();
const shots = [];
for ( let i = 0; i < n; i++ ) {
	const c = cards.nth( i );
	await c.scrollIntoViewIfNeeded();
	const b = await c.boundingBox();
	await page.mouse.move( b.x + b.width * 0.3, b.y + b.height * 0.25 );
	await page.mouse.move( b.x + b.width * 0.7, b.y + b.height * 0.35, { steps: 4 } );
	await page.waitForTimeout( 350 );
	const name = await c.getAttribute( 'data-holo-variant' );
	// Index-prefixed so the free edition (where several cards fall back to the same
	// family default) does not overwrite its own screenshots.
	await c.screenshot( { path: `./tests/e2e/artifacts/v-${ String( i ).padStart( 2, '0' ) }-${ name }.png` } );
	shots.push( name );
	await page.mouse.move( 2, 2 );
	await page.waitForTimeout( 60 );
}
console.log( n + ' cards:', shots.join( ' ' ) );
await browser.close();
if ( ! n ) {
	console.error( 'FAIL: no .holo__card found on the gallery post' );
	process.exit( 1 );
}
if ( errors.length ) {
	console.error( 'FAIL: console errors', errors );
	process.exit( 1 );
}
console.log( 'ALL OK' );
