import type { CapacitorConfig } from '@capacitor/cli';
import { loadEnv } from 'vite';

// Load environment variables
const env = loadEnv('', process.cwd(), '');

const config: CapacitorConfig = {
	zoomEnabled: false,
	appId: 'com.bittasker.app',
	appName: 'BitTasker',
	webDir: 'build',
	server: {
		// Load server URL from environment variable, fallback to dev URL
		url: env.VITE_CLIENT_URL || 'https://master.bittasker.com',
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
		SocialLogin: {
			google: {
				clientId: env.VITE_GOOGLE_CLIENT_ID,
				serverClientId: env.VITE_GOOGLE_CLIENT_ID,
				redirectUrl: env.VITE_GOOGLE_REDIRECT_URI,
				scopes: ['profile', 'email'],
				responseType: 'token'
			}
		},
		Keyboard: {
			resize: 'body',
			style: 'DARK',
			resizeOnFullScreen: true
		},
		SplashScreen: {
			androidSplashResourceName: 'splash',
			androidScaleType: 'CENTER',
		},
		PushNotifications: {
			presentationOptions: ['badge', 'sound', 'alert']
		}
	}
};

export default config;
