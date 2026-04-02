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
		require('daisyui'),
		addDynamicIconSelectors({
			prefix: 'iconify'
		})
	],

	daisyui: {
		prefix: 'daisy-',
		themes: [
			{
				mytheme: {
					primary: '#3C64B1', // darkish blue
					secondary: '#60a5fa', // lighterblue
					accent: '#F0ABFC', // pink
					neutral: '#D0D1CD', // beige-light
					'base-100': '#EFF0EB', // beige-lighter
					info: '#3b82f6', // info blue
					success: '#0fb40b', // green
					warning: '#fdba74', // yellow
					error: '#f87171' // red
				}
			}
		]
	}
};

module.exports = config;
