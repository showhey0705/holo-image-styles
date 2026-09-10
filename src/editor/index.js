/**
 * Holo Image Styles — editor integration (SPEC §6, v1.2 picker UI).
 *
 * 1. Adds the `holo` attribute to core/image (same defaults as the server).
 * 2. "Holo effect" controls: every effect of this edition as a static thumbnail, grouped by family.
 *    Choosing one sets the block style (is-style-holo-{family}) AND holo.variant in one click.
 *    Shown in the inspector and in a toolbar popover for every Image block.
 * 3. Hovering a thumbnail previews that effect on the canvas (CSS-only preview, no cost).
 * 4. ⇧⌥⌘H opens/closes the popover for the selected Image block; ← → pick, Enter commits, Esc reverts,
 *    ⇧⌘⌫ removes the effect.
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
	Dropdown,
	ToolbarGroup,
	ToolbarButton,
	SVG,
	Path,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
} from '@wordpress/components';
import { useEffect, useState, useCallback, useRef } from '@wordpress/element';
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
const VariantPicker = ( { value, onChange, clientId, columns = 3 } ) => {
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
			style={ { '--holo-picker-columns': columns } }
			onMouseLeave={ clear }
			onKeyDown={ onKeyDown }
		>
			{ FAMILY_ORDER.map( ( family ) => {
				const keys = ALL_VARIANTS.filter(
					( k ) => DATA.variants[ k ].family === family
				);
				if ( ! keys.length ) {
					return null;
				}
				return (
					<div className="holo-picker__family" key={ family }>
						<div className="holo-picker__family-head">
							<span>{ DATA.families[ family ].label }</span>
							<span className="holo-picker__count">
								{ keys.length }
							</span>
						</div>
						<div className="holo-picker__grid">
							{ keys.map( ( key ) => {
								const checked = key === value;
								const focusable =
									checked ||
									( ! value && key === ALL_VARIANTS[ 0 ] );
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
										onClick={ () => onChange( key ) }
										onMouseEnter={ () =>
											setPreview( clientId, key )
										}
										onFocus={ () =>
											setPreview( clientId, key )
										}
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
					</div>
				);
			} ) }
		</div>
	);
};

/* 2b. All controls (shared by the inspector panel and the toolbar popover) */
const HoloControls = ( { attributes, setAttributes, clientId, compact } ) => {
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
				columns={ compact ? 4 : 3 }
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
							'Plays a short 4-second sweep once when the image scrolls into view.',
							'holo-image-styles'
						) }
						checked={ !! holo.showcase }
						onChange={ ( v ) => update( { showcase: !! v } ) }
						__nextHasNoMarginBottom
					/>
					<ToggleControl
						label={ __( 'Card window', 'holo-image-styles' ) }
						help={ __(
							'Limit the shine to the illustration window of a card-shaped image.',
							'holo-image-styles'
						) }
						checked={ !! holo.window }
						onChange={ ( v ) => update( { window: !! v } ) }
						__nextHasNoMarginBottom
					/>
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
			keyCombination: { modifier: 'secondary', character: 'h' }, // ⇧⌥⌘H — ⇧⌘H is core's "toggle block visibility" since WP 7.x, ⌥⌘H is macOS "Hide Others".,
		} );
	}, [ registerShortcut ] );
};

const HoloPanel = ( props ) => {
	const { attributes, setAttributes, isSelected } = props;
	const family = familyFromClass( attributes.className );
	const holo = { ...DEFAULTS, ...( attributes.holo || {} ) };
	const [ fallbackNotice, setFallbackNotice ] = useState( '' );
	const [ isOpen, setOpen ] = useState( false );
	const snapshot = useRef( null );
	useRegisterShortcut();

	const openPicker = () => {
		snapshot.current = {
			className: attributes.className,
			holo: attributes.holo,
		};
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
		setOpen( true );
	};
	const closePicker = ( revert ) => {
		if ( revert && snapshot.current ) {
			setAttributes( snapshot.current );
		}
		snapshot.current = null;
		setOpen( false );
	};

	useShortcut( SHORTCUT_NAME, ( e ) => {
		if ( ! isSelected || ! attributes.url ) {
			return;
		}
		e.preventDefault();
		if ( isOpen ) {
			closePicker( false );
		} else {
			openPicker();
		}
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

	const onPopoverKeyDown = ( e ) => {
		if ( e.key === 'Escape' ) {
			e.stopPropagation();
			closePicker( true );
		} else if ( e.key === 'Enter' ) {
			e.preventDefault();
			closePicker( false );
		} else if (
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
				<ToolbarGroup>
					<Dropdown
						open={ isOpen }
						onToggle={ ( willOpen ) =>
							willOpen ? openPicker() : closePicker( false )
						}
						popoverProps={ {
							placement: 'bottom-start',
							offset: 8,
						} }
						contentClassName="holo-popover"
						renderToggle={ ( { onToggle } ) => (
							<ToolbarButton
								icon={ <HoloIcon /> }
								label={ __(
									'Holo effect',
									'holo-image-styles'
								) }
								shortcut="⇧⌥⌘H"
								onClick={ onToggle }
								aria-expanded={ isOpen }
								isPressed={ isOpen || !! family }
							>
								{ __( 'Holo effect', 'holo-image-styles' ) }
							</ToolbarButton>
						) }
						renderContent={ () => (
							// eslint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard handling for the popover as a whole.
							<div
								className="holo-popover__inner"
								onKeyDown={ onPopoverKeyDown }
							>
								<HoloControls { ...props } compact />
								<p className="holo-popover__hint">
									{ __(
										'← → choose · Enter apply · Esc cancel · ⇧⌘⌫ remove',
										'holo-image-styles'
									) }
								</p>
							</div>
						) }
					/>
				</ToolbarGroup>
			</BlockControls>
			<InspectorControls>
				<PanelBody
					title={ __( 'Holo effect', 'holo-image-styles' ) }
					initialOpen={ !! family }
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
					<HoloControls { ...props } />
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
	const style = {
		...( props.wrapperProps?.style || {} ),
		'--holo-intensity': String( holo.intensity ),
		'--holo-glow': DATA.families[ effectiveFamily ]?.glow || '',
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
