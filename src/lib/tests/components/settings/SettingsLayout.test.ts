import { describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, waitFor } from '@testing-library/svelte';
import SettingsLayout from '../../../../routes/(app)/(protected)/settings/+layout.svelte';

const { getAllKeys } = vi.hoisted(() => ({
	getAllKeys: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

vi.mock('$lib/utils/nostrKeys', () => ({
	getAllKeys
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	prefetchPasskeyChallenge: vi.fn()
}));

describe('settings layout', () => {
	it('shows the settings page while keys are still loading', async () => {
		getAllKeys.mockImplementation(() => new Promise(() => undefined));
		const children = createRawSnippet(() => ({
			render: () => '<p data-testid="settings-cards">Login Info</p>'
		}));
		const { getByTestId, queryByTestId } = render(SettingsLayout, { children });

		await waitFor(() => expect(getByTestId('settings-cards').textContent).toContain('Login Info'));
		expect(queryByTestId('settings-title')).toBeTruthy();
	});
});
