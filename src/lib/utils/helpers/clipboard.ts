import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';

/**
 * Copy while the click is still active. The async clipboard API drops the
 * gesture when it rejects, and then a later fallback writes nothing.
 */
function copyWithCommand(text: string): boolean {
	if (typeof document === 'undefined') return false;
	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.left = '-9999px';
	document.body.appendChild(area);
	area.focus();
	area.select();
	let copied = false;
	try {
		copied = document.execCommand('copy');
	} catch {
		copied = false;
	}
	document.body.removeChild(area);
	return copied;
}

/**
 * Copy text to clipboard with fallback for web and native platforms
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	if (!text) return false;
	try {
		if (Capacitor.isNativePlatform()) {
			await Clipboard.write({ string: text });
			return true;
		}
		const commandCopied = copyWithCommand(text);
		if (navigator.clipboard && navigator.clipboard.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch (error) {
				console.error('Failed to copy to clipboard:', error);
			}
		}
		return commandCopied;
	} catch (error) {
		console.error('Failed to copy to clipboard:', error);
		return copyWithCommand(text);
	}
}

/**
 * Read text from clipboard with fallback for web and native platforms
 */
export async function readFromClipboard(): Promise<string | null> {
	try {
		if (Capacitor.isNativePlatform()) {
			// Use Capacitor Clipboard for native platforms
			const result = await Clipboard.read();
			return result.value || null;
		} else {
			// Use Web API for web platform
			if (navigator.clipboard && navigator.clipboard.readText) {
				const text = await navigator.clipboard.readText();
				return text || null;
			} else {
				// No fallback for reading clipboard in older browsers
				console.warn('Clipboard read not supported in this browser');
				return null;
			}
		}
	} catch (error) {
		console.error('Failed to read from clipboard:', error);
		return null;
	}
}
