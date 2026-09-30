const { addDynamicIconSelectors } = require('@iconify/tailwind');

/** @type {import('tailwindcss').Config}*/
const config = {
	content: ['./src/**/*.{html,js,svelte,ts}', './src/app.html'],

	theme: {
		extend: {
			gridTemplateColumns: {
				'2-maxcontent': 'repeat(2, max-content)'
			},
			aspectRatio: {
				'9/16': '9 / 16'
			}
		}
	},

	plugins: [
		require('@tailwindcss/typography'),
		addDynamicIconSelectors({
			prefix: 'iconify'
		})
	]
};

module.exports = config;
