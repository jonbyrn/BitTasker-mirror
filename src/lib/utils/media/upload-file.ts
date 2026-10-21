/**
 * Shared image/video upload helpers.
 *
 * Linux Chrome's GTK file chooser does not dispatch `change` for a typed path
 * confirmed with Enter when the input is `display: none` (Tailwind `hidden`).
 * The input must stay in the layout. Mouse "Open" still fires `change`, so a
 * thumbnail can appear while the request itself never settles.
 *
 * Client image uploads do not build a Blossom or NIP-98 event. They POST
 * FormData to the API. Forcing `Content-Type: multipart/form-data` without a
 * boundary makes the parser wait for a delimiter that is not in the body, and
 * axios has no timeout, so the spinner never ends. There is no passkey wait
 * on this path.
 */

export const UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Covers the drop zone without `display: none`, so every GTK selection method
 * can fire `change` / `input` on the input itself.
 */
export const FILE_INPUT_CLASS = 'absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0';

const EXTENSION_MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	bmp: 'image/bmp',
	mp4: 'video/mp4',
	webm: 'video/webm',
	mov: 'video/quicktime',
	ogg: 'video/ogg',
	ogv: 'video/ogg'
};

export class UploadTimeoutError extends Error {
	constructor() {
		super('Upload timed out');
		this.name = 'UploadTimeoutError';
	}
}

export function isUploadTimeout(error: unknown): boolean {
	if (error instanceof UploadTimeoutError) return true;
	if (!error || typeof error !== 'object') return false;
	const named = error as { name?: string; code?: string; message?: string };
	if (named.name === 'UploadTimeoutError' || named.name === 'TimeoutError') return true;
	if (named.code === 'ECONNABORTED' || named.code === 'ERR_CANCELED') return true;
	const message = named.message ?? '';
	return /timeout of \d+ms exceeded|upload timed out/i.test(message);
}

export function resolveUploadMime(file: { name: string; type?: string }): string {
	const type = (file.type ?? '').trim().toLowerCase();
	if (type && type !== 'application/octet-stream') return type;
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	return EXTENSION_MIME[ext] || type || 'application/octet-stream';
}

export function isImageMime(mime: string): boolean {
	return mime.startsWith('image/');
}

export function isVideoMime(mime: string): boolean {
	return mime.startsWith('video/');
}

/** Copy the file when the browser left the MIME empty or as octet-stream. */
export function fileWithResolvedMime(file: File): File {
	const mime = resolveUploadMime(file);
	if (mime === file.type) return file;
	return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

const seenSelections = new WeakSet<FileList>();

/**
 * Read a file input from `change` or `input`. A second event for the same
 * FileList returns null so both listeners cannot upload twice.
 */
export function takeFileSelection(input: HTMLInputElement): File[] | null {
	const list = input.files;
	if (!list || list.length === 0) return null;
	if (seenSelections.has(list)) return null;
	seenSelections.add(list);
	return Array.from(list);
}

export function clearFormDataContentType(config: { data?: unknown; headers?: unknown }): void {
	if (typeof FormData === 'undefined' || !(config.data instanceof FormData)) return;
	const headers = config.headers as
		| {
				delete?: (name: string) => void;
				set?: (name: string, value: unknown) => void;
		  }
		| null
		| undefined;
	if (!headers) return;
	headers.delete?.('Content-Type');
	headers.delete?.('content-type');
	// Axios treats false as "do not send this header".
	headers.set?.('Content-Type', false);
}

export function assertUsableUploadResult(result: {
	type: string;
	url?: string;
	key?: string;
}): void {
	const url = result.url?.trim() ?? '';
	const key = result.key?.trim() ?? '';
	if (result.type === 'image' && !url) {
		throw new Error('Image upload returned no URL');
	}
	if (!url && !key) {
		throw new Error('Upload returned no file');
	}
}

export function withTimeout<T>(promise: Promise<T>, ms = UPLOAD_TIMEOUT_MS): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new UploadTimeoutError()), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}
