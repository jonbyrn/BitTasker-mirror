import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';

const hoisted = vi.hoisted(() => ({
	initialize: vi.fn(),
	loadAssets: vi.fn(),
	unlock: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/components/wallet/ReceivePaymentForm.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/wallet/AdvancedLightning.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/wallet/SendPaymentForm.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/wallet/WalletPaymentModal.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/stores/wallet/wallet-manager', () => ({
	walletManager: {
		initialize: hoisted.initialize,
		loadAssets: hoisted.loadAssets,
		unlock: hoisted.unlock
	}
}));

describe('wallet page init', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('calls wallet init when the page loads', async () => {
		hoisted.initialize.mockResolvedValue(undefined);
		hoisted.loadAssets.mockResolvedValue(undefined);
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		render(component);
		await waitFor(() => expect(hoisted.initialize).toHaveBeenCalled());
	}, 30_000);

	it('shows the error when init throws', async () => {
		hoisted.initialize.mockRejectedValue(new Error('Wallet init timed out'));
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { findByRole } = render(component);
		expect(await findByRole('alert')).toHaveTextContent('Wallet init timed out');
	}, 30_000);
});
