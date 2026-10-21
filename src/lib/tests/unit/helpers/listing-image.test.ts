import { describe, expect, it } from 'vitest';
import { listingImage } from '$lib/utils/helpers/listing-image';

describe('listing image', () => {
	it('uses the first photo and skips videos and bare text', () => {
		expect(
			listingImage([
				{ url: 'https://cdn.example/clip.mp4' },
				{ url: 'https://cdn.example/room.jpg' }
			])
		).toBe('https://cdn.example/room.jpg');
		expect(listingImage([{ url: 'notaurl' }])).toBe('');
		expect(listingImage(undefined)).toBe('');
	});
});
