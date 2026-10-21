import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { user } from '$lib/stores/user.store';

const { fetchProfileMetadata, fetchKind0Profile, publishProfileMetadata, publishLocalIdentity } =
	vi.hoisted(() => ({
		fetchProfileMetadata: vi.fn(),
		fetchKind0Profile: vi.fn(),
		publishProfileMetadata: vi.fn(),
		publishLocalIdentity: vi.fn()
	}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

vi.mock('$lib/nostr/profile', () => ({
	fetchProfileMetadata,
	fetchKind0Profile,
	publishProfileMetadata,
	publishMultipleImages: vi.fn(),
	subscribeToProfileUpdates: vi.fn(),
	closeNostrPool: vi.fn()
}));

vi.mock('$lib/stores/profile-identity.store', () => ({
	publishLocalIdentity
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: { showSuccessToast: vi.fn(), showErrorToast: vi.fn() }
}));

vi.mock('$lib/api/services/upload.service', () => ({
	default: { uploadSingleFile: vi.fn() }
}));

import PersonalInfo from '$lib/components/profile/edit/PersonalInfo.svelte';

describe('PersonalInfo', () => {
	afterEach(() => {
		cleanup();
		user.reset();
		vi.clearAllMocks();
	});

	it('keeps a typed display name when profile metadata arrives late', async () => {
		user.updateProfile({ npub: 'ab'.repeat(32) });
		let resolveFetch: (profile: { display_name: string }) => void = () => undefined;
		fetchProfileMetadata.mockReturnValue(
			new Promise((resolve) => {
				resolveFetch = resolve;
			})
		);
		const { getByTestId } = render(PersonalInfo, { showSave: true });
		const input = getByTestId('display-name') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Ada Lovelace' } });
		resolveFetch({ display_name: 'Old Name' });
		await waitFor(() => {
			expect(input.value).toBe('Ada Lovelace');
		});
	});

	it('finishes save after the profile publish is accepted', async () => {
		user.updateProfile({ npub: 'cd'.repeat(32) });
		fetchProfileMetadata.mockResolvedValue({});
		fetchKind0Profile.mockResolvedValue({ display_name: 'Ada Lovelace' });
		publishProfileMetadata.mockResolvedValue({});
		publishLocalIdentity.mockResolvedValue(undefined);
		const { getByTestId } = render(PersonalInfo, { showSave: true });
		const input = getByTestId('display-name') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Ada Lovelace' } });
		await fireEvent.click(getByTestId('save-personal-info'));
		await waitFor(() => {
			expect(publishProfileMetadata).toHaveBeenCalled();
		});
		expect((getByTestId('save-personal-info') as HTMLButtonElement).disabled).toBe(false);
		expect(publishProfileMetadata.mock.calls[0]?.[0]).toMatchObject({
			display_name: 'Ada Lovelace'
		});
		expect(publishLocalIdentity).toHaveBeenCalled();
	});

	it('prefills the display name from the cached profile', async () => {
		user.updateProfile({
			npub: 'ab'.repeat(32),
			name: 'Grok Bot Automate 2',
			username: 'user_e1a27f184e3f'
		});
		fetchProfileMetadata.mockResolvedValue({});
		const { getByTestId } = render(PersonalInfo, { showSave: false });
		await waitFor(() => {
			expect((getByTestId('display-name') as HTMLInputElement).value).toBe('Grok Bot Automate 2');
		});
	});

	it('leaves the display name empty when the only cached label is a generated account name', async () => {
		user.updateProfile({
			npub: 'ef'.repeat(32),
			username: 'user_e1a27f184e3f'
		});
		fetchProfileMetadata.mockResolvedValue({});
		const { getByTestId } = render(PersonalInfo, { showSave: false });
		await waitFor(() => {
			expect(fetchProfileMetadata).toHaveBeenCalled();
		});
		expect((getByTestId('display-name') as HTMLInputElement).value).toBe('');
	});
});
