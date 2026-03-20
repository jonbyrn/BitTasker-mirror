import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

import BalanceCard from '$lib/components/wallet/BalanceCard.svelte';

const mocks = vi.hoisted(() => ({
	setActiveNetwork: vi.fn(),
	setSelectedAsset: vi.fn(),
	loadAssets: vi.fn().mockResolvedValue(undefined),
	showSuccessToast: vi.fn(),
	showErrorToast: vi.fn(),
	clearCaches: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.learn_more': 'Learn more',
		'wallet.show_balances': 'Show balances',
		'wallet.hide_balances': 'Hide balances',
		'wallet.show': 'Show',
		'wallet.refresh_balance': 'Refresh balance',
		'wallet.balance_refreshed': 'Balance refreshed',
		'wallet.refresh_failed': 'Refresh failed',
		'wallet.sats': 'Sats',
		'wallet.usd': 'USD',
		'wallet.bitcoin': 'Bitcoin',
		'wallet.btc': 'BTC',
		'wallet.coming_soon': 'Coming soon'
	};

	return {
		t: readable((key: string) => translations[key] ?? key)
	};
});

vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');

	const walletStore = writable({
		bsc: {
			formattedUsdtBalance: '25.50'
		}
	});
	const totalBalances = writable({
		sats: 100000000,
		usd: 50000
	});
	const allAssets = writable([
		{
			assetId: 'rbtc',
			balance: 1,
			usdValue: 50000
		},
		{
			assetId: 'usdt',
			balance: 25.5,
			usdValue: 25.5
		}
	]);

	return {
		walletStore,
		totalBalances,
		allAssets,
		walletManager: {
			loadAssets: mocks.loadAssets
		},
		formatSats: (value: number) => new Intl.NumberFormat('en-US').format(value),
		setActiveNetwork: mocks.setActiveNetwork,
		setSelectedAsset: mocks.setSelectedAsset
	};
});

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: mocks.showSuccessToast,
		showErrorToast: mocks.showErrorToast
	}
}));

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'Light' }
}));

vi.mock('$lib/api/services/balanceHistory.service', () => ({
	default: {
		clearCaches: mocks.clearCaches
	}
}));

vi.mock(
	'$lib/components/wallet/BalanceHistory.svelte',
	async () => await import('$lib/tests/components/stubs/EmptyStub.svelte')
);

vi.mock(
	'~icons/mdi/help-circle',
	async () => await import('$lib/tests/components/stubs/EmptyStub.svelte')
);
vi.mock(
	'~icons/mdi/refresh',
	async () => await import('$lib/tests/components/stubs/EmptyStub.svelte')
);
vi.mock('~icons/mdi/eye', async () => await import('$lib/tests/components/stubs/EmptyStub.svelte'));
vi.mock(
	'~icons/mdi/eye-off',
	async () => await import('$lib/tests/components/stubs/EmptyStub.svelte')
);

describe('BalanceCard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders the canonical USDT on BSC rail label in the wallet-home USD accordion', () => {
		render(BalanceCard, { isLoading: false });

		expect(screen.getAllByText('USDT on BSC').length).toBeGreaterThan(0);
		expect(screen.queryByText('wallet.usdt_binance_chain')).toBeNull();
	});

	it('selects the BSC USDT history rail when the USD accordion is opened', async () => {
		render(BalanceCard, { isLoading: false });

		const usdRailButton = screen.getByRole('button', { name: /^USD/i });
		await fireEvent.click(usdRailButton);

		expect(mocks.setActiveNetwork).toHaveBeenCalledWith('bsc');
		expect(mocks.setSelectedAsset).toHaveBeenCalledWith('USDT');
	});
});
