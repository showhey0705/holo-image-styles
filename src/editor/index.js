/**
 * Holo Image Styles — editor integration (SPEC §6).
 *
 * 1. Adds the `holo` attribute to core/image (same defaults as the server).
 * 2. "Holo effect" inspector panel, shown only while an is-style-holo-* style is active.
 * 3. Passes data-holo-variant + CSS variables to the block wrapper so editor.css can draw
 *    the simplified two-layer preview.
 */
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls } from '@wordpress/block-editor';
import {
	PanelBody,
	SelectControl,
	RangeControl,
	ToggleControl,
	Notice,
	ExternalLink,
	__experimentalToggleGroupControl as ToggleGroupControl,
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
} from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

const DATA = window.holoImageStyles || {
	edition: 'free',
	families: {},
	variants: {},
	defaults: {},
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

const familyFromClass = ( className = '' ) => {
	const m = /\bis-style-holo-([a-z]+)\b/.exec( className || '' );
	return m && DATA.families[ m[ 1 ] ] ? m[ 1 ] : '';
};

const variantsFor = ( family ) =>
	Object.entries( DATA.variants )
		.filter( ( [ , v ] ) => v.family === family )
		.map( ( [ key, v ] ) => ( { value: key, label: v.label } ) );

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

/* 2. Inspector panel */
const HoloPanel = ( { attributes, setAttributes } ) => {
	const family = familyFromClass( attributes.className );
	const holo = { ...DEFAULTS, ...( attributes.holo || {} ) };
	const update = ( patch ) =>
		setAttributes( { holo: { ...holo, ...patch } } );
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
			update( { variant: '' } );
			return;
		}
		if ( current && DATA.variants[ current ].family !== family ) {
			update( { variant: '' } );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ family ] );

	if ( ! family ) {
		return null;
	}

	const options = variantsFor( family );
	const familyDefault = DATA.families[ family ]?.default || '';

	return (
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
				<SelectControl
					label={ __( 'Effect', 'holo-image-styles' ) }
					value={ holo.variant || familyDefault }
					options={ options }
					onChange={ ( v ) =>
						update( { variant: v === familyDefault ? '' : v } )
					}
					__nextHasNoMarginBottom
					__next40pxDefaultSize
				/>
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
					onChange={ ( v ) => update( { tilt: ( v ?? 100 ) / 100 } ) }
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
			</PanelBody>
		</InspectorControls>
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

/* 3. Wrapper props for the editor preview */
const withHoloWrapper = createHigherOrderComponent( ( BlockListBlock ) => {
	return ( props ) => {
		if ( props.name !== 'core/image' ) {
			return <BlockListBlock { ...props } />;
		}
		const family = familyFromClass( props.attributes.className );
		if ( ! family ) {
			return <BlockListBlock { ...props } />;
		}
		const holo = { ...DEFAULTS, ...( props.attributes.holo || {} ) };
		const variant =
			holo.variant && DATA.variants[ holo.variant ]
				? holo.variant
				: DATA.families[ family ]?.default || '';
		const style = {
			...( props.wrapperProps?.style || {} ),
			'--holo-intensity': String( holo.intensity ),
			'--holo-glow': DATA.families[ family ]?.glow || '',
		};
		const wrapperProps = {
			...props.wrapperProps,
			'data-holo-variant': variant,
			'data-holo-window': holo.window ? '1' : undefined,
			style,
		};
		return <BlockListBlock { ...props } wrapperProps={ wrapperProps } />;
	};
}, 'withHoloWrapper' );

addFilter(
	'editor.BlockListBlock',
	'holo-image-styles/wrapper',
	withHoloWrapper
);
