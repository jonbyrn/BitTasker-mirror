/// <reference types="@capawesome/capacitor-android-edge-to-edge-support" />
import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
import { loadEnv } from 'vite';

// Load environment variables
const env = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '');

// Only use server URL for live reload (when VITE_CLIENT_URL is explicitly set)
// For production builds, omit server config to use bundled webDir
const serverUrl = env.VITE_CLIENT_URL;
const serverScheme = serverUrl?.startsWith('http://') ? 'http' : 'https';
const enableDebugWebView = env.CAPACITOR_DEBUG_WEBVIEW === 'true';

const config: CapacitorConfig = {
	zoomEnabled: false,
	appId: env.VITE_APP_ID || 'com.bittasker.app',
	appName: env.VITE_APP_NAME || 'BitTasker',
	webDir: 'build',
	// Server config controls how the WebView loads content:
	//
	// With VITE_CLIENT_URL (live reload):
	//   - server.url makes the WebView fetch pages from a REMOTE server over the network.
	//   - cleartext: true allows plain HTTP (needed for dev server http://ip:port).
	//   - Passkeys will NOT work in this mode (rpId would be a LAN IP, not a real domain).
	//
	// Without VITE_CLIENT_URL (debug & production builds):
	//   - server.hostname sets the VIRTUAL origin of the WebView. It does NOT load content
	//     from bittasker.com over the internet -- the app still serves local files from webDir.
	//     It only changes what window.location.hostname reports (from "localhost" to "bittasker.com").
	//   - This is required for passkeys: Android Credential Manager fetches assetlinks.json from
	//     the rpId domain (window.location.hostname) to validate the app-to-domain association.
	//   - cleartext is omitted because no real network requests are made; content is local.
	server: serverUrl
		? {
				url: serverUrl,
				cleartext: serverScheme === 'http' ? true : false,
				// Use the scheme that matches the configured server URL to avoid forcing the wrong one.
				androidScheme: serverScheme
			}
		: {
				hostname: env.VITE_CLIENT_HOSTNAME || 'bittasker.com',
				androidScheme: 'https'
			},
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
		SystemBars: {
			// Disabled per @capawesome/capacitor-android-edge-to-edge-support docs —
			// the plugin manages insets and safe-area CSS variables directly.
			insetsHandling: 'disable',
			style: 'DEFAULT',
			hidden: false
		},
		Keyboard: {
			// iOS: 'Body' resizes the <body> element when keyboard appears, which is more
			// reliable than 'Native' (which has known bugs) or 'None' (requires manual handling).
			// Android: resize option is ignored; use resizeOnFullScreen instead.
			resize: KeyboardResize.Body,
			style: KeyboardStyle.Default,
			// Must be true to prevent keyboard from overlaying the WebView
			// when the app uses edge-to-edge display.
			resizeOnFullScreen: true
		},
		SplashScreen: {
			launchAutoHide: false,
			launchShowDuration: 3000,
			androidSplashResourceName: 'splash',
			androidScaleType: 'FIT_CENTER',
			iosSpinnerStyle: 'small',
			iosSpinnerColor: '#FFFFFF'
		},
		PushNotifications: {
			presentationOptions: ['badge', 'sound' /* , 'alert' */]
		},
		EdgeToEdge: {
			// @capawesome/capacitor-android-edge-to-edge-support
			// Sets the background color of the Android system navigation bar.
			// Uses WindowInsetsControllerCompat under the hood (required for SDK 35+).
			navigationBarColor: '#2d2d2d'
		},
		CapacitorHttp: {
			enabled: true
		}
	}
};

export default config;
