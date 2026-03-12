import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
import { loadEnv } from 'vite';

// Load environment variables
const env = loadEnv('', process.cwd(), '');

// Only use server URL for live reload (when VITE_CLIENT_URL is explicitly set)
// For production builds, omit server config to use bundled webDir
const serverUrl = process.env.VITE_CLIENT_URL || env.VITE_CLIENT_URL;
const serverScheme = serverUrl?.startsWith('http://') ? 'http' : 'https';
const enableDebugWebView = process.env.CAPACITOR_DEBUG_WEBVIEW === 'true';

const config: CapacitorConfig = {
	zoomEnabled: false,
	appId: env.VITE_APP_ID || 'com.bittasker.app',
	appName: env.VITE_APP_NAME || 'BitTasker',
	webDir: 'build',
	// Only set server config if VITE_CLIENT_URL is provided (for live reload)
	// Otherwise, the app will use the bundled webDir (production mode)
	...(serverUrl
		? {
				server: {
					// Load server URL from environment variable for live reload
					// Example: `VITE_CLIENT_URL=http://192.168.1.50:3000 npm run android`
					url: serverUrl,
					cleartext: true,
					// IMPORTANT: for Android live reload over LAN/USB with HTTP, the dev URL will be http://...
					// Use the scheme that matches the configured server URL to avoid forcing the wrong one.
					androidScheme: serverScheme
				}
			}
		: {}),
	android: {
		allowMixedContent: enableDebugWebView,
		webContentsDebuggingEnabled: enableDebugWebView
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
			launchAutoHide: false,
			launchShowDuration: 0,
			backgroundColor: '#FF9315',
			showSpinner: true,
			spinnerColor: '#FFFFFF',
			androidSplashResourceName: 'splash',
			androidScaleType: 'FIT_CENTER',
			iosSpinnerStyle: 'small',
			iosSpinnerColor: '#FFFFFF'
		},
		PushNotifications: {
			presentationOptions: ['badge', 'sound' /* , 'alert' */]
		}
	}
};

export default config;
