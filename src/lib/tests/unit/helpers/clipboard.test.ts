import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard, readFromClipboard } from '$lib/utils/helpers/clipboard';

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: vi.fn(() => false) }
}));

vi.mock('@capacitor/clipboard', () => ({
	Clipboard: {
		write: vi.fn(),
		read: vi.fn()
	}
}));

describe('clipboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('copyToClipboard', () => {
		it('should copy using navigator.clipboard when available', async () => {
			const mockWriteText = vi.fn().mockResolvedValue(undefined);
			Object.defineProperty(navigator, 'clipboard', {
				value: { writeText: mockWriteText },
				configurable: true
			});

			const result = await copyToClipboard('test text');
			expect(result).toBe(true);
			expect(mockWriteText).toHaveBeenCalledWith('test text');
		});

		it('should return false when copy fails', async () => {
			Object.defineProperty(navigator, 'clipboard', {
				value: {
					writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied'))
				},
				configurable: true
			});
			document.execCommand = vi.fn().mockReturnValue(false);

			const result = await copyToClipboard('test');
			expect(result).toBe(false);
		});

		it('uses the textarea fallback when the clipboard API rejects', async () => {
			Object.defineProperty(navigator, 'clipboard', {
				value: {
					writeText: vi.fn().mockRejectedValue(new Error('Clipboard denied'))
				},
				configurable: true
			});
			document.execCommand = vi.fn().mockReturnValue(true);

			const result = await copyToClipboard('tb1qaddress');
			expect(result).toBe(true);
			expect(document.execCommand).toHaveBeenCalledWith('copy');
		});

		it('should use execCommand fallback when clipboard API unavailable', async () => {
			Object.defineProperty(navigator, 'clipboard', {
				value: undefined,
				configurable: true
			});

			const execCommand = vi.fn().mockReturnValue(true);
			document.execCommand = execCommand;

			const result = await copyToClipboard('fallback text');
			expect(result).toBe(true);
			expect(execCommand).toHaveBeenCalledWith('copy');
		});
	});

	describe('readFromClipboard', () => {
		it('should read using navigator.clipboard when available', async () => {
			const mockReadText = vi.fn().mockResolvedValue('read value');
			Object.defineProperty(navigator, 'clipboard', {
				value: { readText: mockReadText },
				configurable: true
			});

			const result = await readFromClipboard();
			expect(result).toBe('read value');
			expect(mockReadText).toHaveBeenCalled();
		});

		it('should return null when clipboard unavailable', async () => {
			Object.defineProperty(navigator, 'clipboard', {
				value: undefined,
				configurable: true
			});

			const result = await readFromClipboard();
			expect(result).toBeNull();
		});

		it('should return null when read fails', async () => {
			Object.defineProperty(navigator, 'clipboard', {
				value: {
					readText: vi.fn().mockRejectedValue(new Error('Permission denied'))
				},
				configurable: true
			});

			const result = await readFromClipboard();
			expect(result).toBeNull();
		});
	});
});
