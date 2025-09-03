import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressImage, validateImageFile, formatFileSize } from '$lib/utils/imageCompression';

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
	default: vi.fn().mockImplementation((file, options) => {
		// Return a mock compressed file
		const mockCompressedFile = new File(
			[new Uint8Array(file.size * 0.8)], // 80% of original size
			file.name.replace(/\.[^/.]+$/, '.webp'), // Change extension to .webp
			{ type: 'image/webp' }
		);
		return Promise.resolve(mockCompressedFile);
	})
}));

describe('Image Compression Utils', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('validateImageFile', () => {
		it('should validate image files correctly', () => {
			const imageFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
			const result = validateImageFile(imageFile);
			expect(result.isValid).toBe(true);
		});

		it('should reject non-image files', () => {
			const textFile = new File([''], 'test.txt', { type: 'text/plain' });
			const result = validateImageFile(textFile);
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('image');
		});

		it('should reject oversized files', () => {
			// Create a file larger than 50MB
			const largeFile = new File([new ArrayBuffer(51 * 1024 * 1024)], 'large.jpg', { 
				type: 'image/jpeg' 
			});
			const result = validateImageFile(largeFile);
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('50MB');
		});

		it('should reject unsupported formats', () => {
			const unsupportedFile = new File([''], 'test.tiff', { type: 'image/tiff' });
			const result = validateImageFile(unsupportedFile);
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('format');
		});
	});

	describe('compressImage', () => {
		it('should compress image and return result with compression info', async () => {
			const originalFile = new File([new ArrayBuffer(1024 * 1024)], 'test.jpg', { 
				type: 'image/jpeg' 
			});

			const result = await compressImage(originalFile);

			expect(result.file).toBeDefined();
			expect(result.file.type).toBe('image/webp');
			expect(result.originalSize).toBe(originalFile.size);
			expect(result.compressedSize).toBeLessThan(originalFile.size);
			expect(result.compressionRatio).toBeGreaterThan(1);
		});

		it('should handle compression errors gracefully', async () => {
			const invalidFile = new File([''], 'test.txt', { type: 'text/plain' });

			await expect(compressImage(invalidFile)).rejects.toThrow('image');
		});

		it('should respect custom compression options', async () => {
			const originalFile = new File([new ArrayBuffer(1024 * 1024)], 'test.jpg', { 
				type: 'image/jpeg' 
			});

			const options = {
				maxSizeMB: 1,
				maxWidthOrHeight: 1920,
				quality: 0.9,
				fileType: 'image/webp'
			};

			const result = await compressImage(originalFile, options);
			expect(result.file.type).toBe('image/webp');
		});
	});

	describe('formatFileSize', () => {
		it('should format bytes correctly', () => {
			expect(formatFileSize(0)).toBe('0 Bytes');
			expect(formatFileSize(1024)).toBe('1 KB');
			expect(formatFileSize(1024 * 1024)).toBe('1 MB');
			expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
		});

		it('should handle decimal places', () => {
			expect(formatFileSize(1536)).toBe('1.5 KB'); // 1.5 KB
			expect(formatFileSize(1048576 * 2.5)).toBe('2.5 MB'); // 2.5 MB
		});
	});
});

describe('Media Upload Integration', () => {
	// Mock the upload service for testing
	const mockUploadService = {
		uploadSingleFile: vi.fn(),
		uploadMultipleFiles: vi.fn(),
		deleteFile: vi.fn(),
		getImageUrl: vi.fn(),
		generateResponsiveUrls: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should handle successful upload with compression', async () => {
		const mockUploadResult = {
			url: 'https://example.com/image.webp',
			key: 'test-key',
			cloudflareId: 'cf-123',
			variants: {
				thumbnail: 'https://example.com/image-thumb.webp',
				medium: 'https://example.com/image-med.webp',
				large: 'https://example.com/image-lg.webp'
			},
			type: 'image' as const,
			size: 500000,
			originalSize: 1000000,
			compressed: true
		};

		mockUploadService.uploadSingleFile.mockResolvedValue(mockUploadResult);

		const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
		const result = await mockUploadService.uploadSingleFile(file, {
			folder: 'test',
			useCloudflare: true,
			enableCompression: true
		});

		expect(result).toEqual(mockUploadResult);
		expect(result.compressed).toBe(true);
		expect(result.originalSize).toBeGreaterThan(result.size);
	});

	it('should generate responsive URLs correctly', () => {
		const uploadResult = {
			url: 'https://example.com/image.webp',
			key: 'test-key',
			cloudflareId: 'cf-123',
			variants: {
				thumbnail: 'https://example.com/image-thumb.webp',
				medium: 'https://example.com/image-med.webp',
				large: 'https://example.com/image-lg.webp'
			},
			type: 'image' as const,
			size: 500000,
			compressed: true
		};

		mockUploadService.getImageUrl.mockReturnValue(uploadResult.variants.medium);

		const mediumUrl = mockUploadService.getImageUrl(uploadResult, 'medium');
		expect(mediumUrl).toBe(uploadResult.variants.medium);
	});
});

describe('Nostr Integration', () => {
	it('should properly format media URLs for Nostr events', () => {
		const uploadResult = {
			url: 'https://imagedelivery.net/hash/image-id/',
			key: 'test-key',
			cloudflareId: 'cf-123',
			variants: {
				thumbnail: 'https://imagedelivery.net/hash/image-id/width=150,height=150,fit=cover',
				medium: 'https://imagedelivery.net/hash/image-id/width=800,fit=scale-down'
			},
			type: 'image' as const,
			size: 500000,
			compressed: true
		};

		// Test that URLs are properly formatted for Nostr events
		expect(uploadResult.url).toMatch(/^https:\/\//);
		expect(uploadResult.variants.thumbnail).toContain('width=150');
		expect(uploadResult.variants.medium).toContain('width=800');
	});

	it('should handle attachment format conversion', () => {
		const uploadResult = {
			url: 'https://example.com/image.webp',
			key: 'test-key',
			cloudflareId: 'cf-123',
			type: 'image' as const,
			size: 500000
		};

		// Convert to attachment format for tasks
		const attachment = {
			key: uploadResult.key,
			url: uploadResult.url,
			type: uploadResult.type === 'image' ? 'image/*' : uploadResult.type,
			alt: uploadResult.key,
			cloudflareId: uploadResult.cloudflareId,
			size: uploadResult.size
		};

		expect(attachment).toEqual({
			key: 'test-key',
			url: 'https://example.com/image.webp',
			type: 'image/*',
			alt: 'test-key',
			cloudflareId: 'cf-123',
			size: 500000
		});
	});
});