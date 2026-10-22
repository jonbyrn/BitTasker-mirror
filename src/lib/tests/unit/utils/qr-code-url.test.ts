import { describe, expect, it, vi } from 'vitest';

vi.mock('qrcode', () => ({
	default: {
		toDataURL: vi.fn(async () => 'data:image/png;base64,plainqr')
	}
}));

import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

describe('generateQrCodeUrl', () => {
	it('returns a QR image when the logo never loads', async () => {
		class HangingImage {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			width = 256;
			height = 256;
			naturalWidth = 256;
			naturalHeight = 256;
			set src(_value: string) {
				// SVG logos in this app often never fire load or error.
			}
		}
		vi.stubGlobal('Image', HangingImage);
		const canvas = {
			width: 0,
			height: 0,
			getContext: () => ({
				drawImage() {},
				beginPath() {},
				arc() {},
				fill() {},
				fillStyle: ''
			}),
			toDataURL: () => 'data:image/png;base64,withlogo'
		};
		vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			if (tag === 'canvas') return canvas as unknown as HTMLCanvasElement;
			return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
		});

		const url = await generateQrCodeUrl('https://example.com/npub/npub1example');
		expect(url).toBe('data:image/png;base64,plainqr');
		vi.restoreAllMocks();
	});
});
