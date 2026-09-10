import { chromium } from 'playwright';

const BASE = process.env.WP_BASE || 'http://127.0.0.1:8089';
const results = [];
const check = ( name, ok, extra = '' ) => {
	results.push( ok );
	console.log( ( ok ? '  ok   ' : '  FAIL ' ) + name + ( extra ? '  ' + extra : '' ) );
};

const browser = await chromium.launch( process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} );

async function frontTest( reduced ) {
	const ctx = await browser.newContext( { reducedMotion: reduced ? 'reduce' : 'no-preference', viewport: { width: 1200, height: 900 } } );
	const page = await ctx.newPage();
	const errors = [];
	page.on( 'console', ( m ) => { if ( m.type() === 'error' ) errors.push( m.text() ); } );
	page.on( 'pageerror', ( e ) => errors.push( 'pageerror: ' + e.message ) );
	await page.goto( BASE + '/?p=5', { waitUntil: 'networkidle' } );
	const label = reduced ? '[reduced-motion] ' : '[front] ';

	const cards = await page.locator( '.holo__card' ).count();
	check( label + '4 holo cards', cards === 4, String( cards ) );
	check( label + 'figcaption outside card', await page.locator( '.holo__card figcaption' ).count() === 0 && await page.locator( 'figure.is-style-holo-rainbow > figcaption' ).count() === 1 );
	check( label + 'layers are 2 per card', await page.locator( '.holo__card > .holo__shine' ).count() === 4 && await page.locator( '.holo__card > .holo__glare' ).count() === 4 );

	// Wait for hydration + IO
	await page.waitForTimeout( 800 );
	const armed = await page.locator( '.holo__card.is-holo-armed' ).count();
	check( label + 'armed by IntersectionObserver (visible ones)', armed >= 1, String( armed ) );

	const card = page.locator( '.holo__card[data-holo-variant="cosmos"]' );
	const box = await card.boundingBox();
	check( label + 'card has layout', !! box && box.width > 100 && box.height > 100, JSON.stringify( box ) );
	const shineBox = await page.locator( '.holo__card[data-holo-variant="cosmos"] .holo__shine' ).boundingBox();
	check( label + 'shine covers image', !! shineBox && Math.abs( shineBox.width - box.width ) < 2 && Math.abs( shineBox.height - box.height ) < 2, JSON.stringify( shineBox ) );

	await page.mouse.move( box.x + box.width * 0.2, box.y + box.height * 0.2 );
	await page.mouse.move( box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 5 } );
	await page.waitForTimeout( 150 );
	const vars = await card.evaluate( ( el ) => ( {
		rx: getComputedStyle( el ).getPropertyValue( '--rotate-x' ).trim(),
		px: getComputedStyle( el ).getPropertyValue( '--pointer-x' ).trim(),
		op: getComputedStyle( el ).getPropertyValue( '--card-opacity' ).trim(),
		interacting: el.classList.contains( 'is-interacting' ),
		transform: getComputedStyle( el ).transform,
		bg: getComputedStyle( el.querySelector( '.holo__shine' ) ).backgroundImage.slice( 0, 60 ),
	} ) );
	if ( reduced ) {
		check( label + 'rotate stays 0deg', vars.rx === '0deg', JSON.stringify( vars ) );
		check( label + 'no interacting class', ! vars.interacting );
		check( label + 'fixed pointer 28%', vars.px === '28%', vars.px );
	} else {
		check( label + 'pointer-x follows mouse (~80%)', parseFloat( vars.px ) > 70, vars.px );
		check( label + 'rotate-x non-zero', vars.rx !== '0deg', vars.rx );
		check( label + 'is-interacting', vars.interacting );
		check( label + 'transform applied', vars.transform !== 'none' && vars.transform.startsWith( 'matrix3d' ), vars.transform.slice( 0, 30 ) );
		check( label + 'shine texture painted', vars.bg.includes( 'url(' ), vars.bg );
		await page.mouse.move( 5, 5 );
		await page.waitForTimeout( 100 );
		check( label + 'leave clears is-interacting', ! ( await card.evaluate( ( el ) => el.classList.contains( 'is-interacting' ) ) ) );
	}

	// Lightbox button still works.
	const trigger = page.locator( '.holo__card .lightbox-trigger' );
	check( label + 'lightbox trigger inside card', await trigger.count() === 1 );
	await page.locator( '.holo__card[data-holo-variant="rare-holo"]' ).hover();
	await trigger.click( { force: false } ).catch( ( e ) => errors.push( 'lightbox click: ' + e.message ) );
	await page.waitForTimeout( 400 );
	const overlayOpen = await page.evaluate( () => document.querySelector( '.wp-lightbox-overlay' )?.classList.contains( 'active' ) );
	check( label + 'lightbox opens', overlayOpen === true );
	await page.keyboard.press( 'Escape' );
	await page.waitForTimeout( 800 );

	// Link inside card clickable.
	const href = await page.locator( '.holo__card > a' ).getAttribute( 'href' );
	check( label + 'link kept', href === 'https://example.com/' );
	await page.locator( '.holo__card > a' ).scrollIntoViewIfNeeded();
	const clickable = await page.locator( '.holo__card > a' ).evaluate( ( a ) => {
		const r = a.getBoundingClientRect();
		const el = document.elementFromPoint( r.x + r.width / 2, r.y + r.height / 2 );
		return el && ( el === a || a.contains( el ) );
	} );
	check( label + 'link receives clicks (not covered by layers)', clickable === true );

	check( label + 'no console errors', errors.length === 0, errors.join( ' | ' ) );
	await page.screenshot( { path: `./tests/e2e/artifacts/front${ reduced ? '-reduced' : '' }.png`, fullPage: true } );
	await ctx.close();
}

await frontTest( false );
await frontTest( true );

// Editor
{
	const ctx = await browser.newContext( { viewport: { width: 1400, height: 1000 } } );
	const page = await ctx.newPage();
	const errors = [];
	page.on( 'console', ( m ) => { if ( m.type() === 'error' ) errors.push( m.text() ); } );
	page.on( 'pageerror', ( e ) => errors.push( 'pageerror: ' + e.message ) );
	await page.goto( BASE + '/wp-login.php' );
	await page.fill( '#user_login', ( process.env.WP_USER || 'admin' ) );
	await page.fill( '#user_pass', process.env.WP_PASS || 'admin' );
	await page.click( '#wp-submit' );
	await page.waitForURL( /wp-admin/ );
	await page.goto( BASE + '/wp-admin/post.php?post=5&action=edit', { waitUntil: 'networkidle' } );
	// Dismiss welcome guide if any
	await page.keyboard.press( 'Escape' ).catch( () => {} );
	const frame = page.frameLocator( 'iframe[name="editor-canvas"]' );
	await frame.locator( 'figure.is-style-holo-cosmos' ).first().waitFor( { timeout: 30000 } );
	const wrap = frame.locator( 'figure.is-style-holo-cosmos' ).first();
	const attrs = await wrap.evaluate( ( el ) => ( {
		variant: el.getAttribute( 'data-holo-variant' ),
		intensity: el.style.getPropertyValue( '--holo-intensity' ),
		before: getComputedStyle( el, '::before' ).backgroundImage.slice( 0, 40 ),
		beforeOpacity: getComputedStyle( el, '::before' ).opacity,
	} ) );
	check( '[editor] wrapper data-holo-variant', attrs.variant === 'cosmos', JSON.stringify( attrs ) );
	check( '[editor] preview ::before painted', attrs.before.includes( 'gradient' ) && parseFloat( attrs.beforeOpacity ) > 0, JSON.stringify( attrs ) );
	const figBox = await wrap.boundingBox();
	const imgBox = await wrap.locator( 'img' ).boundingBox();
	check( '[editor] figure shrinks to image', Math.abs( figBox.width - imgBox.width ) < 2, JSON.stringify( { figBox, imgBox } ) );
	check( '[editor] holo-image-styles data present', await page.evaluate( () => !! window.holoImageStyles?.families?.cosmos ) );

	// Select block → inspector panel
	await wrap.click();
	const settings = page.locator( 'button[aria-label="Settings"]' ).first();
	if ( ( await settings.getAttribute( 'aria-pressed' ) ) !== 'true' && ( await settings.getAttribute( 'aria-expanded' ) ) !== 'true' ) {
		await settings.click().catch( () => {} );
	}
	await page.getByRole( 'tab', { name: 'Block' } ).click().catch( () => {} );
	await page.getByRole( 'tab', { name: 'Settings' } ).click().catch( () => {} );
	const panel = page.locator( '.interface-complementary-area' ).getByRole( 'button', { name: 'Holo effect' } );
	await panel.waitFor( { timeout: 10000 } ).catch( () => {} );
	await page.screenshot( { path: './tests/e2e/artifacts/editor-panel.png' } );
	if ( await panel.count() === 0 ) { console.log( 'sidebar html:', ( await page.locator( '.interface-complementary-area' ).innerText().catch( () => 'no sidebar' ) ).slice( 0, 600 ) ); }
	check( '[editor] Holo effect panel visible', await panel.count() === 1 );
	const isOpen = await panel.getAttribute( 'aria-expanded' );
	if ( isOpen !== 'true' ) await panel.click();
	const picker = page.locator( '.interface-complementary-area .holo-picker' );
	check( '[editor] thumbnail picker present', await picker.count() === 1 );
	check( '[editor] free help line', await page.locator( '.interface-complementary-area .holo-image-styles__help' ).count() === 1 );
	const radios = picker.getByRole( 'radio' );
	const labels = await radios.allTextContents();
	check( '[editor] cosmos family has 1 thumbnail in free', labels.length === 1 && labels[ 0 ] === 'Galaxy / Cosmos', labels.join( ',' ) );
	const thumbOk = await radios.first().locator( 'img' ).evaluate( ( img ) => img.complete && img.naturalWidth > 0 );
	check( '[editor] thumbnail image loads', thumbOk === true );
	check( '[editor] strength presets', await page.locator( '.interface-complementary-area' ).getByRole( 'radio', { name: 'Normal' } ).count() === 1 );

	// Toolbar button → popover with the same picker; hover a thumbnail → canvas preview attribute.
	await page.locator( '.block-editor-block-toolbar' ).getByRole( 'button', { name: 'Holo effect' } ).click();
	const popover = page.locator( '.holo-popover' );
	await popover.waitFor( { timeout: 5000 } ).catch( () => {} );
	check( '[editor] toolbar popover opens with picker', await popover.locator( '.holo-picker' ).count() === 1 );
	await popover.getByRole( 'radio' ).first().hover();
	await page.waitForTimeout( 150 );
	check( '[editor] hover sets canvas preview', ( await wrap.getAttribute( 'data-holo-preview' ) ) === '1' );
	await page.mouse.move( 10, 10 );
	await page.waitForTimeout( 150 );
	check( '[editor] leaving clears preview', ( await wrap.getAttribute( 'data-holo-preview' ) ) === null );
	await page.keyboard.press( 'Escape' );

	// Block validity: no "This block contains unexpected or invalid content"
	const invalid = await frame.locator( '.block-editor-warning' ).count();
	check( '[editor] no invalid block warnings', invalid === 0, String( invalid ) );

	// The amazing-rare (all-only) block should show the fallback notice
	await frame.locator( 'figure.is-style-holo-holo' ).first().click();
	await page.getByRole( 'tab', { name: 'Settings' } ).click().catch( () => {} );
	await page.waitForTimeout( 300 );
	await page.screenshot( { path: './tests/e2e/artifacts/editor-fallback.png' } );
		check( '[editor] fallback notice for all-only variant', ( await page.locator( '.components-notice' ).filter( { hasText: 'amazing-rare' } ).count() ) === 1 );

	check( '[editor] no console errors', errors.filter( ( e ) => ! /favicon|net::ERR/.test( e ) ).length === 0, errors.join( ' | ' ).slice( 0, 500 ) );
	await page.screenshot( { path: './tests/e2e/artifacts/editor.png' } );
	await ctx.close();
}

await browser.close();
const failed = results.filter( ( r ) => ! r ).length;
console.log( failed ? `\n${ failed } FAILED` : '\nALL OK' );
process.exit( failed ? 1 : 0 );
