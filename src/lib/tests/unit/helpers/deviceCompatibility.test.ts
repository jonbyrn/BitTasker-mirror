import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

// Must be imported after $app/environment mock
const {
	detectOS,
	detectBrowser,
	detectDeviceType,
	requiresHTTPS,
	isWebAuthnSupported
} = await import('$lib/utils/helpers/deviceCompatibility');

describe('deviceCompatibility', () => {
	const originalUserAgent = navigator.userAgent;
	const originalPlatform = navigator.platform;

	beforeEach(() => {
		Object.defineProperty(navigator, 'userAgent', {
			value: originalUserAgent,
			configurable: true
		});
		Object.defineProperty(navigator, 'platform', {
			value: originalPlatform,
			configurable: true
		});
	});

	describe('detectOS', () => {
		it('should detect iOS from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
				configurable: true
			});
			expect(detectOS()).toBe('ios');
		});

		it('should detect Android from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (Linux; Android 10)',
				configurable: true
			});
			expect(detectOS()).toBe('android');
		});

		it('should detect Windows from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
				configurable: true
			});
			expect(detectOS()).toBe('windows');
		});

		it('should detect macOS from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
				configurable: true
			});
			expect(detectOS()).toBe('macos');
		});

		it('should detect Linux from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (X11; Linux x86_64)',
				configurable: true
			});
			expect(detectOS()).toBe('linux');
		});
	});

	describe('detectBrowser', () => {
		it('should detect Chrome from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/91.0',
				configurable: true
			});
			expect(detectBrowser()).toBe('chrome');
		});

		it('should detect Firefox from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0',
				configurable: true
			});
			expect(detectBrowser()).toBe('firefox');
		});

		it('should detect Edge from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/91.0 Edg/91.0',
				configurable: true
			});
			expect(detectBrowser()).toBe('edge');
		});
	});

	describe('detectDeviceType', () => {
		it('should detect mobile from user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
				configurable: true
			});
			expect(detectDeviceType()).toBe('mobile');
		});

		it('should detect desktop from desktop user agent', () => {
			Object.defineProperty(navigator, 'userAgent', {
				value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				configurable: true
			});
			expect(detectDeviceType()).toBe('desktop');
		});
	});

	describe('requiresHTTPS', () => {
		it('should return boolean (https/localhost => false, else true)', () => {
			const result = requiresHTTPS();
			expect(typeof result).toBe('boolean');
			// In jsdom, location is typically http://localhost, so requiresHTTPS returns false
			expect(result).toBe(false);
		});
	});

	describe('isWebAuthnSupported', () => {
		it('should return boolean', () => {
			const result = isWebAuthnSupported();
			expect(typeof result).toBe('boolean');
		});
	});
});
