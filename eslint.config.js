const wp = require( '@wordpress/scripts/config/eslint.config.cjs' );
const globals = require( 'globals' );

module.exports = [
	...wp,
	{
		files: [ 'src/**/*.js' ],
		languageOptions: { globals: { ...globals.browser, holoImageStyles: 'readonly' } },
		rules: {
			// ToggleGroupControl is still exported under the experimental name in @wordpress/components.
			'@wordpress/no-unsafe-wp-apis': 'off',
		},
	},
	{
		files: [ 'bin/**/*.mjs', 'tests/**/*.mjs' ],
		languageOptions: { globals: { ...globals.node, ...globals.browser } },
	},
	{ ignores: [ 'build/**', 'dist/**', 'vendor/**', 'wordpress/**' ] },
];
