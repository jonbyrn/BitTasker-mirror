import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import cloudflareMediaService from './cloudflare-media.service';
import { compressImage, validateImageFile } from '$lib/utils/imageCompression';
import {
	UPLOAD_TIMEOUT_MS,
	UploadTimeoutError,
	assertUsableUploadResult,
	fileWithResolvedMime,
	isImageMime,
	isUploadTimeout,
	isVideoMime
} from '$lib/utils/media/upload-file';
import { addBreadcrumb } from '@sentry/sveltekit';

export interface UploadResult {
	url: string;
	key: string;
	cloudflareId?: string;
	variants?: Record<string, string>;
	type: 'image' | 'video' | 'document';
	size: number;
	originalSize?: number;
	compressed?: boolean;
}

export interface UploadOptions {
	folder?: string;
	useCloudflare?: boolean;
	enableCompression?: boolean;
	generateVariants?: boolean;
	metadata?: Record<string, unknown>;
	onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
}

/**
 * Validates and sanitizes the folder parameter to prevent path traversal.
 * Only allows safe characters: alphanumeric, hyphens, underscores, forward slashes.
 */
function validateFolderParam(folder: string): string {
	if (!folder || typeof folder !== 'string') {
		return 'uploads';
	}

	// Check for path traversal patterns
	const dangerousPatterns = [
		/\.\./, // Parent directory traversal
		/^\//, // Absolute path
		/%2e%2e/i, // URL-encoded parent directory
		/\0/ // Null byte injection
	];

	for (const pattern of dangerousPatterns) {
		if (pattern.test(folder)) {
			console.warn('Path traversal attempt detected in folder parameter:', folder);
			return 'uploads';
		}
	}

	// Sanitize: only allow safe characters
	const sanitized = folder.replace(/[^a-zA-Z0-9\-_/.]/g, '');

	// Limit length to prevent DoS
	return sanitized.slice(0, 100) || 'uploads';
}

/**
 * Upload Service
 * Handles file uploads for the BitTasker platform with Cloudflare integration
 */
class UploadService extends BaseApiService {
	/**
	 * Upload a single file with optional Cloudflare integration
	 * @param file The file to upload
	 * @param options Upload options
	 * @returns Promise containing the upload result
	 * @throws Error if upload fails
	 */
	async uploadSingleFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
		const {
			folder = 'uploads',
			useCloudflare = true,
			enableCompression = true,
			generateVariants = true,
			metadata = {}
		} = options;

		// Validate and sanitize folder parameter to prevent path traversal
		const safeFolder = validateFolderParam(folder);

		const normalizedFile = fileWithResolvedMime(file);
		let processedFile = normalizedFile;
		let compressed = false;
		const originalSize = normalizedFile.size;

		// Determine file type from the sniffed MIME, not a blank browser type.
		const isImage = isImageMime(normalizedFile.type);
		const isVideo = isVideoMime(normalizedFile.type);
		const fileType: 'image' | 'video' | 'document' = isImage
			? 'image'
			: isVideo
				? 'video'
				: 'document';

		// Compress images if enabled and file is an image
		if (isImage && enableCompression) {
			const validation = validateImageFile(normalizedFile);
			if (!validation.isValid) {
				throw new Error(validation.error || 'Invalid image file');
			}

			try {
				const compressionResult = await compressImage(normalizedFile, {
					maxSizeMB: 2,
					maxWidthOrHeight: 3840,
					quality: 0.8,
					fileType: 'image/webp'
				});

				processedFile = compressionResult.file;
				compressed = true;
			} catch (error) {
				console.warn('Image compression failed, using original file:', error);
			}
		}

		// Try Cloudflare Worker upload first if enabled
		if (useCloudflare && (isImage || isVideo)) {
			try {
				if (isImage) {
					// Images: use Worker direct upload URL if possible, otherwise legacy path
					if (cloudflareMediaService.isConfigured()) {
						const cloudflareResult = await cloudflareMediaService.uploadImage(processedFile, {
							folder: safeFolder,
							...metadata,
							originalName: file.name,
							uploadedAt: new Date().toISOString(),
							compressed
						});

						let variants: Record<string, string> = {};
						if (generateVariants) {
							variants = cloudflareMediaService.generateResponsiveImageUrls(cloudflareResult.id);
						}

						return {
							url:
								variants.original || cloudflareMediaService.generateImageUrl(cloudflareResult.id),
							key: cloudflareResult.id,
							cloudflareId: cloudflareResult.id,
							variants,
							type: 'image',
							size: processedFile.size,
							originalSize: compressed ? originalSize : undefined,
							compressed
						};
					}
				} else if (isVideo) {
					// Video: use TUS resumable upload via Worker TUS proxy
					const actualDuration =
						typeof options.metadata?.maxDuration === 'number'
							? (options.metadata.maxDuration as number)
							: undefined;

					const { tusEndpoint, uid } = await cloudflareMediaService.requestTusUploadUrl(
						processedFile.size,
						600,
						{
							filename: processedFile.name,
							filetype: processedFile.type,
							actualDurationSeconds: actualDuration
						}
					);

					addBreadcrumb({
						category: 'stream',
						message: `uploadSingleFile: video TUS upload started - uid=${uid} size=${processedFile.size}`,
						level: 'info'
					});

					// Use TUS resumable upload with Uppy
					const { uploadVideoWithTus } = await import('$lib/utils/videoUpload');
					await uploadVideoWithTus(processedFile, tusEndpoint, {
						onProgress: (progress) => {
							options.onProgress?.(progress.bytesUploaded, progress.bytesTotal);
						}
					});

					addBreadcrumb({
						category: 'stream',
						message: `uploadSingleFile: video TUS upload complete - uid=${uid}`,
						level: 'info'
					});

					return {
						url: '',
						key: uid,
						cloudflareId: uid,
						type: 'video',
						size: processedFile.size,
						originalSize,
						compressed: false
					};
				}
			} catch (error) {
				console.warn('Cloudflare upload failed, falling back to default upload:', error);
			}
		}

		// Fallback to default upload service
		return this.uploadToDefaultService(processedFile, safeFolder, {
			type: fileType,
			size: processedFile.size,
			originalSize: compressed ? originalSize : undefined,
			compressed
		});
	}

	/**
	 * Fallback upload to the default service
	 * @param file The file to upload
	 * @param folder The folder to store the file in
	 * @param metadata Additional metadata
	 * @returns Upload result
	 */
	private async uploadToDefaultService(
		file: File,
		folder: string,
		metadata: {
			type: 'image' | 'video' | 'document';
			size: number;
			originalSize?: number;
			compressed?: boolean;
		}
	): Promise<UploadResult> {
		const formData = new FormData();
		formData.append('file', file);

		// Do not set Content-Type. Axios would otherwise send
		// multipart/form-data with no boundary (or application/json) and the
		// API parser waits until the client times out.
		let response: { data: { url?: string; key?: string } };
		try {
			response = await this.post<{ url?: string; key?: string }>(
				`${ENDPOINTS.UPLOADS.SINGLE}?folder=${encodeURIComponent(folder)}`,
				formData,
				{
					timeout: UPLOAD_TIMEOUT_MS,
					signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
				}
			);
		} catch (error) {
			if (isUploadTimeout(error)) throw new UploadTimeoutError();
			throw error;
		}

		const result = {
			url: response.data?.url ?? '',
			key: response.data?.key ?? '',
			type: metadata.type,
			size: metadata.size,
			originalSize: metadata.originalSize,
			compressed: metadata.compressed || false
		};
		assertUsableUploadResult(result);
		return result;
	}

	/**
	 * Upload multiple files with Cloudflare integration
	 * @param files The files to upload
	 * @param options Upload options
	 * @param onProgress Progress callback
	 * @returns Promise containing an array of upload results
	 * @throws Error if upload fails
	 */
	async uploadMultipleFiles(
		files: File[],
		options: UploadOptions = {},
		onProgress?: (completed: number, total: number, currentFile: string) => void
	): Promise<UploadResult[]> {
		const results: UploadResult[] = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];

			// Update progress if callback provided
			if (onProgress) {
				onProgress(i, files.length, file.name);
			}

			try {
				const result = await this.uploadSingleFile(file, options);
				results.push(result);
			} catch (error) {
				if (isUploadTimeout(error)) throw error;
				throw new Error(`Failed to upload ${file.name}: ${(error as Error).message}`);
			}
		}

		// Final progress update
		if (onProgress) {
			onProgress(files.length, files.length, '');
		}

		return results;
	}

	/**
	 * Delete a file by its key, handling both Cloudflare and default storage
	 * @param uploadResult The upload result containing the key and type
	 * @returns Promise that resolves when deletion is successful
	 * @throws Error if deletion fails
	 */
	async deleteFile(uploadResult: UploadResult | string): Promise<void> {
		// Handle legacy string key format
		if (typeof uploadResult === 'string') {
			await this.delete(ENDPOINTS.UPLOADS.DELETE(uploadResult));
			return;
		}

		// Delete from Cloudflare if it's a Cloudflare upload
		if (uploadResult.cloudflareId && cloudflareMediaService.isConfigured()) {
			try {
				if (uploadResult.type === 'image') {
					await cloudflareMediaService.deleteImage(uploadResult.cloudflareId);
				} else if (uploadResult.type === 'video') {
					await cloudflareMediaService.deleteVideo(uploadResult.cloudflareId);
				}
				return;
			} catch (error) {
				console.warn('Failed to delete from Cloudflare, trying default service:', error);
			}
		}

		// Fallback to default deletion
		await this.delete(ENDPOINTS.UPLOADS.DELETE(uploadResult.key));
	}

	/**
	 * Get optimized image URL for different screen sizes
	 * @param uploadResult The upload result from image upload
	 * @param size The desired size variant
	 * @returns Optimized image URL
	 */
	getImageUrl(
		uploadResult: UploadResult,
		size: keyof ReturnType<typeof cloudflareMediaService.generateResponsiveImageUrls> = 'medium'
	): string {
		if (uploadResult.type !== 'image') {
			return uploadResult.url;
		}

		// Return variant if available
		if (uploadResult.variants && uploadResult.variants[size]) {
			return uploadResult.variants[size];
		}

		// Return original URL as fallback
		return uploadResult.url;
	}

	/**
	 * Generate responsive image URLs if not already generated
	 * @param uploadResult The upload result from image upload
	 * @returns Object with responsive URLs or null if not a Cloudflare image
	 */
	generateResponsiveUrls(uploadResult: UploadResult): Record<string, string> | null {
		if (
			uploadResult.type !== 'image' ||
			!uploadResult.cloudflareId ||
			!cloudflareMediaService.isConfigured()
		) {
			return null;
		}

		return cloudflareMediaService.generateResponsiveImageUrls(uploadResult.cloudflareId);
	}
}

// Create singleton instance
const uploadService = new UploadService();
export default uploadService;
