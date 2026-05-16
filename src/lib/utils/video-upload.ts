/**
 * Video upload utilities for Cloudflare Stream.
 *
 * Platform-aware upload strategy:
 * - Native (iOS/Android): @capgo/capacitor-uploader for background uploads
 * - Web: tus-js-client for resumable chunked uploads
 * - Both: cellular/battery warnings before large uploads
 */

import { browser } from '$app/environment';
import { addBreadcrumb } from '@sentry/sveltekit';

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
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const battery = await (navigator as any).getBattery();
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
 * Upload a video file using the platform-appropriate transport.
 *
 * On native (iOS/Android): uses @capgo/capacitor-uploader for background uploads
 * that survive app suspension. Falls back to tus-js-client if the plugin fails.
 *
 * On web: uses tus-js-client for chunked resumable uploads.
 *
 * @param filePath - Native file path (Capacitor) or the File object's URL for web
 * @param uploadURL - Cloudflare Stream Direct Creator Upload URL (one-time)
 * @param file - The File object (used for web uploads)
 * @param onProgress - Progress callback
 */
export async function uploadVideoFile(
	filePath: string,
	uploadURL: string,
	file: File,
	onProgress?: (progress: UploadProgress) => void
): Promise<void> {
	addBreadcrumb({
		category: 'stream',
		message: `uploadVideoFile: starting - size=${file.size}`,
		level: 'info'
	});

	let isNativePlatform = false;
	try {
		const { Capacitor: cap } = await import('@capacitor/core');
		isNativePlatform = cap.isNativePlatform();
	} catch {
		// Not a native platform
	}

	// Try native upload on mobile platforms
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
						onProgress?.({ percent: event.payload.percent, bytesUploaded: 0, bytesTotal: 0 });
					} else if (event.name === 'completed') {
						addBreadcrumb({
							category: 'stream',
							message: 'uploadVideoFile: native upload completed',
							level: 'info'
						});
					} else if (event.name === 'failed') {
						addBreadcrumb({
							category: 'stream',
							message: `uploadVideoFile: native upload failed - ${event.payload?.error}`,
							level: 'error'
						});
					}
				}
			);

			const result = await Uploader.startUpload({
				filePath,
				serverUrl: uploadURL,
				method: 'PUT',
				headers: {},
				mimeType: file.type || 'video/mp4',
				notificationTitle: 'Uploading video...',
				maxRetries: 3
			});

			addBreadcrumb({
				category: 'stream',
				message: `uploadVideoFile: native upload started - id=${result.id}`,
				level: 'info'
			});

			await handle.remove();
			return;
		} catch (e) {
			addBreadcrumb({
				category: 'stream',
				message: `uploadVideoFile: native upload failed, falling back to tus - ${e}`,
				level: 'warning'
			});
			// Fall through to web upload
		}
	}

	// Web fallback: tus-js-client chunked upload
	return new Promise((resolve, reject) => {
		import('tus-js-client')
			.then(({ Upload }) => {
				const upload = new Upload(file, {
					endpoint: uploadURL,
					chunkSize: 10 * 1024 * 1024,
					retryDelays: [0, 3000, 5000, 10000, 20000],
					metadata: { filename: file.name, filetype: file.type },
					onError(error: Error) {
						addBreadcrumb({
							category: 'stream',
							message: `tus upload error: ${error.message}`,
							level: 'error'
						});
						reject(error);
					},
					onProgress(bytesUploaded: number, bytesTotal: number) {
						onProgress?.({
							percent: Math.round((bytesUploaded / bytesTotal) * 100),
							bytesUploaded,
							bytesTotal
						});
					},
					onSuccess() {
						addBreadcrumb({ category: 'stream', message: 'tus upload completed', level: 'info' });
						resolve();
					}
				});
				upload.start();
			})
			.catch(reject);
	});
}
