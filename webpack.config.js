/**
 * Two bundles from @wordpress/scripts (run with --experimental-modules):
 *  - build/editor.js  classic script (block filters + inspector panel)
 *  - build/view.js    ES module for the Interactivity API (imports @wordpress/interactivity)
 */
const defaultConfigs = require( '@wordpress/scripts/config/webpack.config' );

const [ scriptConfig, moduleConfig ] = Array.isArray( defaultConfigs )
	? defaultConfigs
	: [ defaultConfigs, null ];

if ( ! moduleConfig ) {
	throw new Error( 'Run wp-scripts with --experimental-modules (see package.json scripts).' );
}

module.exports = [
	{
		...scriptConfig,
		entry: { editor: './src/editor/index.js' },
	},
	{
		...moduleConfig,
		entry: { view: './src/view/index.js' },
	},
];
