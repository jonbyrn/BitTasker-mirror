import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';

/**
 * Copy text to clipboard with fallback for web and native platforms
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (Capacitor.isNativePlatform()) {
            // Use Capacitor Clipboard for native platforms
            await Clipboard.write({ string: text });
            return true;
        } else {
            // Use Web API for web platform
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                const success = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                return success;
            }
        }
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
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
