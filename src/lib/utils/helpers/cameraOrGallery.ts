/**
 * Camera and gallery helpers for native (Capacitor) and web.
 * Provides "Take photo" and "Choose from gallery" as File(s) for upload flows.
 */

import { Capacitor, CapacitorException, ExceptionCode } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export type CameraOrGallerySource = 'camera' | 'photos';

/** Detect "plugin is not implemented" so callers can fall back to file input. */
function isNotImplementedError(err: unknown): boolean {
	if (err instanceof CapacitorException && err.code === ExceptionCode.Unimplemented) return true;
	const msg = err instanceof Error ? err.message : String(err ?? '');
	return msg.includes('not implemented');
}

/**
 * Whether the app is running on a native platform (iOS/Android). We try native Camera first;
 * if it throws "not implemented" (e.g. on some Android builds), the caller falls back to file input.
 */
export function isNativeCameraAvailable(): boolean {
	return Capacitor.isNativePlatform();
}

/**
 * Get a single photo as a File from the device camera (native) or from a file input (web).
 * On native: uses @capacitor/camera with CameraSource.Camera.
 * On web: returns null; caller should use a file input with capture="environment" instead.
 */
export async function getPhotoFromCamera(): Promise<File | null> {
	if (!isNativeCameraAvailable()) {
		return null;
	}

	try {
		const photo = await Camera.getPhoto({
			source: CameraSource.Camera,
			resultType: CameraResultType.Uri,
			quality: 90,
			correctOrientation: true
		});

		if (!photo.path) return null;
		return await uriToFile(photo.path, photo.format ?? 'jpeg');
	} catch (err) {
		if (isNotImplementedError(err)) throw err;
		console.error('[cameraOrGallery] getPhotoFromCamera:', err);
		return null;
	}
}

/**
 * Get one or more photos as File[] from the device gallery (native) or from a file input (web).
 * On native: uses @capacitor/camera getPhoto(Photos) for one image, or pickImages for multiple.
 * On web: returns []; caller should use a file input without capture instead.
 */
export async function getPhotosFromGallery(limit: number = 5): Promise<File[]> {
	if (!isNativeCameraAvailable()) {
		return [];
	}

	try {
		if (limit <= 1) {
			const photo = await Camera.getPhoto({
				source: CameraSource.Photos,
				resultType: CameraResultType.Uri,
				quality: 90,
				correctOrientation: true
			});
			if (!photo.path) return [];
			const file = await uriToFile(photo.path, photo.format ?? 'jpeg');
			return file ? [file] : [];
		}

		const { photos } = await Camera.pickImages({ limit, quality: 90 });
		if (!photos?.length) return [];

		const files: File[] = [];
		for (const p of photos) {
			if (p.path) {
				const file = await uriToFile(p.path, p.format ?? 'jpeg');
				if (file) files.push(file);
			}
		}
		return files;
	} catch (err) {
		if (isNotImplementedError(err)) throw err;
		console.error('[cameraOrGallery] getPhotosFromGallery:', err);
		return [];
	}
}

/**
 * Centralized "take photo" flow: use native camera when useNative is true (e.g. set at component mount),
 * otherwise trigger the fallback (e.g. file input). On native, if the plugin throws "not implemented", calls fallback.
 */
export async function triggerCamera(options: {
	useNative: boolean;
	onFile: (file: File) => void;
	fallbackTrigger: () => void;
}): Promise<void> {
	const { useNative, onFile, fallbackTrigger } = options;
	if (!useNative) {
		fallbackTrigger();
		return;
	}
	try {
		const file = await getPhotoFromCamera();
		if (file) onFile(file);
	} catch (err) {
		if (isNotImplementedError(err)) fallbackTrigger();
		else console.error('[cameraOrGallery] triggerCamera:', err);
	}
}

/**
 * Centralized "choose from gallery" flow: use native gallery when useNative is true (e.g. set at component mount),
 * otherwise trigger the fallback. On native, if the plugin throws "not implemented", calls fallback.
 */
export async function triggerGallery(options: {
	useNative: boolean;
	limit: number;
	onFiles: (files: File[]) => void;
	fallbackTrigger: () => void;
}): Promise<void> {
	const { useNative, limit, onFiles, fallbackTrigger } = options;
	if (!useNative) {
		fallbackTrigger();
		return;
	}
	try {
		const files = await getPhotosFromGallery(limit);
		if (files.length) onFiles(files);
	} catch (err) {
		if (isNotImplementedError(err)) fallbackTrigger();
		else console.error('[cameraOrGallery] triggerGallery:', err);
	}
}

/**
 * Convert a Capacitor file URI to a File using fetch (recommended for memory).
 */
async function uriToFile(path: string, format: string): Promise<File | null> {
	try {
		const webPath = Capacitor.convertFileSrc(path);
		const response = await fetch(webPath);
		if (!response.ok) return null;
		const blob = await response.blob();
		const ext = format === 'png' ? 'png' : 'jpeg';
		const type = blob.type || `image/${ext}`;
		const name = `photo_${Date.now()}.${ext}`;
		return new File([blob], name, { type, lastModified: Date.now() });
	} catch (err) {
		console.error('[cameraOrGallery] uriToFile:', err);
		return null;
	}
}
