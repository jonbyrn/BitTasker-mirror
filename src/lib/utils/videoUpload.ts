/**
 * Video upload utilities for Cloudflare Stream using TUS protocol.
 *
 * Platform-aware upload strategy:
 * - Native (iOS/Android): @capgo/capacitor-uploader for background uploads
 * - Web: Uppy + @uppy/tus for resumable chunked uploads via TUS protocol
 * - Both: cellular/battery warnings before large uploads
 *
 * Cloudflare Stream TUS Requirements:
 * - Minimum chunk size: 5,242,880 bytes (5 MB)
 * - Recommended chunk size: 52,428,800 bytes (50 MB) for reliable connections
 * - Maximum chunk size: 209,715,200 bytes (200 MB)
 * - Chunk size must be divisible by 256 KiB (262,144 bytes)
 *
 * @see https://developers.cloudflare.com/stream/uploading-videos/upload-video-file/#resumable-uploads-with-tus-for-large-files
 */

import { browser } from '$app/environment';
import { addBreadcrumb } from '@sentry/sveltekit';
import { CapacitorNativeHttpStack, captureNativeXHR } from './native-http-stack';

/** Local type for the Web Battery API (not in all TS DOM lib targets). */
interface BatteryManager extends EventTarget {
	level: number;
	charging: boolean;
	chargingTime: number;
	dischargingTime: number;
	addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
	removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

/** TUS chunk size: 50 MB (divisible by 256 KiB = 262,144 bytes) */
export const TUS_CHUNK_SIZE = 52_428_800;

/** Retry delays for TUS uploads (milliseconds) */
export const TUS_RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000];

/** TUS proxy endpoint on our Worker */
export const TUS_PROXY_ENDPOINT = '/api/cloudflare/stream/tus';

export interface UploadProgress {
	percent: number;
	bytesUploaded: number;
	bytesTotal: number;
}

export interface UploadResult {
	uid: string;
}

export interface UploadWarning {
	code: 'cellular' | 'low_battery' | 'large_file';
	message: string;
}

export interface UploadCallbacks {
	onProgress?: (progress: UploadProgress) => void;
	onError?: (error: Error) => void;
	onSuccess?: (result: UploadResult) => void;
}

/**
 * Check for cellular connection on native platforms.
 * Returns true if the user is on cellular (not WiFi).
 */
export async function isCellularConnection(): Promise<boolean> {
	if (!browser) return false;
	try {
		const { Network } = await import('@capacitor/network');
		const status = await Network.getStatus();
		return status.connectionType === 'cellular';
	} catch {
		return false;
	}
}

/**
 * Check battery level. Returns percentage (0-100) or null if unavailable.
 */
export async function getBatteryLevel(): Promise<number | null> {
	if (!browser) return null;
	try {
		const { Device } = await import('@capacitor/device');
		const info = await Device.getBatteryInfo();
		return info.batteryLevel !== undefined ? Math.round(info.batteryLevel * 100) : null;
	} catch {
		// Web fallback
		if ('getBattery' in navigator) {
			try {
				const navWithBattery = navigator as Navigator & {
					getBattery: () => Promise<BatteryManager>;
				};
				const battery = await navWithBattery.getBattery();
				return Math.round(battery.level * 100);
			} catch {
				return null;
			}
		}
		return null;
	}
}

/**
 * Check for warnings before starting a large upload.
 * Returns an array of warnings (cellular, low battery, large file).
 */
export async function checkUploadWarnings(fileSize: number): Promise<UploadWarning[]> {
	const warnings: UploadWarning[] = [];

	if (fileSize > 100 * 1024 * 1024) {
		warnings.push({
			code: 'large_file',
			message: `This video is ${Math.round(fileSize / (1024 * 1024))} MB`
		});
	}

	const isCellular = await isCellularConnection();
	if (isCellular && fileSize > 50 * 1024 * 1024) {
		warnings.push({ code: 'cellular', message: 'Uploading over cellular will use data' });
	}

	const battery = await getBatteryLevel();
	if (battery !== null && battery < 20) {
		warnings.push({ code: 'low_battery', message: 'Battery is low. Upload may be interrupted.' });
	}

	return warnings;
}

/**
 * Upload a video file using Uppy + TUS protocol (web) or native uploader (mobile).
 *
 * On native (iOS/Android): uses @capgo/capacitor-uploader for background uploads
 * that survive app suspension.
 *
 * On web: uses Uppy with @uppy/tus for resumable chunked uploads. This provides:
 * - Automatic resumption of interrupted uploads
 * - Chunked uploads (50MB chunks by default)
 * - Real-time progress tracking
 * - Automatic retries with exponential backoff
 *
 * @param file - The File object to upload
 * @param tusEndpoint - TUS upload endpoint URL (from requestTusUploadUrl)
 * @param callbacks - Progress, error, and success callbacks
 * @returns Promise that resolves with the video UID
 */
export async function uploadVideoWithTus(
	file: File,
	tusEndpoint: string,
	callbacks: UploadCallbacks = {}
): Promise<UploadResult> {
	// const { onProgress, onError, onSuccess } = callbacks;

	addBreadcrumb({
		category: 'stream',
		message: `uploadVideoWithTus: starting - size=${file.size}, endpoint=${tusEndpoint.substring(0, 50)}...`,
		level: 'info'
	});

	let isNativePlatform = false;
	try {
		const { Capacitor: cap } = await import('@capacitor/core');
		isNativePlatform = cap.isNativePlatform();
	} catch {
		// Not a native platform
	}

	// ── Native (iOS/Android) ──────────────────────────────────────────
	if (isNativePlatform) {
		return uploadVideoNative(file, tusEndpoint, callbacks);
	}

	// ── Web: Uppy + @uppy/tus ─────────────────────────────────────────
	return uploadVideoUppy(file, tusEndpoint, callbacks);
}

/**
 * Convert ArrayBuffer to base64 without stack overflow (chunked processing).
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	const SLICE = 8192;
	for (let i = 0; i < bytes.byteLength; i += SLICE) {
		binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + SLICE, bytes.byteLength)));
	}
	return btoa(binary);
}

/**
 * Write a File blob to the native cache directory in 4 MB chunks to avoid OOM.
 * Returns the native `file://` URI of the written file.
 */
async function writeFileToNativeCache(file: File): Promise<string> {
	const { Filesystem, Directory } = await import('@capacitor/filesystem');
	const ext = file.name.split('.').pop() || 'mp4';
	const tmpName = `bittasker_upload_${Date.now()}.${ext}`;
	const CHUNK = 4 * 1024 * 1024; // 4 MB → ~5.4 MB base64 peak per chunk

	// When no `encoding` is specified, Capacitor treats data as base64 and writes
	// actual binary bytes to disk — the correct behavior for video files.
	for (let offset = 0; offset < file.size; offset += CHUNK) {
		const ab = await file.slice(offset, offset + CHUNK).arrayBuffer();
		const b64 = arrayBufferToBase64(ab);
		if (offset === 0) {
			await Filesystem.writeFile({
				path: tmpName,
				data: b64,
				directory: Directory.Cache,
				recursive: true
			});
		} else {
			await Filesystem.appendFile({ path: tmpName, data: b64, directory: Directory.Cache });
		}
	}

	const { uri } = await Filesystem.getUri({ path: tmpName, directory: Directory.Cache });
	const { size: writtenSize } = await Filesystem.stat({
		path: tmpName,
		directory: Directory.Cache
	});

	addBreadcrumb({
		category: 'stream',
		message: `writeFileToNativeCache: original=${file.size} written=${writtenSize} uri=${uri}`,
		level: writtenSize === file.size ? 'info' : 'warning'
	});

	return uri;
}

/**
 * Native video upload using @capgo/capacitor-uploader.
 * Writes the File to the native cache directory first (avoids the missing .path
 * property on WebView File objects) then uploads using native networking.
 */
async function uploadVideoNative(
	file: File,
	uploadURL: string,
	callbacks: UploadCallbacks
): Promise<UploadResult> {
	const { onProgress, onError, onSuccess } = callbacks;

	let tempUri: string | null = null;

	try {
		// Write the file to native cache so capacitor-uploader gets a real file:// URI.
		tempUri = await writeFileToNativeCache(file);

		const { Uploader } = await import('@capgo/capacitor-uploader');

		return new Promise((resolve, reject) => {
			let currentUploadId = '';
			let isHandled = false;

			const setupListener = async () => {
				const handle = await Uploader.addListener(
					'events',
					(event: {
						name: string;
						payload?: { percent?: number; statusCode?: number; error?: string; id?: string };
						id: string;
					}) => {
						if (currentUploadId && event.id !== currentUploadId) return;
						if (isHandled) return;

						if (event.name === 'uploading') {
							const percent = event.payload?.percent ?? 0;
							onProgress?.({
								percent,
								bytesUploaded: Math.round((percent / 100) * file.size),
								bytesTotal: file.size
							});
						} else if (event.name === 'completed') {
							isHandled = true;
							addBreadcrumb({
								category: 'stream',
								message: 'uploadVideoNative: completed',
								level: 'info'
							});
							handle.remove();
							// Clean up the temp file.
							if (tempUri) {
								import('@capacitor/filesystem')
									.then(({ Filesystem, Directory }) => {
										const fileName = (tempUri as string).split('/').pop() || '';
										if (fileName) {
											Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(
												() => {}
											);
										}
									})
									.catch(() => {});
							}
							const result: UploadResult = { uid: event.payload?.id || '' };
							onSuccess?.(result);
							resolve(result);
						} else if (event.name === 'failed') {
							isHandled = true;
							const error = new Error(event.payload?.error || 'Native upload failed');
							addBreadcrumb({
								category: 'stream',
								message: `uploadVideoNative: failed - ${error.message}`,
								level: 'error'
							});
							handle.remove();
							onError?.(error);
							reject(error);
						}
					}
				);

				return handle;
			};

			setupListener()
				.then(async () => {
					const result = await Uploader.startUpload({
						filePath: tempUri as string,
						serverUrl: uploadURL,
						method: 'POST',
						uploadType: 'multipart',
						fileField: 'file',
						headers: {},
						notificationTitle: 'Uploading video...',
						maxRetries: 0
					});

					currentUploadId = result.id;

					addBreadcrumb({
						category: 'stream',
						message: `uploadVideoNative: started - id=${result.id}`,
						level: 'info'
					});
				})
				.catch((e) => {
					const error = e instanceof Error ? e : new Error(String(e));
					onError?.(error);
					reject(error);
				});
		});
	} catch (e) {
		addBreadcrumb({
			category: 'stream',
			message: `uploadVideoNative: error, falling back to web - ${e}`,
			level: 'warning'
		});
		// Fall back to web upload
		return uploadVideoUppy(file, uploadURL, callbacks);
	}
}

/**
 * Web video upload using Uppy + @uppy/tus.
 * Provides resumable chunked uploads with progress tracking.
 */
async function uploadVideoUppy(
	file: File,
	tusEndpoint: string,
	callbacks: UploadCallbacks
): Promise<UploadResult> {
	const { onProgress, onError, onSuccess } = callbacks;

	// Dynamically import Uppy to avoid SSR issues
	const [{ default: Uppy }, { default: Tus }] = await Promise.all([
		import('@uppy/core'),
		import('@uppy/tus')
	]);

	// On Capacitor native, route same-origin TUS creation through CapacitorHttp
	// to bypass WebViewLocalServer interception while preserving XHR upload progress
	let isNativePlatform = false;
	try {
		const { Capacitor: cap } = await import('@capacitor/core');
		isNativePlatform = cap.isNativePlatform();
	} catch {
		/* web — no Capacitor */
	}
	if (isNativePlatform) {
		captureNativeXHR();
	}

	return new Promise((resolve, reject) => {
		let videoUid: string | null = null;

		// Create fresh File to reset browser's internal Blob read cursor
		const freshFile = new File([file], file.name, { type: file.type || 'video/mp4' });

		// Initialize Uppy instance
		const uppy = new Uppy({
			id: `video-upload-${Date.now()}`,
			autoProceed: true,
			restrictions: {
				maxNumberOfFiles: 1,
				allowedFileTypes: ['video/*']
			},
			debug: false
		});

		// Configure TUS plugin for Cloudflare Stream
		const tusOpts: Record<string, unknown> = {
			endpoint: tusEndpoint,
			chunkSize: TUS_CHUNK_SIZE,
			retryDelays: TUS_RETRY_DELAYS,
			removeFingerprintOnSuccess: true,
			headers: {
				'Upload-Creator': 'bittasker-web'
			},
			onAfterResponse: (_req: unknown, res: { getHeader: (name: string) => string | null }) => {
				// Extract video UID from response headers
				const mediaId = res.getHeader('stream-media-id');
				if (mediaId) {
					videoUid = mediaId;
					addBreadcrumb({
						category: 'stream',
						message: `uploadVideoUppy: received media ID - ${mediaId}`,
						level: 'info'
					});
				}
			}
		};

		if (isNativePlatform) {
			tusOpts.httpStack = new CapacitorNativeHttpStack();
		}

		uppy.use(Tus, tusOpts);

		// Track upload progress
		uppy.on('upload-progress', (_uppyFile, progress) => {
			if (progress.bytesTotal && progress.bytesUploaded !== undefined) {
				const percent = Math.round((progress.bytesUploaded / progress.bytesTotal) * 100);
				onProgress?.({
					percent,
					bytesUploaded: progress.bytesUploaded,
					bytesTotal: progress.bytesTotal
				});
			}
		});

		// Handle upload success
		uppy.on('upload-success', (_uppyFile, response) => {
			addBreadcrumb({
				category: 'stream',
				message: `uploadVideoUppy: success - uid=${videoUid || 'unknown'}`,
				level: 'info'
			});

			// Try to extract UID from response if not already captured
			if (!videoUid && response.uploadURL) {
				const urlParts = response.uploadURL.split('/');
				videoUid = urlParts[urlParts.length - 1] || null;
			}

			const result: UploadResult = { uid: videoUid || '' };
			onSuccess?.(result);

			// Cleanup Uppy instance
			uppy.clear();
			uppy.destroy();

			resolve(result);
		});

		// Handle upload errors
		uppy.on('upload-error', (_uppyFile, error) => {
			const uploadError = error instanceof Error ? error : new Error(String(error));
			addBreadcrumb({
				category: 'stream',
				message: `uploadVideoUppy: error - ${uploadError.message}`,
				level: 'error'
			});
			onError?.(uploadError);

			// Cleanup Uppy instance
			uppy.clear();
			uppy.destroy();

			reject(uploadError);
		});

		// Handle complete (all files done)
		uppy.on('complete', (result) => {
			if (result.failed && result.failed.length > 0) {
				const failedFile = result.failed[0];
				const error = failedFile.error
					? new Error(String(failedFile.error))
					: new Error('Upload failed');
				onError?.(error);

				uppy.clear();
				uppy.destroy();

				reject(error);
			}
		});

		// Add file and start upload
		try {
			uppy.addFile({
				name: freshFile.name,
				type: freshFile.type,
				data: freshFile,
				source: 'Local',
				isRemote: false
			});

			addBreadcrumb({
				category: 'stream',
				message: `uploadVideoUppy: file added, starting upload`,
				level: 'info'
			});
		} catch (e) {
			const error = e instanceof Error ? e : new Error(String(e));
			addBreadcrumb({
				category: 'stream',
				message: `uploadVideoUppy: failed to add file - ${error.message}`,
				level: 'error'
			});
			onError?.(error);

			uppy.clear();
			uppy.destroy();

			reject(error);
		}
	});
}

/**
 * Legacy upload function for backwards compatibility.
 * Delegates to uploadVideoWithTus for TUS endpoints or falls back to XHR POST.
 *
 * @param filePath - Native file path (Capacitor); ignored on web
 * @param uploadURL - Upload URL (TUS or Direct Creator Upload)
 * @param file - The File object to upload
 * @param onProgress - Progress callback (percent, bytes)
 * @deprecated Use uploadVideoWithTus for new implementations
 */
export async function uploadVideoFile(
	filePath: string,
	uploadURL: string,
	file: File,
	onProgress?: (progress: UploadProgress) => void
): Promise<void> {
	// Check if this is a TUS endpoint
	const isTusEndpoint = uploadURL.includes('/tus') || uploadURL.includes('tus.');

	if (isTusEndpoint) {
		await uploadVideoWithTus(file, uploadURL, { onProgress });
		return;
	}

	// Fall back to legacy XHR POST for non-TUS endpoints
	addBreadcrumb({
		category: 'stream',
		message: `uploadVideoFile: using legacy XHR POST - size=${file.size}`,
		level: 'info'
	});

	let isNativePlatform = false;
	try {
		const { Capacitor: cap } = await import('@capacitor/core');
		isNativePlatform = cap.isNativePlatform();
	} catch {
		// Not a native platform
	}

	// Native upload
	if (isNativePlatform) {
		try {
			const { Uploader } = await import('@capgo/capacitor-uploader');

			const handle = await Uploader.addListener(
				'events',
				(event: {
					name: string;
					payload?: { percent?: number; statusCode?: number; error?: string };
				}) => {
					if (event.name === 'uploading') {
						onProgress?.({
							percent: event.payload?.percent ?? 0,
							bytesUploaded: 0,
							bytesTotal: file.size
						});
					}
				}
			);

			await Uploader.startUpload({
				filePath,
				serverUrl: uploadURL,
				method: 'POST',
				uploadType: 'multipart',
				fileField: 'file',
				headers: {},
				notificationTitle: 'Uploading video...',
				maxRetries: 0
			});

			await handle.remove();
			return;
		} catch (e) {
			addBreadcrumb({
				category: 'stream',
				message: `uploadVideoFile: native upload failed, falling back to web - ${e}`,
				level: 'warning'
			});
		}
	}

	// Web: XHR POST with multipart/form-data
	const freshFile = new File([file], file.name, { type: file.type || 'video/mp4' });

	return new Promise((resolve, reject) => {
		const formData = new FormData();
		formData.append('file', freshFile);

		const xhr = new XMLHttpRequest();

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				const percent = Math.round((event.loaded / event.total) * 100);
				onProgress?.({
					percent,
					bytesUploaded: event.loaded,
					bytesTotal: event.total
				});
			}
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				addBreadcrumb({
					category: 'stream',
					message: `uploadVideoFile: completed - status=${xhr.status}`,
					level: 'info'
				});
				resolve();
			} else {
				const errorMessage = `Upload failed: HTTP ${xhr.status} - ${xhr.responseText || 'Unknown error'}`;
				reject(new Error(errorMessage));
			}
		};

		xhr.onerror = () => reject(new Error('Upload failed: Network error'));
		xhr.ontimeout = () => reject(new Error('Upload failed: Request timed out'));
		xhr.onabort = () => reject(new Error('Upload cancelled'));

		xhr.open('POST', uploadURL, true);
		xhr.timeout = 0;
		xhr.send(formData);
	});
}
