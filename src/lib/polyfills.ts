/**
 * Browser polyfills for Node.js modules
 * Import this file in components that use bitcoinjs-lib or other Node.js libraries
 */

import { Buffer } from 'buffer';

// Polyfill Buffer for browser environment - ensure it's available globally
if (typeof globalThis !== 'undefined') {
	if (!globalThis.Buffer) {
		globalThis.Buffer = Buffer;
	}
	// Also set on global for older Node.js compatibility
	if (typeof global !== 'undefined' && !global.Buffer) {
		(global as any).Buffer = Buffer;
	}
}

if (typeof window !== 'undefined' && !window.Buffer) {
	(window as any).Buffer = Buffer;
}

// Ensure Buffer is available in the current context
if (typeof Buffer === 'undefined') {
	(globalThis as any).Buffer = Buffer;
}

// Create a basic process polyfill for browser environment
const processPolyfill = {
	env: {},
	browser: true,
	version: '',
	versions: { node: '' },
	nextTick: (fn: Function) => setTimeout(fn, 0)
};

// Polyfill process for browser environment
if (typeof globalThis !== 'undefined' && !globalThis.process) {
	(globalThis as any).process = processPolyfill;
}

if (typeof window !== 'undefined' && !(window as any).process) {
	(window as any).process = processPolyfill;
}

// Export for direct imports
export { Buffer };
