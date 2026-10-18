import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { setAdvancedMode } from '$lib/stores/wallet/wallet-mode';

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
	beforeEach(() => {
		localStorage.removeItem('bittasker.wallet-advanced');
		setAdvancedMode(false);
	});

	afterEach(() => {
		cleanup();
		setAdvancedMode(false);
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

	it('keeps a switch between simple and advanced', async () => {
		hoisted.initialize.mockResolvedValue(undefined);
		hoisted.loadAssets.mockResolvedValue(undefined);
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { getByTestId } = render(component);
		const simple = getByTestId('mode-simple');
		const advanced = getByTestId('mode-advanced');
		expect(simple).toHaveAttribute('aria-pressed', 'true');
		await fireEvent.click(advanced);
		expect(advanced).toHaveAttribute('aria-pressed', 'true');
		expect(getByTestId('mode-simple')).toHaveAttribute('aria-pressed', 'false');
		await fireEvent.click(simple);
		expect(simple).toHaveAttribute('aria-pressed', 'true');
	}, 30_000);

	it('shows the error when init throws', async () => {
		hoisted.initialize.mockRejectedValue(new Error('Wallet init timed out'));
		const component = (await import('../../../../routes/(app)/(protected)/wallet/+page.svelte'))
			.default;
		const { findByRole } = render(component);
		expect(await findByRole('alert')).toHaveTextContent('Wallet init timed out');
	}, 30_000);
});
