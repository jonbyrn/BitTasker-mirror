import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.bittasker.app',
	appName: 'bittasker',
	webDir: 'build',
	plugins: {
		StatusBar: {
			overlaysWebView: false,
			backgroundColor: '#ffffff'
		}
	}
};

export default config;
