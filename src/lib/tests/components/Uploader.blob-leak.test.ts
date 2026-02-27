/**
 * Tests that Uploader does not leak blob URLs:
 * - Revokes blob URLs when a File is removed from the list (remove button)
 * - Revokes blob URLs on component unmount
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Uploader from '$lib/components/Uploader.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translate = (key: string) => key;
	return {
		t: readable(translate),
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

function createMockFile(name = 'test.png', type = 'image/png'): File {
	return new File(['x'], name, { type });
}

describe('Uploader blob URL lifecycle', () => {
	let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
	let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
	const createdUrls: string[] = [];

	beforeEach(() => {
		createdUrls.length = 0;
		// Ensure URL static methods exist (jsdom may not define them)
		if (typeof URL.createObjectURL === 'undefined') {
			(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(
				() => `blob:mock-${Math.random()}`
			) as (b: Blob) => string;
		}
		if (typeof URL.revokeObjectURL === 'undefined') {
			(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn() as (
				u: string
			) => void;
		}
		createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
			void blob;
			const url = `blob:mock-${Math.random()}`;
			createdUrls.push(url);
			return url;
		});
		revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	});

	afterEach(() => {
		createObjectURLSpy?.mockRestore();
		revokeObjectURLSpy?.mockRestore();
		cleanup();
	});

	it('revokes blob URLs when component unmounts when files contain File objects', async () => {
		const file = createMockFile();
		const { unmount } = render(Uploader, {
			props: {
				id: 'test',
				files: [file]
			}
		});

		expect(createObjectURLSpy).toHaveBeenCalledWith(file);
		expect(revokeObjectURLSpy).not.toHaveBeenCalled();

		unmount();

		expect(revokeObjectURLSpy).toHaveBeenCalled();
		const revokedUrls = revokeObjectURLSpy.mock.calls.map((c) => c[0]);
		expect(revokedUrls).toContain(createdUrls[0]);
	});

	it('revokes blob URL when file is removed via remove button', async () => {
		const file = createMockFile();
		const { getByRole } = render(Uploader, {
			props: {
				id: 'test',
				maxFiles: 1,
				files: [file],
				onRemove: vi.fn()
			}
		});

		expect(createObjectURLSpy).toHaveBeenCalledWith(file);
		const removeButton = getByRole('button', {
			name: /remove_file|common\.components\.uploader\.remove_file/i
		});
		expect(removeButton).toBeDefined();

		await removeButton.click();

		// After remove, the blob URL that was used for the removed File should be revoked
		expect(revokeObjectURLSpy).toHaveBeenCalled();
		const revokedUrls = revokeObjectURLSpy.mock.calls.map((c) => c[0]);
		expect(revokedUrls.some((u) => createdUrls.includes(u))).toBe(true);
	});

	it('does not create blob URLs for string (URL) files', () => {
		render(Uploader, {
			props: {
				id: 'test',
				files: ['https://example.com/image.png']
			}
		});

		expect(createObjectURLSpy).not.toHaveBeenCalled();
		expect(revokeObjectURLSpy).not.toHaveBeenCalled();
	});
});
