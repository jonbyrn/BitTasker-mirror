/**
 * Tests for ProfileSetup:
 * 1. Blob URL is not created on every render (single URL per selected file, revoked on clear/unmount).
 * 2. When user removes the profile image, parent state is cleared (files become empty).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
import { tick } from 'svelte';

vi.mock('$lib/nostr/profile', () => ({
	publishProfileMetadata: vi.fn(),
	publishMultipleImages: vi.fn(),
	subscribeToProfileUpdates: vi.fn().mockResolvedValue(() => {}),
	publishSkillsUpdate: vi.fn()
}));

vi.mock('$lib/api/services/upload.service', () => ({
	default: { uploadProfileImage: vi.fn() }
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key) };
});

vi.mock('$lib/components/SkillsMultiselect.svelte', () => ({
	default: vi.fn(() => null)
}));

function createMockFile(name = 'test.png', type = 'image/png'): File {
	return new File(['x'], name, { type });
}

describe('ProfileSetup blob URL and remove behavior', () => {
	let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
	let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

	const noop = () => {};
	const defaultProps = {
		nextStep: noop,
		prevStep: noop,
		currentStep: 1,
		totalSteps: 6
	};

	beforeEach(() => {
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
		createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob) => {
			void obj;
			return `blob:mock-${Math.random()}`;
		});
		revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	});

	afterEach(() => {
		createObjectURLSpy?.mockRestore();
		revokeObjectURLSpy?.mockRestore();
		cleanup();
	});

	it('creates at most one blob URL per selected file across re-renders', async () => {
		const { container, getByTestId } = render(ProfileSetup, { props: defaultProps });

		await tick();

		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
		if (!fileInput) throw new Error('File input not found');

		const file = createMockFile();
		Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
		fireEvent.change(fileInput);

		await tick();

		const callsAfterSelect = createObjectURLSpy.mock.calls.length;
		expect(callsAfterSelect).toBeGreaterThanOrEqual(1);

		// Cause re-renders by typing in display name
		const displayNameInput = getByTestId('onboarding-display-name');
		if (displayNameInput) {
			fireEvent.input(displayNameInput, { target: { value: 'A' } });
			await tick();
			fireEvent.input(displayNameInput, { target: { value: 'AB' } });
			await tick();
		}

		// Should not have created a new blob URL on each re-render (fix: one URL per file)
		expect(createObjectURLSpy.mock.calls.length).toBe(callsAfterSelect);
	});

	it('clears parent state when user removes the profile image so files become empty', async () => {
		const { container, getByRole } = render(ProfileSetup, { props: defaultProps });

		await tick();

		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
		if (!fileInput) throw new Error('File input not found');

		const file = createMockFile();
		Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
		fireEvent.change(fileInput);

		await tick();

		// Remove button is in Uploader (aria-label from translation key)
		const removeButton = getByRole('button', {
			name: /remove_file|common\.components\.uploader\.remove_file/i
		});
		if (!removeButton) throw new Error('Remove button not found');

		removeButton.click();
		await tick();

		// After remove, parent should clear state: preview should be gone (no image in upload area)
		const previewImg = container.querySelector('.rounded-lg.object-cover[src^="blob:"]');
		expect(previewImg).toBeNull();
	});

	it('revokes blob URL when component unmounts with a selected file', async () => {
		const { container, unmount } = render(ProfileSetup, { props: defaultProps });

		await tick();

		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
		if (!fileInput) throw new Error('File input not found');

		const file = createMockFile();
		Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
		fireEvent.change(fileInput);

		await tick();

		const revokeCountBeforeUnmount = revokeObjectURLSpy.mock.calls.length;
		unmount();

		// Should revoke on unmount (at least one more call after unmount)
		expect(revokeObjectURLSpy.mock.calls.length).toBeGreaterThan(revokeCountBeforeUnmount);
	});
});
