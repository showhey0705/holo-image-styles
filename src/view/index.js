/**
 * Holo Image Styles — front-end store (Interactivity API, SPEC §5).
 *
 * State lives on the element (ref._holo*), never in context, so duplicated images
 * behave independently and hydration cannot clobber it. No JS animation loop:
 * the CSS `transition` on typed custom properties does the spring.
 */
import { store, getElement } from '@wordpress/interactivity';

const NS = 'holo-image-styles';

const reducedMotion = () =>
	window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
const hoverable = () => window.matchMedia( '(hover: hover)' ).matches;
const clamp = ( v, a = 0, b = 100 ) => Math.min( b, Math.max( a, v ) );
const adjust = ( v, a, b, c, d ) => c + ( ( d - c ) * ( v - a ) ) / ( b - a );
const round = ( v ) => Math.round( v * 100 ) / 100;

const REST = {
	'pointer-x': '50%',
	'pointer-y': '50%',
	'background-x': '50%',
	'background-y': '50%',
	'rotate-x': '0deg',
	'rotate-y': '0deg',
	'card-opacity': 0,
	'pointer-from-center': 0,
	'pointer-from-top': 0.5,
	'pointer-from-left': 0.5,
};

const setVars = ( el, vars ) => {
	for ( const k in vars ) {
		el.style.setProperty( '--' + k, vars[ k ] );
	}
};

/**
 * Convert a 0–100 pointer position into the full variable set (same math as the original).
 *
 * @param {number} x Pointer X in percent of the card width.
 * @param {number} y Pointer Y in percent of the card height.
 * @return {Object<string, string|number>} Custom-property values (without the leading "--").
 */
const varsFromPointer = ( x, y ) => {
	const cx = x - 50;
	const cy = y - 50;
	return {
		'pointer-x': round( x ) + '%',
		'pointer-y': round( y ) + '%',
		'background-x': round( adjust( x, 0, 100, 37, 63 ) ) + '%',
		'background-y': round( adjust( y, 0, 100, 33, 67 ) ) + '%',
		'rotate-x': round( -( cx / 3.5 ) ) + 'deg',
		'rotate-y': round( cy / 3.5 ) + 'deg',
		'card-opacity': 1,
		'pointer-from-center': round(
			clamp( Math.hypot( cx, cy ) / 50, 0, 1 )
		),
		'pointer-from-top': round( y / 100 ),
		'pointer-from-left': round( x / 100 ),
	};
};

/**
 * One paint per frame: the latest pending pointer wins.
 *
 * @param {HTMLElement} el The .holo__card element.
 */
const flush = ( el ) => {
	el._holoRaf ??= requestAnimationFrame( () => {
		el._holoRaf = null;
		const p = el._holoPending;
		if ( ! p ) {
			return;
		}
		setVars( el, varsFromPointer( p.x, p.y ) );
	} );
};

/* Fixed sheen used while a card is "lifted" (click) or in touch=glare mode. */
const LIFT_VARS = {
	...varsFromPointer( 35, 25 ),
	'rotate-x': '0deg',
	'rotate-y': '0deg',
};

const rest = ( el ) => {
	el._holoPending = null;
	stopShowcase( el );
	el.classList.remove( 'is-interacting' );
	setVars( el, el.classList.contains( 'is-lifted' ) ? LIFT_VARS : REST );
};

const unlift = ( el ) => {
	if ( el.classList.contains( 'is-lifted' ) ) {
		el.classList.remove( 'is-lifted' );
		rest( el );
	}
};
const unliftAll = () =>
	document.querySelectorAll( '.holo__card.is-lifted' ).forEach( unlift );

/* ---- showcase (optional, once per page view) ----
 * Per-image settings come from data attributes (see Render::showcase_attrs):
 *   data-holo-sc-delay     seconds before it starts (0–3)
 *   data-holo-sc-duration  seconds it runs (1–5)
 *   data-holo-sc-path      orbit | sweep | diagonal
 *   data-holo-sc-stagger   together | sequence  (sequence: cards entering the viewport together light up one after another)
 *   data-holo-enter        "1": fade/rise in while the sweep runs
 */
const STAGGER_STEP = 250; // ms between cards in "sequence" mode

const showcaseConfig = ( el ) => {
	const d = el.dataset;
	const num = ( v, fb, min, max ) => {
		const n = parseFloat( v );
		return Number.isFinite( n ) ? Math.min( max, Math.max( min, n ) ) : fb;
	};
	return {
		delay: num( d.holoScDelay, 0.25, 0, 3 ) * 1000,
		duration: num( d.holoScDuration, 2, 1, 5 ) * 1000,
		path: [ 'orbit', 'sweep', 'diagonal' ].includes( d.holoScPath )
			? d.holoScPath
			: 'orbit',
		sequence: d.holoScStagger !== 'together',
	};
};

/* Pointer position (0–100) at progress t (0–1) for each path. */
const PATHS = {
	// ~2 laps around the card, like the original showcase.
	orbit: ( t ) => {
		const r = t * Math.PI * 4;
		return { x: 50 + Math.sin( r ) * 45, y: 50 + Math.cos( r ) * 45 };
	},
	// One pass left → right across the upper part of the card, eased at both ends.
	sweep: ( t ) => {
		const e = 0.5 - Math.cos( Math.PI * t ) / 2;
		return { x: 5 + 90 * e, y: 38 - Math.sin( Math.PI * t ) * 12 };
	},
	// Top-left → bottom-right and back.
	diagonal: ( t ) => {
		const u = Math.sin( Math.PI * t );
		return { x: 12 + 76 * u, y: 12 + 76 * u };
	},
};

const stopShowcase = ( el ) => {
	if ( el._holoShowInterval ) {
		clearInterval( el._holoShowInterval );
		el._holoShowInterval = null;
	}
	if ( el._holoShowEnd ) {
		clearTimeout( el._holoShowEnd );
		el._holoShowEnd = null;
	}
};

const startShowcase = ( el ) => {
	if (
		reducedMotion() ||
		document.hidden ||
		el._holoShown ||
		! el.classList.contains( 'is-holo-armed' )
	) {
		return;
	}
	const cfg = showcaseConfig( el );
	const path = PATHS[ cfg.path ];
	el._holoShown = true;
	el.classList.add( 'is-interacting' );
	const t0 = performance.now();
	el._holoShowInterval = setInterval( () => {
		const t = Math.min( 1, ( performance.now() - t0 ) / cfg.duration );
		el._holoPending = path( t );
		flush( el );
	}, 20 );
	el._holoShowEnd = setTimeout( () => rest( el ), cfg.duration );
};

/* Schedule the showcase after the per-image delay (+ stagger offset); cancelled when the card leaves the viewport. */
const scheduleShowcase = ( el, extra = 0 ) => {
	if (
		el.dataset.holoShowcase !== '1' ||
		el._holoShown ||
		el._holoShowTimer
	) {
		return;
	}
	el._holoShowTimer = setTimeout(
		() => {
			el._holoShowTimer = null;
			startShowcase( el );
		},
		showcaseConfig( el ).delay + extra
	);
};

const unscheduleShowcase = ( el ) => {
	if ( el._holoShowTimer ) {
		clearTimeout( el._holoShowTimer );
		el._holoShowTimer = null;
	}
};

/* Entrance: CSS hides [data-holo-enter] cards from the first paint; adding .is-holo-revealed fades/rises them in. */
const reveal = ( el ) => {
	if ( el.dataset.holoEnter === '1' ) {
		el.classList.add( 'is-holo-revealed' );
	}
};

/* ---- IntersectionObserver: arm/disarm ---- */
let io;
const observe = ( el ) => {
	io ??= new IntersectionObserver(
		( entries ) => {
			// Cards entering together (a gallery row) light up one after another in "sequence" mode,
			// in document order.
			const sorted = [ ...entries ].sort( ( a, b ) =>
				// eslint-disable-next-line no-bitwise -- compareDocumentPosition returns a bitmask.
				a.target.compareDocumentPosition( b.target ) &
				Node.DOCUMENT_POSITION_FOLLOWING
					? -1
					: 1
			);
			let seq = 0;
			for ( const e of sorted ) {
				e.target.classList.toggle( 'is-holo-armed', e.isIntersecting );
				if ( e.isIntersecting ) {
					reveal( e.target );
					const willRun =
						e.target.dataset.holoShowcase === '1' &&
						! e.target._holoShown;
					const sequence =
						e.target.dataset.holoScStagger !== 'together';
					scheduleShowcase(
						e.target,
						willRun && sequence ? seq++ * STAGGER_STEP : 0
					);
				} else {
					unscheduleShowcase( e.target );
					rest( e.target );
				}
			}
		},
		{ rootMargin: '200px 0px' }
	);
	io.observe( el );
};

/* One document listener for every card (not one per init). */
let visibilityBound = false;
const bindVisibility = () => {
	if ( visibilityBound ) {
		return;
	}
	visibilityBound = true;
	document.addEventListener( 'visibilitychange', () => {
		if ( document.hidden ) {
			document
				.querySelectorAll( '.holo__card.is-interacting' )
				.forEach( rest );
		}
	} );
	// Click outside / Escape puts lifted cards back.
	document.addEventListener( 'pointerdown', ( e ) => {
		if ( ! e.target.closest?.( '.holo__card.is-lifted' ) ) {
			unliftAll();
		}
	} );
	document.addEventListener( 'keydown', ( e ) => {
		if ( e.key === 'Escape' ) {
			unliftAll();
		}
	} );
};

/**
 * Copy the rendered border-radius of the image (theme CSS or the block's own "Radius" setting) onto the
 * card so shine/glare layers get the same rounded corners; otherwise square layers show at the corners.
 *
 * @param {HTMLElement} card The .holo__card element.
 */
const syncRadius = ( card ) => {
	const img = card.querySelector( 'img' );
	if ( ! img ) {
		return;
	}
	let radius = getComputedStyle( img ).borderRadius;
	if ( ! radius || /^0(px)?(\s+0(px)?)*$/.test( radius ) ) {
		const figure = card.closest( 'figure' );
		radius = figure ? getComputedStyle( figure ).borderRadius : '';
	}
	if ( radius && ! /^0(px)?(\s+0(px)?)*$/.test( radius ) ) {
		card.style.setProperty( '--holo-radius', radius );
		img.style.borderRadius = 'inherit';
	}
};

store( NS, {
	actions: {
		move( event ) {
			const { ref } = getElement();
			if (
				reducedMotion() ||
				document.hidden ||
				! ref.classList.contains( 'is-holo-armed' )
			) {
				return;
			}
			if ( event.pointerType === 'touch' ) {
				// Touch only follows the finger after pointerdown (touch=tap); see `down`.
				if (
					ref.dataset.holoTouch !== 'tap' ||
					! ref._holoTouchActive
				) {
					return;
				}
			}
			const r = ref.getBoundingClientRect();
			if ( ! r.width || ! r.height ) {
				return;
			}
			const x = clamp( ( 100 / r.width ) * ( event.clientX - r.left ) );
			const y = clamp( ( 100 / r.height ) * ( event.clientY - r.top ) );
			stopShowcase( ref );
			ref.classList.add( 'is-interacting' );
			ref._holoPending = { x, y };
			flush( ref );
		},
		leave() {
			const { ref } = getElement();
			rest( ref );
		},
		click( event ) {
			// click=lift: the card floats up (scale) with the sheen on; click again / outside / Esc to put it back.
			const { ref } = getElement();
			if (
				ref.dataset.holoClick !== 'lift' ||
				event.target.closest( 'a, button' )
			) {
				return;
			}
			if ( ref.classList.contains( 'is-lifted' ) ) {
				unlift( ref );
				return;
			}
			unliftAll();
			ref.classList.add( 'is-lifted' );
			if ( reducedMotion() || ! hoverable() ) {
				setVars( ref, LIFT_VARS );
			}
		},
		down( event ) {
			const { ref } = getElement();
			// Touch devices without hover: light up for 1.5 s and spring back (touch=tap).
			// With click=lift the tap toggles the lift instead (see `click`).
			if (
				event.pointerType !== 'touch' ||
				hoverable() ||
				ref.dataset.holoTouch !== 'tap' ||
				ref.dataset.holoClick === 'lift'
			) {
				return;
			}
			ref._holoTouchActive = true;
			store( NS ).actions.move( event );
			clearTimeout( ref._holoTimer );
			ref._holoTimer = setTimeout( () => {
				ref._holoTouchActive = false;
				rest( ref );
			}, 1500 );
		},
	},
	callbacks: {
		init() {
			const { ref } = getElement();
			setVars( ref, REST );
			syncRadius( ref );
			bindVisibility();
			if ( 'IntersectionObserver' in window ) {
				observe( ref );
			} else {
				ref.classList.add( 'is-holo-armed' );
				reveal( ref );
				scheduleShowcase( ref );
			}
			// "glare" touch mode: a static sheen on touch-only devices, no tilt.
			if (
				ref.dataset.holoTouch === 'glare' &&
				! hoverable() &&
				! reducedMotion()
			) {
				setVars( ref, { ...LIFT_VARS, 'card-opacity': 0.6 } );
			}
		},
	},
} );
