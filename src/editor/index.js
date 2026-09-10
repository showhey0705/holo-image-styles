/**
 * Holo Image Styles — editor integration (SPEC §6, v1.2 picker UI).
 *
 * 1. Adds the `holo` attribute to core/image (same defaults as the server).
 * 2. "Holo effect" controls: every effect of this edition as a static thumbnail in one flat grid (ledger order).
 *    Choosing one sets the block style (is-style-holo-{family}) AND holo.variant in one click.
 *    Shown in the inspector for every Image block.
 * 3. Hovering a thumbnail previews that effect on the canvas (CSS-only preview, no cost).
 * 4. The toolbar button and ⌘H (alias ⇧⌥⌘H) open the block sidebar (Settings tab) on that panel — the standard place
 *    for block options; ← → pick, ⇧⌘⌫ removes the effect.
 * 5. Passes data-holo-variant + CSS variables to the block wrapper so editor.css can draw the preview,
 *    and copies the image's border-radius onto the wrapper so the preview corners match.
 */
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls, BlockControls } from '@wordpress/block-editor';
import {
	PanelBody,
	RangeControl,
	ToggleControl,
	Notice,
	ExternalLink,
	Button,
	ToolbarButton,
	SVG,
	Path,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
} from '@wordpress/components';
import { useEffect, useState, useCallback } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import {
	store as keyboardShortcutsStore,
	useShortcut,
} from '@wordpress/keyboard-shortcuts';
import { __, sprintf } from '@wordpress/i18n';

const DATA = window.holoImageStyles || {
	edition: 'free',
	families: {},
	variants: {},
	defaults: {},
	thumbsUrl: '',
};

const DEFAULTS = {
	variant: '',
	intensity: 1,
	tilt: 1,
	touch: 'tap',
	glow: 'soft',
	click: 'none',
	showcase: false,
	window: false,
	...( DATA.defaults || {} ),
};

const FAMILY_ORDER = Object.keys( DATA.families );
const ALL_VARIANTS = Object.keys( DATA.variants );
const SHORTCUT_NAME = 'holo-image-styles/toggle-picker';

/* Presets: intensity / tilt pairs. "custom" when the sliders don't match any of them. */
const PRESETS = {
	subtle: { intensity: 0.6, tilt: 0.6 },
	normal: { intensity: 1, tilt: 1 },
	bold: { intensity: 1.3, tilt: 1.2 },
};
const presetOf = ( holo ) =>
	Object.keys( PRESETS ).find(
		( k ) =>
			Math.abs( PRESETS[ k ].intensity - holo.intensity ) < 0.01 &&
			Math.abs( PRESETS[ k ].tilt - holo.tilt ) < 0.01
	) || 'custom';

const familyFromClass = ( className = '' ) => {
	const m = /\bis-style-holo-([a-z]+)\b/.exec( className || '' );
	return m && DATA.families[ m[ 1 ] ] ? m[ 1 ] : '';
};

/**
 * Replace any is-style-* class with the holo family style ('' removes the style).
 *
 * @param {string} className Current className attribute.
 * @param {string} family    Holo family slug, or '' to remove the style.
 * @return {string} New className.
 */
const withStyleClass = ( className = '', family ) => {
	const rest = ( className || '' )
		.split( /\s+/ )
		.filter( ( c ) => c && ! /^is-style-/.test( c ) );
	if ( family ) {
		rest.push( `is-style-holo-${ family }` );
	}
	return rest.join( ' ' );
};

/**
 * Effective variant key for the block ('' when no holo style).
 *
 * @param {Object} attributes Block attributes.
 * @return {string} Variant key.
 */
const currentVariant = ( attributes ) => {
	const family = familyFromClass( attributes.className );
	if ( ! family ) {
		return '';
	}
	const v = attributes.holo?.variant;
	return v && DATA.variants[ v ] && DATA.variants[ v ].family === family
		? v
		: DATA.families[ family ]?.default || '';
};

const HoloIcon = () => (
	<SVG
		viewBox="0 0 24 24"
		width="24"
		height="24"
		fill="none"
		aria-hidden="true"
	>
		<Path
			d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5zM5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9L5 17zm14-2l.7 1.6 1.6.7-1.6.7L19 19l-.7-1.6-1.6-.7 1.6-.7L19 15z"
			fill="currentColor"
		/>
	</SVG>
);

/* ---- hover preview: tiny module-level store keyed by clientId ---- */
const previews = new Map();
const listeners = new Map();
const setPreview = ( clientId, variant ) => {
	if ( variant ) {
		previews.set( clientId, variant );
	} else {
		previews.delete( clientId );
	}
	listeners.get( clientId )?.forEach( ( fn ) => fn( variant || '' ) );
};
const usePreview = ( clientId ) => {
	const [ preview, set ] = useState( previews.get( clientId ) || '' );
	useEffect( () => {
		const set_ = listeners.get( clientId ) || new Set();
		set_.add( set );
		listeners.set( clientId, set_ );
		return () => {
			set_.delete( set );
			if ( ! set_.size ) {
				listeners.delete( clientId );
			}
		};
	}, [ clientId ] );
	return preview;
};

/* 1. Attribute */
addFilter(
	'blocks.registerBlockType',
	'holo-image-styles/attributes',
	( settings, name ) => {
		if ( name !== 'core/image' ) {
			return settings;
		}
		return {
			...settings,
			attributes: {
				...settings.attributes,
				holo: { type: 'object', default: DEFAULTS },
			},
		};
	}
);

/* 2a. Thumbnail grid: every variant, grouped by family (radio semantics + arrow keys) */
const VariantPicker = ( { value, onChange, clientId } ) => {
	const clear = useCallback( () => setPreview( clientId, '' ), [ clientId ] );
	useEffect( () => clear, [ clear ] );

	const onKeyDown = ( e ) => {
		const idx = ALL_VARIANTS.indexOf( value );
		let next = null;
		if ( e.key === 'ArrowRight' || e.key === 'ArrowDown' ) {
			next = ALL_VARIANTS[ ( idx + 1 ) % ALL_VARIANTS.length ];
		} else if ( e.key === 'ArrowLeft' || e.key === 'ArrowUp' ) {
			next =
				ALL_VARIANTS[
					( idx - 1 + ALL_VARIANTS.length ) % ALL_VARIANTS.length
				];
		} else if ( e.key === 'Home' ) {
			next = ALL_VARIANTS[ 0 ];
		} else if ( e.key === 'End' ) {
			next = ALL_VARIANTS[ ALL_VARIANTS.length - 1 ];
		}
		if ( next ) {
			e.preventDefault();
			onChange( next );
			e.currentTarget
				.querySelector( `[data-variant="${ next }"]` )
				?.focus();
		}
	};

	return (
		// eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the radios inside are the focusable elements.
		<div
			className="holo-picker"
			role="radiogroup"
			aria-label={ __( 'Effect', 'holo-image-styles' ) }
			onMouseLeave={ clear }
			onKeyDown={ onKeyDown }
		>
			{ ALL_VARIANTS.map( ( key ) => {
				const checked = key === value;
				const focusable =
					checked || ( ! value && key === ALL_VARIANTS[ 0 ] );
				return (
					<button
						type="button"
						key={ key }
						data-variant={ key }
						role="radio"
						aria-checked={ checked }
						tabIndex={ focusable ? 0 : -1 }
						className={
							'holo-picker__item' +
							( checked ? ' is-checked' : '' )
						}
						title={
							DATA.families[ DATA.variants[ key ].family ].label
						}
						onClick={ () => onChange( key ) }
						onMouseEnter={ () => setPreview( clientId, key ) }
						onFocus={ () => setPreview( clientId, key ) }
						onBlur={ clear }
					>
						<img
							src={ `${ DATA.thumbsUrl }${ key }.webp` }
							alt=""
							width="160"
							height="224"
							loading="lazy"
							decoding="async"
							draggable="false"
						/>
						<span className="holo-picker__label">
							{ DATA.variants[ key ].label }
						</span>
					</button>
				);
			} ) }
		</div>
	);
};

/* 2b. All controls (shared by the inspector panel and the toolbar popover) */
const HoloControls = ( { attributes, setAttributes, clientId } ) => {
	const holo = { ...DEFAULTS, ...( attributes.holo || {} ) };
	const variant = currentVariant( attributes );
	const hasHolo = !! variant;
	const update = ( patch ) =>
		setAttributes( { holo: { ...holo, ...patch } } );
	const [ advanced, setAdvanced ] = useState( presetOf( holo ) === 'custom' );
	const preset = presetOf( holo );

	const choose = ( key ) => {
		const family = DATA.variants[ key ]?.family;
		if ( ! family ) {
			return;
		}
		const familyDefault = DATA.families[ family ]?.default || '';
		setAttributes( {
			className: withStyleClass( attributes.className, family ),
			holo: { ...holo, variant: key === familyDefault ? '' : key },
		} );
	};
	const remove = () =>
		setAttributes( {
			className: withStyleClass( attributes.className, '' ),
			holo: { ...holo, variant: '' },
		} );

	return (
		<>
			<VariantPicker
				value={ variant }
				clientId={ clientId }
				onChange={ choose }
			/>
			{ hasHolo && (
				<>
					<ToggleGroupControl
						label={ __( 'Strength', 'holo-image-styles' ) }
						value={ preset }
						onChange={ ( v ) => {
							if ( PRESETS[ v ] ) {
								update( PRESETS[ v ] );
							}
						} }
						isBlock
						__nextHasNoMarginBottom
						__next40pxDefaultSize
					>
						<ToggleGroupControlOption
							value="subtle"
							label={ __( 'Subtle', 'holo-image-styles' ) }
						/>
						<ToggleGroupControlOption
							value="normal"
							label={ __( 'Normal', 'holo-image-styles' ) }
						/>
						<ToggleGroupControlOption
							value="bold"
							label={ __( 'Bold', 'holo-image-styles' ) }
						/>
						{ preset === 'custom' && (
							<ToggleGroupControlOption
								value="custom"
								label={ __( 'Custom', 'holo-image-styles' ) }
							/>
						) }
					</ToggleGroupControl>
					<div className="holo-actions">
						<Button
							variant="link"
							size="small"
							className="holo-advanced-toggle"
							onClick={ () => setAdvanced( ! advanced ) }
							aria-expanded={ advanced }
						>
							{ advanced
								? __( 'Hide details', 'holo-image-styles' )
								: __( 'Fine-tune…', 'holo-image-styles' ) }
						</Button>
						<Button
							variant="link"
							size="small"
							isDestructive
							className="holo-remove"
							onClick={ remove }
						>
							{ __( 'Remove effect', 'holo-image-styles' ) }
						</Button>
					</div>
				</>
			) }
			{ hasHolo && advanced && (
				<div className="holo-advanced">
					<RangeControl
						label={ __( 'Intensity', 'holo-image-styles' ) }
						value={ Math.round( holo.intensity * 100 ) }
						onChange={ ( v ) =>
							update( { intensity: ( v ?? 100 ) / 100 } )
						}
						min={ 0 }
						max={ 150 }
						step={ 5 }
						__nextHasNoMarginBottom
						__next40pxDefaultSize
					/>
					<RangeControl
						label={ __( 'Tilt', 'holo-image-styles' ) }
						value={ Math.round( holo.tilt * 100 ) }
						onChange={ ( v ) =>
							update( { tilt: ( v ?? 100 ) / 100 } )
						}
						min={ 0 }
						max={ 150 }
						step={ 5 }
						__nextHasNoMarginBottom
						__next40pxDefaultSize
					/>
					<ToggleGroupControl
						label={ __( 'Shadow', 'holo-image-styles' ) }
						value={ holo.glow }
						onChange={ ( v ) => update( { glow: v } ) }
						isBlock
						__nextHasNoMarginBottom
						__next40pxDefaultSize
					>
						<ToggleGroupControlOption
							value="none"
							label={ __( 'None', 'holo-image-styles' ) }
						/>
						<ToggleGroupControlOption
							value="soft"
							label={ __( 'Soft', 'holo-image-styles' ) }
						/>
						<ToggleGroupControlOption
							value="color"
							label={ __( 'Glow', 'holo-image-styles' ) }
						/>
					</ToggleGroupControl>
					<ToggleGroupControl
						label={ __( 'On click', 'holo-image-styles' ) }
						help={ __(
							'Lift: the image floats up with the shine on; click again, click outside or press Esc to put it back. On touch devices this replaces the tap flash.',
							'holo-image-styles'
						) }
						value={ holo.click }
						onChange={ ( v ) => update( { click: v } ) }
						isBlock
						__nextHasNoMarginBottom
						__next40pxDefaultSize
					>
						<ToggleGroupControlOption
							value="none"
							label={ __( 'Nothing', 'holo-image-styles' ) }
						/>
						<ToggleGroupControlOption
							value="lift"
							label={ __( 'Lift', 'holo-image-styles' ) }
						/>
					</ToggleGroupControl>
					<ToggleGroupControl
						label={ __( 'Touch devices', 'holo-image-styles' ) }
						value={ holo.touch }
						onChange={ ( v ) => update( { touch: v } ) }
						isBlock
						__nextHasNoMarginBottom
						__next40pxDefaultSize
					>
						<ToggleGroupControlOption
							value="tap"
							label={ __( 'Tap', 'holo-image-styles' ) }
						/>
						<ToggleGroupControlOption
							value="glare"
							label={ __( 'Glare', 'holo-image-styles' ) }
						/>
						<ToggleGroupControlOption
							value="off"
							label={ __( 'Off', 'holo-image-styles' ) }
						/>
					</ToggleGroupControl>
					<ToggleControl
						label={ __( 'Auto showcase', 'holo-image-styles' ) }
						help={ __(
							'Plays a short 3-second sweep once when the image scrolls into view.',
							'holo-image-styles'
						) }
						checked={ !! holo.showcase }
						onChange={ ( v ) => update( { showcase: !! v } ) }
						__nextHasNoMarginBottom
					/>
					{ /* 'Card window' (holo.window) is kept as an attribute for trading-card images but no longer exposed here. */ }
				</div>
			) }
			{ DATA.edition === 'free' && DATA.upsellUrl && (
				<p className="holo-image-styles__help">
					{ __(
						'16 more effects are available in All Effects.',
						'holo-image-styles'
					) }{ ' ' }
					<ExternalLink href={ DATA.upsellUrl }>
						{ __( 'Learn more', 'holo-image-styles' ) }
					</ExternalLink>
				</p>
			) }
		</>
	);
};

/* 2c. Inspector panel + toolbar popover + keyboard shortcut */
let shortcutRegistered = false;
const useRegisterShortcut = () => {
	const { registerShortcut } = useDispatch( keyboardShortcutsStore );
	useEffect( () => {
		if ( shortcutRegistered ) {
			return;
		}
		shortcutRegistered = true;
		registerShortcut( {
			name: SHORTCUT_NAME,
			category: 'block',
			description: __(
				'Open the Holo effect picker for the selected image.',
				'holo-image-styles'
			),
			// ⌘H, the same key as Rough Notation. macOS reserves ⌘H for "Hide"; Chrome hands the keydown to the
			// page first and preventDefault() keeps it. ⇧⌥⌘H stays as an alias for setups where the OS wins.
			// (⇧⌘H is core's "toggle block visibility" since WP 7.x, ⌥⌘H is macOS "Hide Others".)
			keyCombination: { modifier: 'primary', character: 'h' },
			aliases: [ { modifier: 'secondary', character: 'h' } ],
		} );
	}, [ registerShortcut ] );
};

/**
 * Open the block sidebar on the Settings tab, expand the "Holo effect" panel and focus the picker.
 * This is the WordPress-standard place for block options; the toolbar button and the shortcut both lead here.
 *
 * @param {Function} enableComplementaryArea Dispatcher from core/interface.
 * @param {Function} setPanelOpen            State setter for the PanelBody.
 */
const revealPanel = ( enableComplementaryArea, setPanelOpen ) => {
	enableComplementaryArea( 'core', 'edit-post/block' );
	setPanelOpen( true );
	// The inspector tabs (Content / Settings / Styles) have no public API; switch via the DOM after render.
	let tries = 0;
	const tick = () => {
		const tab = document.querySelector(
			'.block-editor-block-inspector__tabs [role="tab"][id$="-settings"]'
		);
		if ( tab && tab.getAttribute( 'aria-selected' ) !== 'true' ) {
			tab.click();
		}
		const picker = document.querySelector(
			'.interface-complementary-area .holo-picker'
		);
		if ( picker ) {
			picker.scrollIntoView( { block: 'nearest' } );
			const target =
				picker.querySelector( '[role="radio"][aria-checked="true"]' ) ||
				picker.querySelector( '[role="radio"]' );
			target?.focus( { preventScroll: true } );
			return;
		}
		if ( tries++ < 10 ) {
			setTimeout( tick, 60 );
		}
	};
	setTimeout( tick, 30 );
};

const HoloPanel = ( props ) => {
	const { attributes, setAttributes, isSelected } = props;
	const family = familyFromClass( attributes.className );
	const holo = { ...DEFAULTS, ...( attributes.holo || {} ) };
	const [ fallbackNotice, setFallbackNotice ] = useState( '' );
	const [ panelOpen, setPanelOpen ] = useState( !! family );
	const { enableComplementaryArea } = useDispatch( 'core/interface' );
	useRegisterShortcut();

	const openPanel = () => {
		if ( ! family && FAMILY_ORDER.length ) {
			// Start from the first family's default so the user sees something right away.
			setAttributes( {
				className: withStyleClass(
					attributes.className,
					FAMILY_ORDER[ 0 ]
				),
				holo: { ...holo, variant: '' },
			} );
		}
		revealPanel( enableComplementaryArea, setPanelOpen );
	};

	useShortcut( SHORTCUT_NAME, ( e ) => {
		if ( ! isSelected || ! attributes.url ) {
			return;
		}
		e.preventDefault();
		openPanel();
	} );

	// A stored variant that this edition doesn't have → reset to the family default, tell the user once.
	useEffect( () => {
		if ( ! family ) {
			return;
		}
		const current = holo.variant;
		if ( current && ! DATA.variants[ current ] ) {
			setFallbackNotice(
				sprintf(
					/* translators: %s: effect name. */
					__(
						'"%s" is not included in this edition; the default effect of this family is used instead.',
						'holo-image-styles'
					),
					current
				)
			);
			setAttributes( { holo: { ...holo, variant: '' } } );
			return;
		}
		if ( current && DATA.variants[ current ].family !== family ) {
			setAttributes( { holo: { ...holo, variant: '' } } );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ family ] );

	if ( ! attributes.url ) {
		return null; // No image yet.
	}

	const onPanelKeyDown = ( e ) => {
		if (
			e.key === 'Backspace' &&
			e.shiftKey &&
			( e.metaKey || e.ctrlKey )
		) {
			e.preventDefault();
			setAttributes( {
				className: withStyleClass( attributes.className, '' ),
				holo: { ...holo, variant: '' },
			} );
		}
	};

	return (
		<>
			<BlockControls group="other">
				{ /* No ToolbarGroup of our own: core wraps the "other" group, so the button sits flush with its neighbours. */ }
				<ToolbarButton
					icon={ <HoloIcon /> }
					label={ __( 'Holo effect', 'holo-image-styles' ) }
					shortcut="⌘H"
					onClick={ openPanel }
					isPressed={ !! family }
				/>
			</BlockControls>
			<InspectorControls>
				<PanelBody
					title={ __( 'Holo effect', 'holo-image-styles' ) }
					opened={ panelOpen }
					onToggle={ setPanelOpen }
				>
					{ fallbackNotice && (
						<Notice
							status="info"
							isDismissible
							onRemove={ () => setFallbackNotice( '' ) }
						>
							{ fallbackNotice }
						</Notice>
					) }
					{ /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- ⇧⌘⌫ shortcut scope */ }
					<div className="holo-panel" onKeyDown={ onPanelKeyDown }>
						<HoloControls { ...props } />
						<p className="holo-panel__hint">
							{ __(
								'← → choose · ⇧⌘⌫ remove',
								'holo-image-styles'
							) }
						</p>
					</div>
				</PanelBody>
			</InspectorControls>
		</>
	);
};

const withHoloPanel = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		if ( props.name !== 'core/image' ) {
			return <BlockEdit { ...props } />;
		}
		return (
			<>
				<BlockEdit { ...props } />
				<HoloPanel { ...props } />
			</>
		);
	};
}, 'withHoloPanel' );

addFilter( 'editor.BlockEdit', 'holo-image-styles/panel', withHoloPanel );

/* 5. Wrapper props for the editor preview (hover preview wins over the saved value) */
const HoloWrapper = ( { BlockListBlock, ...props } ) => {
	const family = familyFromClass( props.attributes.className );
	const preview = usePreview( props.clientId );
	const saved = currentVariant( props.attributes );
	const previewFamily = preview && DATA.variants[ preview ]?.family;
	const effectiveFamily = previewFamily || family;

	// Copy the image's rendered border-radius onto the wrapper so the preview corners match (see view/index.js).
	useEffect( () => {
		if ( ! effectiveFamily ) {
			return;
		}
		const doc =
			document.querySelector( 'iframe[name="editor-canvas"]' )
				?.contentDocument || document;
		const el = doc.getElementById( `block-${ props.clientId }` );
		const img = el?.querySelector( 'img' );
		if ( ! el || ! img ) {
			return;
		}
		const radius = doc.defaultView.getComputedStyle( img ).borderRadius;
		if ( radius && ! /^0(px)?(\s+0(px)?)*$/.test( radius ) ) {
			el.style.setProperty( '--holo-radius', radius );
		}
	}, [ effectiveFamily, props.clientId, props.attributes.style ] );

	if ( ! effectiveFamily ) {
		return <BlockListBlock { ...props } />;
	}
	const holo = { ...DEFAULTS, ...( props.attributes.holo || {} ) };
	const variant = preview && DATA.variants[ preview ] ? preview : saved;
	const className = previewFamily
		? [ props.className, `is-style-holo-${ previewFamily }` ]
				.filter( Boolean )
				.join( ' ' )
		: props.className;
	const url = props.attributes.url || '';
	const alpha = /\.(png|webp|gif|avif|svg)(\?|#|$)/i.test( url );
	const style = {
		...( props.wrapperProps?.style || {} ),
		'--holo-intensity': String( holo.intensity ),
		'--holo-glow': DATA.families[ effectiveFamily ]?.glow || '',
		...( alpha ? { '--holo-mask': `url(${ url })` } : {} ),
	};
	const wrapperProps = {
		...props.wrapperProps,
		'data-holo-variant': variant,
		'data-holo-window': holo.window ? '1' : undefined,
		'data-holo-preview': preview ? '1' : undefined,
		style,
	};
	return (
		<BlockListBlock
			{ ...props }
			className={ className }
			wrapperProps={ wrapperProps }
		/>
	);
};

const withHoloWrapper = createHigherOrderComponent( ( BlockListBlock ) => {
	return ( props ) => {
		if ( props.name !== 'core/image' ) {
			return <BlockListBlock { ...props } />;
		}
		return <HoloWrapper BlockListBlock={ BlockListBlock } { ...props } />;
	};
}, 'withHoloWrapper' );

addFilter(
	'editor.BlockListBlock',
	'holo-image-styles/wrapper',
	withHoloWrapper
);
