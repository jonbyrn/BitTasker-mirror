import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
import { loadEnv } from 'vite';

// Load environment variables
const env = loadEnv('', process.cwd(), '');

const config: CapacitorConfig = {
	zoomEnabled: false,
	appId: env.VITE_APP_ID || 'com.bittasker.app',
	appName: env.VITE_APP_NAME || 'BitTasker',
	webDir: 'build',
	server: {
		// Load server URL from environment variable, fallback to dev URL
		url: env.VITE_CLIENT_URL || 'https://bittasker.com',
		cleartext: true,
		androidScheme: 'https',
	},
	android: {
		allowMixedContent: true,
		webContentsDebuggingEnabled: true
	},
	ios: {
		scheme: 'BitTasker'
	},
	plugins: {
		StatusBar: {
			overlaysWebView: false,
			style: 'DEFAULT',
			backgroundColor: '#00000000'
		},
		Keyboard: {
			resize: KeyboardResize.Body,
			style: KeyboardStyle.Dark,
			resizeOnFullScreen: true
		},
		SplashScreen: {
			androidSplashResourceName: 'splash',
			androidScaleType: 'FIT_CENTER'
		},
		PushNotifications: {
			presentationOptions: ['badge', 'sound', 'alert']
		}
		/* SocialLogin: {
			google: {
				clientId: env.VITE_GOOGLE_CLIENT_ID,
				serverClientId: env.VITE_GOOGLE_CLIENT_ID,
				redirectUrl: env.VITE_GOOGLE_REDIRECT_URI,
				scopes: ['profile', 'email'],
				responseType: 'token'
			}
		}, */
	}
};

export default config;
