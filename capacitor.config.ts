import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	zoomEnabled: false,
	appId: 'com.bittasker.app',
	appName: 'BitTasker',
	webDir: 'build',
	server: {
		url: process.env.VITE_CLIENT_URL,
		cleartext: true,
		androidScheme: 'https',
	},
	plugins: {
		StatusBar: {
			overlaysWebView: true,
			style: 'DEFAULT',
			backgroundColor: '#00000000'
		},
		SocialLogin: {
			google: {
				clientId: process.env.VITE_GOOGLE_CLIENT_ID,
				serverClientId: process.env.VITE_GOOGLE_CLIENT_ID,
				redirectUrl: process.env.VITE_GOOGLE_REDIRECT_URI,
				scopes: ['profile', 'email'],
				responseType: 'token'
			}
		}
	}
};

export default config;
