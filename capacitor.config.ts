import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.bittasker.app',
	appName: 'bittasker',
	webDir: 'build',
	server: {
		url: process.env.VITE_APP_URL,
		cleartext: true
	},
	plugins: {
		StatusBar: {
			overlaysWebView: false,
			backgroundColor: '#ffffff'
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
