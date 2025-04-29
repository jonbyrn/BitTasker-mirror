import { describe, it, expect } from 'vitest';
import { bytesToBase64, base64ToBytes, bytesToHex, hexToBytes } from '$lib/utils/helpers/encoding';

describe('Encoding Utilities', () => {
	describe('bytesToBase64 and base64ToBytes', () => {
		it('should convert bytes to base64 and back', () => {
			const originalBytes = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]); // "Hello World"
			const base64String = bytesToBase64(originalBytes);

			expect(base64String).toBe('SGVsbG8gV29ybGQ=');

			const reconstructedBytes = base64ToBytes(base64String);
			expect(Array.from(reconstructedBytes)).toEqual(Array.from(originalBytes));
		});

		it('should handle empty array', () => {
			const emptyBytes = new Uint8Array(0);
			const base64String = bytesToBase64(emptyBytes);

			expect(base64String).toBe('');

			const reconstructedBytes = base64ToBytes(base64String);
			expect(reconstructedBytes.length).toBe(0);
		});

		it('should handle special characters', () => {
			const specialBytes = new Uint8Array([0, 255, 128, 64, 32]);
			const base64String = bytesToBase64(specialBytes);

			const reconstructedBytes = base64ToBytes(base64String);
			expect(Array.from(reconstructedBytes)).toEqual([0, 255, 128, 64, 32]);
		});
	});

	describe('bytesToHex and hexToBytes', () => {
		it('should convert bytes to hex and back', () => {
			const originalBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
			const hexString = bytesToHex(originalBytes);

			expect(hexString).toBe('48656c6c6f');

			const reconstructedBytes = hexToBytes(hexString);
			expect(Array.from(reconstructedBytes)).toEqual(Array.from(originalBytes));
		});

		it('should handle empty array', () => {
			const emptyBytes = new Uint8Array(0);
			const hexString = bytesToHex(emptyBytes);

			expect(hexString).toBe('');

			const reconstructedBytes = hexToBytes(hexString);
			expect(reconstructedBytes.length).toBe(0);
		});

		it('should handle zeros and max values', () => {
			const testBytes = new Uint8Array([0, 255, 0, 255]);
			const hexString = bytesToHex(testBytes);

			expect(hexString).toBe('00ff00ff');

			const reconstructedBytes = hexToBytes(hexString);
			expect(Array.from(reconstructedBytes)).toEqual([0, 255, 0, 255]);
		});
	});
});
