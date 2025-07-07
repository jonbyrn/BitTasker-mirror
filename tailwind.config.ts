import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import daisyui from 'daisyui';

const config = {
	content: ['./src/**/*.{html,js,svelte,ts}', './**/*.{ts,js}'],
	safelist: [
		// Dynamic width classes for Drawer component
		'w-[10%]', 'w-[20%]', 'w-[30%]', 'w-[40%]', 'w-[50%]', 'w-[55%]', 'w-[60%]', 'w-[65%]', 'w-[70%]', 'w-[75%]', 'w-[80%]', 'w-[85%]', 'w-[90%]', 'w-[95%]', 'w-[100%]'
	],
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
			},
			keyframes: {
				'fade-in': {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				}
			},
			animation: {
				'fade-in': 'fade-in 0.5s ease-in-out'
			}
		}
	},
	plugins: [
		function ({ addUtilities }) {
			addUtilities({
				'.scrollbar-hide': {
					'-ms-overflow-style': 'none',
					'scrollbar-width': 'none',
					'&::-webkit-scrollbar': {
						display: 'none'
					}
				}
			});
		},
		daisyui
	],
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
