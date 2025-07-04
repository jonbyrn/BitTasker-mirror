import { StatusBar, Style } from '@capacitor/status-bar';
import { Device } from '@capacitor/device';

let isCapacitor: boolean | null = null;

async function checkPlatform() {
	if (isCapacitor !== null) return isCapacitor;
	const info = await Device.getInfo();
	isCapacitor = info.platform !== 'web';
	return isCapacitor;
}

export async function initializeStatusBar() {
	try {
		if (await checkPlatform()) {
			await StatusBar.setOverlaysWebView({ overlay: false });
			await StatusBar.setBackgroundColor({ color: '#00000000' });
			await StatusBar.setStyle({ style: Style.Default });
		}
	} catch (err) {
		console.error('Error initializing StatusBar', err);
	}
}

export async function setStatusBarStyleDark() {
	try {
		if (await checkPlatform()) {
			await StatusBar.setStyle({ style: Style.Dark });
		}
	} catch (err) {
		console.error('Error setting dark style', err);
	}
}

export async function setStatusBarStyleLight() {
	try {
		if (await checkPlatform()) {
			await StatusBar.setStyle({ style: Style.Light });
		}
	} catch (err) {
		console.error('Error setting light style', err);
	}
}

export async function hideStatusBar() {
	try {
		if (await checkPlatform()) {
			await StatusBar.hide();
		}
	} catch (err) {
		console.error('Error hiding status bar', err);
	}
}

export async function showStatusBar() {
	try {
		if (await checkPlatform()) {
			await StatusBar.show();
		}
	} catch (err) {
		console.error('Error showing status bar', err);
	}
}
