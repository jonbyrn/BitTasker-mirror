import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import daisyui from 'daisyui';

const config = {
	content: ['./src/**/*.{html,js,svelte,ts}', './**/*.{ts,js}'],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Inter var', ...defaultTheme.fontFamily.sans]
			}
		}
	},
	plugins: [daisyui],
	daisyui: {
		themes: ['dark'],
		darkTheme: 'dark'
	}
} as Config & {
	daisyui: {
		themes: string[];
		darkTheme: string;
	};
};

export default config;
