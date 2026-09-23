import imageCompression from 'browser-image-compression';

/**
 * Image compression utilities for BitTasker
 * Handles client-side image compression and resizing before upload
 */

export interface ImageCompressionOptions {
	maxSizeMB?: number;
	maxWidthOrHeight?: number;
	quality?: number;
	fileType?: string;
	initialQuality?: number;
}

export interface CompressionResult {
	file: File;
	originalSize: number;
	compressedSize: number;
	compressionRatio: number;
}

/**
 * Default compression options based on BitTasker requirements
 */
const DEFAULT_OPTIONS: ImageCompressionOptions = {
	maxSizeMB: 2, // 2MB max file size
	maxWidthOrHeight: 3840, // 4K max resolution
	quality: 0.8, // 80% quality for WEBP
	fileType: 'image/webp',
	initialQuality: 0.8
};

/**
 * Compresses an image file according to BitTasker specifications
 * - Resizes to maximum 4K (3840px)
 * - Converts to WEBP format
 * - Compresses to 80% quality
 * - Ensures file size is under 2MB
 */
export async function compressImage(
	file: File,
	options: Partial<ImageCompressionOptions> = {}
): Promise<CompressionResult> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	
	// Validate input file
	if (!file.type.startsWith('image/')) {
		throw new Error('File must be an image');
	}

	const originalSize = file.size;
	
	try {
		// Compress the image
		const compressedFile = await imageCompression(file, {
			maxSizeMB: opts.maxSizeMB!,
			maxWidthOrHeight: opts.maxWidthOrHeight!,
			useWebWorker: true, // Use web worker for better performance
			fileType: opts.fileType!,
			initialQuality: opts.initialQuality!
		});

		const compressedSize = compressedFile.size;
		const compressionRatio = originalSize / compressedSize;

		return {
			file: compressedFile,
			originalSize,
			compressedSize,
			compressionRatio
		};
	} catch (error) {
		console.error('Image compression failed:', error);
		throw new Error('Failed to compress image: ' + (error as Error).message);
	}
}

/**
 * Validates if an image meets the requirements before compression
 */
export function validateImageFile(file: File): { isValid: boolean; error?: string } {
	// Check file type
	if (!file.type.startsWith('image/')) {
		return { isValid: false, error: 'File must be an image' };
	}

	// Check file size (50MB max before compression)
	const maxSizeBeforeCompression = 50 * 1024 * 1024; // 50MB
	if (file.size > maxSizeBeforeCompression) {
		return { isValid: false, error: 'Image file is too large (max 50MB before compression)' };
	}

	// Check if it's a supported image format
	const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];
	if (!supportedFormats.includes(file.type)) {
		return { 
			isValid: false, 
			error: 'Unsupported image format. Supported formats: JPEG, PNG, WEBP, BMP, GIF' 
		};
	}

	return { isValid: true };
}

/**
 * Compresses multiple images in sequence to avoid memory issues
 */
export async function compressImages(
	files: File[],
	options: Partial<ImageCompressionOptions> = {},
	onProgress?: (index: number, total: number, result: CompressionResult) => void
): Promise<CompressionResult[]> {
	const results: CompressionResult[] = [];

	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		
		// Validate each file
		const validation = validateImageFile(file);
		if (!validation.isValid) {
			throw new Error(`File ${file.name}: ${validation.error}`);
		}

		try {
			const result = await compressImage(file, options);
			results.push(result);
			
			// Call progress callback if provided
			if (onProgress) {
				onProgress(i + 1, files.length, result);
			}
		} catch (error) {
			throw new Error(`Failed to compress ${file.name}: ${(error as Error).message}`);
		}
	}

	return results;
}

/**
 * Generates a preview URL for an image file
 */
export function createImagePreview(file: File): string {
	return URL.createObjectURL(file);
}

/**
 * Cleans up preview URLs to prevent memory leaks
 */
export function revokeImagePreview(url: string): void {
	URL.revokeObjectURL(url);
}

/**
 * Utility to format file sizes for display
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
