import { addBreadcrumb } from '@sentry/sveltekit';

/**
 * Cloudflare Media Service
 * Handles integration with Cloudflare Images and Stream for optimized media processing and delivery
 */

export interface CloudflareImageUploadResponse {
	id: string;
	filename: string;
	meta: Record<string, unknown>;
	uploaded: string;
	requireSignedURLs: boolean;
	variants: string[];
}

export interface CloudflareImageDeliveryOptions {
	width?: number;
	height?: number;
	fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
	format?: 'auto' | 'avif' | 'webp' | 'json';
	quality?: number;
	dpr?: number;
	background?: string;
	trim?: number;
	gravity?: 'auto' | 'side' | 'face';
}

export interface CloudflareStreamUploadResponse {
	uid: string;
	watermark?: {
		uid: string;
	};
	created: string;
	modified: string;
	meta: Record<string, unknown>;
	status: {
		state: 'pendingupload' | 'downloading' | 'queued' | 'inprogress' | 'ready' | 'error';
		pctComplete?: string;
		errorReasonCode?: string;
		errorReasonText?: string;
	};
	playback?: {
		hls: string;
		dash: string;
	};
	preview?: string;
	thumbnail?: string;
	thumbnailTimestampPct?: number;
	readyToStream?: boolean;
	size?: number;
	input?: {
		width?: number;
		height?: number;
	};
	uploaded?: string;
	uploadExpiry?: string;
	maxSizeBytes?: number;
	maxDurationSeconds?: number;
	requireSignedURLs?: boolean;
	allowedOrigins?: string[];
	tus?: {
		uploadURL: string;
		uploadMetadata: string;
	};
}

class CloudflareMediaService {
	private readonly IMAGES_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';
	private readonly STREAM_API_BASE = 'https://api.cloudflare.com/client/v4/accounts';
	private readonly IMAGES_DELIVERY_BASE = 'https://imagedelivery.net';

	// These should be set via environment variables or configuration
	private accountId: string = '';
	private apiToken: string = '';
	private imageDeliveryHash: string = '';

	constructor() {
		// Initialize from environment variables if available
		if (typeof window === 'undefined') {
			// Server-side
			this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
			this.apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
			this.imageDeliveryHash = process.env.CLOUDFLARE_IMAGE_DELIVERY_HASH || '';
		}
	}

	/**
	 * Upload image to Cloudflare Images
	 * @param file The image file to upload
	 * @param metadata Optional metadata to attach to the image
	 * @returns Upload response with image ID and variants
	 */
	async uploadImage(
		file: File,
		metadata: Record<string, unknown> = {}
	): Promise<CloudflareImageUploadResponse> {
		if (!this.accountId || !this.apiToken) {
			throw new Error('Cloudflare credentials not configured');
		}

		const formData = new FormData();
		formData.append('file', file);

		// Add metadata if provided
		Object.keys(metadata).forEach((key) => {
			formData.append(`metadata[${key}]`, String(metadata[key]));
		});

		const response = await fetch(`${this.IMAGES_API_BASE}/${this.accountId}/images/v1`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiToken}`
			},
			body: formData
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to upload image to Cloudflare Images: ${error}`);
		}

		const result = await response.json();

		if (!result.success) {
			throw new Error(
				`Cloudflare Images upload failed: ${result.errors?.[0]?.message || 'Unknown error'}`
			);
		}

		return result.result;
	}

	/**
	 * Generate optimized image delivery URL
	 * @param imageId The Cloudflare image ID
	 * @param options Delivery options for optimization
	 * @returns Optimized image URL
	 */
	generateImageUrl(imageId: string, options: CloudflareImageDeliveryOptions = {}): string {
		if (!this.imageDeliveryHash) {
			throw new Error('Cloudflare Image delivery hash not configured');
		}

		const params = new URLSearchParams();

		if (options.width) params.append('width', options.width.toString());
		if (options.height) params.append('height', options.height.toString());
		if (options.fit) params.append('fit', options.fit);
		if (options.format) params.append('format', options.format);
		if (options.quality) params.append('quality', options.quality.toString());
		if (options.dpr) params.append('dpr', options.dpr.toString());
		if (options.background) params.append('background', options.background);
		if (options.trim) params.append('trim', options.trim.toString());
		if (options.gravity) params.append('gravity', options.gravity);

		const queryString = params.toString();
		const variant = queryString ? `${queryString}/` : '';

		return `${this.IMAGES_DELIVERY_BASE}/${this.imageDeliveryHash}/${imageId}/${variant}`;
	}

	/**
	 * Delete image from Cloudflare Images
	 * @param imageId The image ID to delete
	 */
	async deleteImage(imageId: string): Promise<void> {
		if (!this.accountId || !this.apiToken) {
			throw new Error('Cloudflare credentials not configured');
		}

		const response = await fetch(`${this.IMAGES_API_BASE}/${this.accountId}/images/v1/${imageId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${this.apiToken}`
			}
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to delete image: ${error}`);
		}

		const result = await response.json();

		if (!result.success) {
			throw new Error(
				`Cloudflare Images deletion failed: ${result.errors?.[0]?.message || 'Unknown error'}`
			);
		}
	}

	/**
	 * Upload video to Cloudflare Stream
	 * @param file The video file to upload
	 * @param metadata Optional metadata
	 * @returns Upload response with video UID and status
	 */
	async uploadVideo(
		file: File,
		metadata: Record<string, unknown> = {}
	): Promise<CloudflareStreamUploadResponse> {
		if (!this.accountId || !this.apiToken) {
			throw new Error('Cloudflare credentials not configured');
		}

		const formData = new FormData();
		formData.append('file', file);

		// Add metadata if provided
		Object.keys(metadata).forEach((key) => {
			formData.append(`meta[${key}]`, String(metadata[key]));
		});

		const response = await fetch(`${this.STREAM_API_BASE}/${this.accountId}/stream`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiToken}`
			},
			body: formData
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to upload video to Cloudflare Stream: ${error}`);
		}

		const result = await response.json();

		if (!result.success) {
			throw new Error(
				`Cloudflare Stream upload failed: ${result.errors?.[0]?.message || 'Unknown error'}`
			);
		}

		return result.result;
	}

	/**
	 * Get video status from Cloudflare Stream
	 * @param videoId The video UID
	 * @returns Video status and information
	 */
	async getVideoStatus(videoId: string): Promise<CloudflareStreamUploadResponse> {
		if (!this.accountId || !this.apiToken) {
			throw new Error('Cloudflare credentials not configured');
		}

		const response = await fetch(`${this.STREAM_API_BASE}/${this.accountId}/stream/${videoId}`, {
			headers: {
				Authorization: `Bearer ${this.apiToken}`
			}
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get video status: ${error}`);
		}

		const result = await response.json();

		if (!result.success) {
			throw new Error(
				`Cloudflare Stream status check failed: ${result.errors?.[0]?.message || 'Unknown error'}`
			);
		}

		return result.result;
	}

	/**
	 * Delete video from Cloudflare Stream
	 * @param videoId The video UID to delete
	 */
	async deleteVideo(videoId: string): Promise<void> {
		if (!this.accountId || !this.apiToken) {
			throw new Error('Cloudflare credentials not configured');
		}

		const response = await fetch(`${this.STREAM_API_BASE}/${this.accountId}/stream/${videoId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${this.apiToken}`
			}
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to delete video: ${error}`);
		}

		const result = await response.json();

		if (!result.success) {
			throw new Error(
				`Cloudflare Stream deletion failed: ${result.errors?.[0]?.message || 'Unknown error'}`
			);
		}
	}

	/**
	 * Request a Direct Creator Upload URL for Cloudflare Stream.
	 * Calls the Worker endpoint — no API token needed client-side.
	 * @param maxDurationSeconds Maximum video duration in seconds (capped at 600)
	 * @returns Upload URL and video UID
	 */
	async requestStreamUploadUrl(
		maxDurationSeconds = 3600,
		actualDurationSeconds?: number
	): Promise<{ uploadURL: string; uid: string }> {
		// When we know the actual video duration, use it (with 50% headroom) so Cloudflare
		// can optimize encoding for a realistic duration instead of always preparing for 10 min.
		const effectiveMaxDuration = actualDurationSeconds
			? Math.min(Math.ceil(actualDurationSeconds * 1.5), 600)
			: Math.min(maxDurationSeconds, 600);
		addBreadcrumb({
			category: 'stream',
			message: 'requestStreamUploadUrl: requested',
			level: 'info'
		});
		try {
			const res = await fetch('/api/cloudflare/stream/upload-url', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ maxDurationSeconds: effectiveMaxDuration })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err?.error?.message || `Upload URL request failed: HTTP ${res.status}`);
			}
			const data = await res.json();
			addBreadcrumb({
				category: 'stream',
				message: 'requestStreamUploadUrl: success',
				level: 'info'
			});
			return data;
		} catch (e) {
			addBreadcrumb({
				category: 'stream',
				message: `requestStreamUploadUrl: error - ${e instanceof Error ? e.message : 'Unknown error'}`,
				level: 'error'
			});
			throw e;
		}
	}

	/**
	 * Request a TUS Upload URL for Cloudflare Stream resumable uploads.
	 * Use this for large files that benefit from chunked, resumable uploads.
	 * Calls the Worker TUS proxy endpoint — no API token needed client-side.
	 *
	 * This method sends a TUS creation request with proper headers:
	 * - Upload-Length: File size in bytes
	 * - Upload-Metadata: Base64-encoded metadata (filename, filetype, maxDurationSeconds)
	 * - Tus-Resumable: TUS protocol version
	 *
	 * @param fileSize - Size of the file in bytes (required for TUS)
	 * @param maxDurationSeconds - Maximum video duration in seconds (capped at 600)
	 * @param metadata - Optional metadata (filename, filetype)
	 * @returns TUS upload URL and video UID
	 *
	 * @see https://developers.cloudflare.com/stream/uploading-videos/upload-video-file/#resumable-uploads-with-tus-for-large-files
	 */
	async requestTusUploadUrl(
		fileSize: number,
		maxDurationSeconds = 600,
		metadata: { filename?: string; filetype?: string; actualDurationSeconds?: number } = {}
	): Promise<{ tusEndpoint: string; uid: string }> {
		addBreadcrumb({
			category: 'stream',
			message: `requestTusUploadUrl: requested - size=${fileSize}`,
			level: 'info'
		});

		try {
			// Build TUS Upload-Metadata header (base64 key-value pairs)
			const metadataParts: string[] = [];
			if (metadata.filename) {
				metadataParts.push(`filename ${btoa(metadata.filename)}`);
			}
			if (metadata.filetype) {
				metadataParts.push(`filetype ${btoa(metadata.filetype)}`);
			}
			const effectiveMaxDuration = metadata.actualDurationSeconds
				? Math.min(Math.ceil(metadata.actualDurationSeconds * 1.5), 600)
				: Math.min(maxDurationSeconds, 600);
			metadataParts.push(`maxDurationSeconds ${btoa(String(effectiveMaxDuration))}`);

			const headers: Record<string, string> = {
				'Tus-Resumable': '1.0.0',
				'Upload-Length': String(fileSize)
			};

			if (metadataParts.length > 0) {
				headers['Upload-Metadata'] = metadataParts.join(',');
			}

			const res = await fetch('/api/cloudflare/stream/tus', {
				method: 'POST',
				headers
			});

			if (!res.ok) {
				const errorText = await res.text();
				let errorMessage = `TUS upload URL request failed: HTTP ${res.status}`;
				try {
					const err = JSON.parse(errorText);
					if (err?.error?.message) {
						errorMessage = err.error.message;
					}
				} catch {
					// Use default error message
				}
				throw new Error(errorMessage);
			}

			// TUS protocol returns 201 Created with Location header
			const location = res.headers.get('Location');
			const streamMediaId = res.headers.get('Stream-Media-Id');

			if (!location) {
				throw new Error('TUS endpoint did not return a Location header');
			}

			addBreadcrumb({
				category: 'stream',
				message: `requestTusUploadUrl: success - uid=${streamMediaId || 'unknown'}`,
				level: 'info'
			});

			return {
				tusEndpoint: location,
				uid: streamMediaId || ''
			};
		} catch (e) {
			addBreadcrumb({
				category: 'stream',
				message: `requestTusUploadUrl: error - ${e instanceof Error ? e.message : 'Unknown error'}`,
				level: 'error'
			});
			throw e;
		}
	}

	/**
	 * Request a Direct Creator Upload URL for Cloudflare Images.
	 * Calls the Worker endpoint — no API token needed client-side.
	 * (Future: migrate image uploads to this path)
	 * @param metadata Optional metadata for the image
	 * @returns Upload URL and image ID
	 */
	async requestImagesUploadUrl(
		metadata: Record<string, string> = {}
	): Promise<{ uploadURL: string; id: string }> {
		const res = await fetch('/api/cloudflare/images/upload-url', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ metadata })
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err?.error?.message || `Image upload URL request failed: HTTP ${res.status}`);
		}
		return res.json();
	}

	/**
	 * Generate responsive image variants for different screen sizes
	 * @param imageId The Cloudflare image ID
	 * @returns Object with URLs for different screen sizes
	 */
	generateResponsiveImageUrls(imageId: string) {
		return {
			thumbnail: this.generateImageUrl(imageId, {
				width: 150,
				height: 150,
				fit: 'cover',
				format: 'auto'
			}),
			small: this.generateImageUrl(imageId, { width: 400, fit: 'scale-down', format: 'auto' }),
			medium: this.generateImageUrl(imageId, { width: 800, fit: 'scale-down', format: 'auto' }),
			large: this.generateImageUrl(imageId, { width: 1200, fit: 'scale-down', format: 'auto' }),
			xlarge: this.generateImageUrl(imageId, { width: 1600, fit: 'scale-down', format: 'auto' }),
			original: this.generateImageUrl(imageId, { format: 'auto' })
		};
	}

	/**
	 * Configure service with credentials
	 * @param config Configuration object
	 */
	configure(config: { accountId: string; apiToken: string; imageDeliveryHash: string }): void {
		this.accountId = config.accountId;
		this.apiToken = config.apiToken;
		this.imageDeliveryHash = config.imageDeliveryHash;
	}

	/**
	 * Check if service is properly configured
	 * @returns Boolean indicating if service is configured
	 */
	isConfigured(): boolean {
		return !!(this.accountId && this.apiToken && this.imageDeliveryHash);
	}
}

// Create singleton instance
const cloudflareMediaService = new CloudflareMediaService();
export default cloudflareMediaService;
