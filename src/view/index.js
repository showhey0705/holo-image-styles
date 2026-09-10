/**
 * Holo Image Styles — front-end store (Interactivity API, SPEC §5).
 *
 * State lives on the element (ref._holo*), never in context, so duplicated images
 * behave independently and hydration cannot clobber it. No JS animation loop:
 * the CSS `transition` on typed custom properties does the spring.
 */
import { store, getElement } from '@wordpress/interactivity';

const NS = 'holo-image-styles';

const reducedMotion = () => window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
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

/** Convert a 0–100 pointer position into the full variable set (same math as the original). */
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
		'pointer-from-center': round( clamp( Math.hypot( cx, cy ) / 50, 0, 1 ) ),
		'pointer-from-top': round( y / 100 ),
		'pointer-from-left': round( x / 100 ),
	};
};

/** One paint per frame: the latest pending pointer wins. */
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

const rest = ( el ) => {
	el._holoPending = null;
	stopShowcase( el );
	el.classList.remove( 'is-interacting' );
	setVars( el, REST );
};

/* ---- showcase (optional, once, 4 s) ---- */
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
	if ( reducedMotion() || document.hidden || el._holoShown || ! el.classList.contains( 'is-holo-armed' ) ) {
		return;
	}
	el._holoShown = true;
	el.classList.add( 'is-interacting' );
	let r = 0;
	el._holoShowInterval = setInterval( () => {
		r += 0.05;
		// Orbit the pointer around the card; sin/cos like the original showcase.
		el._holoPending = { x: 50 + Math.sin( r ) * 45, y: 50 + Math.cos( r ) * 45 };
		flush( el );
	}, 20 );
	el._holoShowEnd = setTimeout( () => rest( el ), 4000 );
};

/* ---- IntersectionObserver: arm/disarm ---- */
let io;
const observe = ( el ) => {
	io ??= new IntersectionObserver(
		( entries ) => {
			for ( const e of entries ) {
				e.target.classList.toggle( 'is-holo-armed', e.isIntersecting );
				if ( e.isIntersecting ) {
					if ( e.target.dataset.holoShowcase === '1' && ! e.target._holoShown && ! e.target._holoShowTimer ) {
						e.target._holoShowTimer = setTimeout( () => {
							e.target._holoShowTimer = null;
							startShowcase( e.target );
						}, 1000 );
					}
				} else {
					if ( e.target._holoShowTimer ) {
						clearTimeout( e.target._holoShowTimer );
						e.target._holoShowTimer = null;
					}
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
			document.querySelectorAll( '.holo__card.is-interacting' ).forEach( rest );
		}
	} );
};

store( NS, {
	actions: {
		move( event ) {
			const { ref } = getElement();
			if ( reducedMotion() || document.hidden || ! ref.classList.contains( 'is-holo-armed' ) ) {
				return;
			}
			if ( event.pointerType === 'touch' ) {
				// Touch only follows the finger after pointerdown (touch=tap); see `down`.
				if ( ref.dataset.holoTouch !== 'tap' || ! ref._holoTouchActive ) {
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
		down( event ) {
			const { ref } = getElement();
			// Touch devices without hover: light up for 1.5 s and spring back (touch=tap).
			if ( event.pointerType !== 'touch' || hoverable() || ref.dataset.holoTouch !== 'tap' ) {
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
			bindVisibility();
			if ( 'IntersectionObserver' in window ) {
				observe( ref );
			} else {
				ref.classList.add( 'is-holo-armed' );
				if ( ref.dataset.holoShowcase === '1' ) {
					setTimeout( () => startShowcase( ref ), 1000 );
				}
			}
			// "glare" touch mode: a static sheen on touch-only devices, no tilt.
			if ( ref.dataset.holoTouch === 'glare' && ! hoverable() && ! reducedMotion() ) {
				setVars( ref, { ...varsFromPointer( 28, 18 ), 'rotate-x': '0deg', 'rotate-y': '0deg', 'card-opacity': 0.6 } );
			}
		},
	},
} );
