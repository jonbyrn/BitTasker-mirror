import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	UPLOAD_TIMEOUT_MS,
	UploadTimeoutError,
	assertUsableUploadResult,
	clearFormDataContentType,
	fileWithResolvedMime,
	isUploadTimeout,
	resolveUploadMime,
	takeFileSelection,
	withTimeout
} from '$lib/utils/media/upload-file';
import { validateImageFile } from '$lib/utils/imageCompression';

describe('upload file selection', () => {
	it('reads a change or input selection once', () => {
		const input = document.createElement('input');
		input.type = 'file';
		const file = new File(['png'], 'shot.png', { type: '' });
		const list = {
			0: file,
			length: 1,
			item: (index: number) => (index === 0 ? file : null)
		} as unknown as FileList;
		Object.defineProperty(input, 'files', { configurable: true, value: list });

		const first = takeFileSelection(input);
		expect(first).toHaveLength(1);
		expect(first?.[0].name).toBe('shot.png');
		expect(takeFileSelection(input)).toBeNull();
	});

	it('ignores an empty file input', () => {
		const input = document.createElement('input');
		input.type = 'file';
		expect(takeFileSelection(input)).toBeNull();
	});
});

describe('upload mime sniffing', () => {
	it('treats a Linux Chrome PNG with an empty type as an image', () => {
		const file = new File(['png'], 'evidence.png', { type: '' });
		expect(resolveUploadMime(file)).toBe('image/png');
		expect(fileWithResolvedMime(file).type).toBe('image/png');
		expect(validateImageFile(file).isValid).toBe(true);
	});

	it('sniffs octet-stream jpg and mp4', () => {
		expect(resolveUploadMime({ name: 'avatar.jpg', type: 'application/octet-stream' })).toBe(
			'image/jpeg'
		);
		expect(resolveUploadMime({ name: 'clip.mp4', type: '' })).toBe('video/mp4');
	});

	it('keeps a real browser mime', () => {
		expect(resolveUploadMime({ name: 'a.png', type: 'image/png' })).toBe('image/png');
	});
});

describe('upload request', () => {
	it('drops Content-Type for FormData so the browser can set the boundary', () => {
		const headers = {
			delete(name: string) {
				delete (headers as Record<string, unknown>)[name];
			},
			set(name: string, value: unknown) {
				if (value === false) {
					delete (headers as Record<string, unknown>)[name];
					return;
				}
				(headers as Record<string, unknown>)[name] = value;
			},
			'Content-Type': 'multipart/form-data'
		};
		clearFormDataContentType({ data: new FormData(), headers });
		expect(headers['Content-Type']).toBeUndefined();
		expect(UPLOAD_TIMEOUT_MS).toBe(30_000);
	});

	it('rejects an image result with no url', () => {
		expect(() => assertUsableUploadResult({ type: 'image', url: '  ', key: 'k' })).toThrow(
			/no URL/
		);
		expect(() =>
			assertUsableUploadResult({ type: 'image', url: 'https://cdn.example/a.png', key: 'k' })
		).not.toThrow();
	});

	it('recognizes a hung request as a timeout', async () => {
		expect(isUploadTimeout(new UploadTimeoutError())).toBe(true);
		expect(isUploadTimeout({ message: 'timeout of 30000ms exceeded' })).toBe(true);
		expect(isUploadTimeout(new Error('Failed to upload a.png: Upload timed out'))).toBe(true);
		await expect(withTimeout(new Promise(() => {}), 5)).rejects.toBeInstanceOf(UploadTimeoutError);
	});
});

describe('upload error copy', () => {
	it('has an English and Spanish timeout and retry', () => {
		const en = JSON.parse(readFileSync('static/locales/en/common.json', 'utf8'));
		const es = JSON.parse(readFileSync('static/locales/es/common.json', 'utf8'));
		expect(en.common.components.media_uploader.upload_timed_out).toMatch(/timed out/i);
		expect(en.common.components.media_uploader.retry_upload).toMatch(/retry/i);
		expect(es.common.components.media_uploader.upload_timed_out.length).toBeGreaterThan(0);
		expect(es.common.components.media_uploader.retry_upload.length).toBeGreaterThan(0);
		expect(es.common.components.media_uploader.upload_timed_out).not.toBe(
			en.common.components.media_uploader.upload_timed_out
		);
	});
});
