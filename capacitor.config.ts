/// <reference types="@capawesome/capacitor-android-edge-to-edge-support" />
import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
import { loadEnv } from 'vite';

// Load environment variables
const env = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '');

// VITE_CLIENT_URL is used by the web build for SEO/meta tags and notification click actions.
// For native Capacitor builds we IGNORE it — the WebView serves bundled files from webDir
// and uses server.hostname to set the virtual origin (required for passkeys).
// If VITE_CLIENT_URL were used here, the WebView would load content from a remote server
// instead of the bundled assets, making the native app a clone of the website.
const enableDebugWebView = env.CAPACITOR_DEBUG_WEBVIEW === 'true';

const config: CapacitorConfig = {
	zoomEnabled: false,
	appId: env.VITE_APP_ID || 'com.bittasker.app',
	appName: env.VITE_APP_NAME || 'BitTasker',
	webDir: 'build',
	// Server config controls how the WebView loads content:
	//
	// Production & debug builds (always):
	//   - server.hostname sets the VIRTUAL origin of the WebView. It does NOT load content
	//     from bittasker.com over the internet -- the app still serves local files from webDir.
	//     It only changes what window.location.hostname reports (from "localhost" to "bittasker.com").
	//   - This is required for passkeys: Android Credential Manager fetches assetlinks.json from
	//     the rpId domain (window.location.hostname) to validate the app-to-domain association.
	//   - It also makes getClientOrigin() return the correct domain via window.location.origin.
	//
	// To enable live-reload during development, set CAPACITOR_LIVE_RELOAD_URL instead.
	server: env.CAPACITOR_LIVE_RELOAD_URL
		? {
				url: env.CAPACITOR_LIVE_RELOAD_URL,
				cleartext: env.CAPACITOR_LIVE_RELOAD_URL.startsWith('http://'),
				androidScheme: env.CAPACITOR_LIVE_RELOAD_URL.startsWith('http://') ? 'http' : 'https'
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
			// 'None' prevents the WebView from resizing when the keyboard appears.
			// We handle layout changes manually via VisualViewport API in keyboard.ts.
			// This eliminates the dual-resize problem (KeyboardResize.Body + dvh units)
			// and gives us full control over animation timing and scroll behavior.
			resize: KeyboardResize.None,
			style: KeyboardStyle.Default,
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
