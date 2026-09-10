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
	await page.goto( BASE + '/?name=holo-test', { waitUntil: 'networkidle' } );
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
	// The lightbox image is the "holo" family card; which variant it resolves to depends on the
	// active edition, so find it by the trigger instead of hardcoding a variant slug.
	await page.locator( '.holo__card' ).filter( { has: page.locator( '.lightbox-trigger' ) } ).first().hover();
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
	// Resolve the fixture post by slug; 'networkidle' never settles in wp-admin (heartbeat), so
	// wait for the DOM and let the canvas assertion below do the real waiting.
	const posts = await ( await fetch( BASE + '/?rest_route=/wp/v2/posts&slug=holo-test' ) ).json();
	const postId = posts?.[ 0 ]?.id;
	check( '[editor] fixture post found', !! postId, String( postId ) );
	await page.goto( BASE + '/wp-admin/post.php?post=' + postId + '&action=edit', { waitUntil: 'domcontentloaded' } );
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
	check( '[editor] free edition shows all 7 effects in one grid', labels.length === 7, labels.join( ',' ) );
	check( '[editor] cosmos is checked', ( await picker.locator( '[data-variant="cosmos"]' ).getAttribute( 'aria-checked' ) ) === 'true' );
	const thumbOk = await radios.first().locator( 'img' ).evaluate( ( img ) => img.complete && img.naturalWidth > 0 );
	check( '[editor] thumbnail image loads', thumbOk === true );
	check( '[editor] strength presets', await page.locator( '.interface-complementary-area' ).getByRole( 'radio', { name: 'Normal' } ).count() === 1 );

	const blk = frame.locator( '#' + ( await wrap.getAttribute( 'id' ) ) );
	// Click another family's thumbnail → className switches style, canvas follows.
	await picker.locator( '[data-variant="secret-rare"]' ).click();
	await page.waitForTimeout( 200 );
	check( '[editor] picking another family switches the block style', ( await blk.getAttribute( 'class' ) ).includes( 'is-style-holo-metallic' ) && ! ( await blk.getAttribute( 'class' ) ).includes( 'is-style-holo-cosmos' ) );
	check( '[editor] canvas shows the new variant', ( await blk.getAttribute( 'data-holo-variant' ) ) === 'secret-rare' );
	await picker.locator( '[data-variant="cosmos"]' ).click();
	await page.waitForTimeout( 200 );
	check( '[editor] back to cosmos', ( await blk.getAttribute( 'class' ) ).includes( 'is-style-holo-cosmos' ) );

	// Toolbar button → opens the sidebar (Settings tab) on the Holo effect panel and focuses the picker.
	await page.locator( 'button[aria-label="Settings"]' ).first().click().catch( () => {} ); // close sidebar
	await page.waitForTimeout( 300 );
	await page.locator( '.block-editor-block-toolbar' ).getByRole( 'button', { name: 'Holo effect' } ).click();
	await page.waitForTimeout( 900 );
	const sidePicker = page.locator( '.interface-complementary-area .holo-picker' );
	check( '[editor] toolbar button opens the sidebar panel', await sidePicker.count() === 1 && await sidePicker.isVisible() );
	check( '[editor] focus lands on the checked thumbnail', await page.evaluate( () => document.activeElement?.getAttribute( 'data-variant' ) ) === 'cosmos' );
	// Hover a thumbnail of another family → canvas preview attribute.
	await sidePicker.locator( '[data-variant="rare-holo"]' ).hover();
	await page.waitForTimeout( 150 );
	check( '[editor] hover sets canvas preview (other family)', ( await blk.getAttribute( 'data-holo-preview' ) ) === '1' && ( await blk.getAttribute( 'class' ) ).includes( 'is-style-holo-holo' ) );
	await page.mouse.move( 10, 10 );
	await page.waitForTimeout( 150 );
	check( '[editor] leaving clears preview', ( await blk.getAttribute( 'data-holo-preview' ) ) === null && ! ( await blk.getAttribute( 'class' ) ).includes( 'is-style-holo-holo' ) );
	// Arrow key → next effect applied.
	await sidePicker.locator( '[data-variant="cosmos"]' ).focus();
	await page.keyboard.press( 'ArrowRight' );
	await page.waitForTimeout( 200 );
	check( '[editor] arrow key picks the next effect', ( await blk.getAttribute( 'data-holo-variant' ) ) === 'rainbow-rare' );
	await page.keyboard.press( 'ArrowLeft' );
	await page.waitForTimeout( 200 );
	check( '[editor] arrow back', ( await blk.getAttribute( 'data-holo-variant' ) ) === 'cosmos' );
	// Shortcut ⇧⌥⌘H from the canvas opens the sidebar panel too.
	await page.locator( 'button[aria-label="Settings"]' ).first().click().catch( () => {} );
	await page.waitForTimeout( 300 );
	await blk.click();
	await page.keyboard.press( process.platform === 'darwin' ? 'Meta+h' : 'Control+h' );
	await page.waitForTimeout( 900 );
	check( '[editor] ⌘H opens the sidebar panel', await page.locator( '.interface-complementary-area .holo-picker' ).isVisible().catch( () => false ) );

	// Rounded corners: the wrapper copies the image radius.
	const rounded = frame.locator( 'figure.is-style-rounded' ).first();
	await rounded.scrollIntoViewIfNeeded();

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
