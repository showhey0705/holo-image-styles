/**
 * Holo Image Styles — editor integration (SPEC §6, v1.1 picker UI).
 *
 * 1. Adds the `holo` attribute to core/image (same defaults as the server).
 * 2. "Holo effect" controls: a thumbnail grid of the family's effects (static WebP rendered from the
 *    real front-end CSS at build time), presets, and advanced sliders. Shown in the inspector and in a
 *    toolbar popover, only while an is-style-holo-* style is active.
 * 3. Hovering a thumbnail previews that effect on the canvas (CSS-only preview, no cost).
 * 4. Passes data-holo-variant + CSS variables to the block wrapper so editor.css can draw the preview.
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
import { useEffect, useState, useCallback } from '@wordpress/element';
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
	showcase: false,
	window: false,
	...( DATA.defaults || {} ),
};

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

const variantsFor = ( family ) =>
	Object.entries( DATA.variants )
		.filter( ( [ , v ] ) => v.family === family )
		.map( ( [ key, v ] ) => ( { value: key, label: v.label } ) );

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

/* 2a. Thumbnail grid (radio semantics) */
const VariantPicker = ( {
	family,
	value,
	onChange,
	clientId,
	columns = 3,
} ) => {
	const options = variantsFor( family );
	const current = value || DATA.families[ family ]?.default || '';
	const clear = useCallback( () => setPreview( clientId, '' ), [ clientId ] );
	useEffect( () => clear, [ clear ] );
	return (
		// eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the radios inside are the focusable elements.
		<div
			className="holo-picker"
			role="radiogroup"
			aria-label={ __( 'Effect', 'holo-image-styles' ) }
			style={ { '--holo-picker-columns': columns } }
			onMouseLeave={ clear }
		>
			{ options.map( ( opt ) => {
				const checked = opt.value === current;
				return (
					<button
						type="button"
						key={ opt.value }
						role="radio"
						aria-checked={ checked }
						className={
							'holo-picker__item' +
							( checked ? ' is-checked' : '' )
						}
						onClick={ () => onChange( opt.value ) }
						onMouseEnter={ () => setPreview( clientId, opt.value ) }
						onFocus={ () => setPreview( clientId, opt.value ) }
						onBlur={ clear }
					>
						<img
							src={ `${ DATA.thumbsUrl }${ opt.value }.webp` }
							alt=""
							width="160"
							height="224"
							loading="lazy"
							decoding="async"
							draggable="false"
						/>
						<span className="holo-picker__label">
							{ opt.label }
						</span>
					</button>
				);
			} ) }
		</div>
	);
};

/* 2b. All controls (shared by the inspector panel and the toolbar popover) */
const HoloControls = ( { attributes, setAttributes, clientId, compact } ) => {
	const family = familyFromClass( attributes.className );
	const holo = { ...DEFAULTS, ...( attributes.holo || {} ) };
	const update = ( patch ) =>
		setAttributes( { holo: { ...holo, ...patch } } );
	const familyDefault = DATA.families[ family ]?.default || '';
	const [ advanced, setAdvanced ] = useState( presetOf( holo ) === 'custom' );
	const preset = presetOf( holo );

	return (
		<>
			<VariantPicker
				family={ family }
				value={ holo.variant }
				clientId={ clientId }
				columns={ compact ? 4 : 3 }
				onChange={ ( v ) =>
					update( { variant: v === familyDefault ? '' : v } )
				}
			/>
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
			{ advanced && (
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

/* 2c. Inspector panel + toolbar popover */
const HoloPanel = ( props ) => {
	const { attributes, setAttributes } = props;
	const family = familyFromClass( attributes.className );
	const holo = { ...DEFAULTS, ...( attributes.holo || {} ) };
	const [ fallbackNotice, setFallbackNotice ] = useState( '' );

	// Family changed (className) or a variant that this edition doesn't have → reset to the family default.
	useEffect( () => {
		if ( ! family ) {
			return;
		}
		const current = holo.variant;
		if ( current && ! DATA.variants[ current ] ) {
			// Stored value from another edition (SPEC §7.4): keep the default, tell the user once.
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

	if ( ! family ) {
		return null;
	}

	return (
		<>
			<BlockControls group="other">
				<ToolbarGroup>
					<Dropdown
						popoverProps={ {
							placement: 'bottom-start',
							offset: 8,
						} }
						contentClassName="holo-popover"
						renderToggle={ ( { isOpen, onToggle } ) => (
							<ToolbarButton
								icon={ <HoloIcon /> }
								label={ __(
									'Holo effect',
									'holo-image-styles'
								) }
								onClick={ onToggle }
								aria-expanded={ isOpen }
								isPressed={ isOpen }
							>
								{ __( 'Holo effect', 'holo-image-styles' ) }
							</ToolbarButton>
						) }
						renderContent={ () => (
							<div className="holo-popover__inner">
								<HoloControls { ...props } compact />
							</div>
						) }
					/>
				</ToolbarGroup>
			</BlockControls>
			<InspectorControls>
				<PanelBody
					title={ __( 'Holo effect', 'holo-image-styles' ) }
					initialOpen
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

/* 3./4. Wrapper props for the editor preview (hover preview wins over the saved value) */
const HoloWrapper = ( { BlockListBlock, ...props } ) => {
	const family = familyFromClass( props.attributes.className );
	const preview = usePreview( props.clientId );
	if ( ! family ) {
		return <BlockListBlock { ...props } />;
	}
	const holo = { ...DEFAULTS, ...( props.attributes.holo || {} ) };
	const saved =
		holo.variant && DATA.variants[ holo.variant ]
			? holo.variant
			: DATA.families[ family ]?.default || '';
	const variant = preview && DATA.variants[ preview ] ? preview : saved;
	const style = {
		...( props.wrapperProps?.style || {} ),
		'--holo-intensity': String( holo.intensity ),
		'--holo-glow': DATA.families[ family ]?.glow || '',
	};
	const wrapperProps = {
		...props.wrapperProps,
		'data-holo-variant': variant,
		'data-holo-window': holo.window ? '1' : undefined,
		'data-holo-preview': preview ? '1' : undefined,
		style,
	};
	return <BlockListBlock { ...props } wrapperProps={ wrapperProps } />;
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
