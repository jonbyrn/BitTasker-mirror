/**
 * Centralized camera and gallery logic for native (Capacitor) and web.
 * Single entry point for all camera-related functionality across the app.
 *
 * Use triggerCamera/triggerGallery for the full flow (native → fallback on "not implemented").
 * Use getPhotoFromCamera/getPhotosFromGallery when you need direct access.
 */

export {
	isNativeCameraAvailable,
	getPhotoFromCamera,
	getPhotosFromGallery,
	triggerCamera,
	triggerGallery,
	type CameraOrGallerySource
} from './cameraOrGallery';
