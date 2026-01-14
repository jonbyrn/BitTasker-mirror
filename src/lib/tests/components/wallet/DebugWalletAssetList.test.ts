import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import DebugWalletAssetList from '$lib/components/wallet/DebugWalletAssetList.svelte';
import { walletManager } from '$lib/stores/wallet.store';
import { appStore } from '$lib/stores/app.store';
import type { TokenBalance } from '$lib/types/wallet';

// Mock i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.debug_wallet.asset_list.title': 'All Assets',
		'wallet.debug_wallet.refresh': 'Refresh',
		'wallet.debug_wallet.error': 'Failed to load assets',
		'wallet.debug_wallet.no_assets': 'No assets found',
		'wallet.debug_wallet.no_assets_description': "You don't have any assets in your Rootstock wallet yet.",
		'wallet.debug_wallet.asset_list.native_token': 'Native Token',
		'wallet.debug_wallet.asset_list.erc20_token': 'ERC-20 Token',
		'wallet.debug_wallet.asset_list.balance': 'Balance',
		'wallet.debug_wallet.asset_list.usd_value': 'USD Value',
		'wallet.debug_wallet.asset_list.send': 'Send',
		'wallet.debug_wallet.asset_list.address': 'Address',
		'wallet.balance_refreshed': 'Balance refreshed successfully'
	};
	const tStore = readable((key: string) => translations[key] || key);
	return {
		t: tStore
	};
});

// Mock dependencies
vi.mock('$lib/stores/wallet.store', () => ({
	walletManager: {
		loadRSKTokenBalances: vi.fn()
	},
	formatAddress: vi.fn((addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`)
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

describe('DebugWalletAssetList', () => {
	const mockTokens: TokenBalance[] = [
		{
			address: 'native',
			name: 'Rootstock Bitcoin',
			symbol: 'RBTC',
			decimals: 18,
			balance: '1000000000000000000',
			formattedBalance: '1.0',
			isNative: true,
			icon: '₿'
		},
		{
			address: '0x1234567890123456789012345678901234567890',
			name: 'Tether USD',
			symbol: 'USDT',
			decimals: 18,
			balance: '500000000000000000',
			formattedBalance: '0.5',
			isNative: false
		}
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should render loading state initially', async () => {
		vi.mocked(walletManager.loadRSKTokenBalances).mockImplementation(
			() => new Promise(() => {}) // Never resolves
		);

		render(DebugWalletAssetList);

		// Check for loading spinner by class
		const loadingSpinner = document.querySelector('.loading.loading-spinner');
		expect(loadingSpinner).toBeInTheDocument();
	});

	it('should render token list when loaded', async () => {
		vi.mocked(walletManager.loadRSKTokenBalances).mockResolvedValue(mockTokens);

		render(DebugWalletAssetList);

		await waitFor(() => {
			expect(screen.getByText('Rootstock Bitcoin')).toBeInTheDocument();
			expect(screen.getByText('Tether USD')).toBeInTheDocument();
		});
	});

	it('should display token balances correctly', async () => {
		vi.mocked(walletManager.loadRSKTokenBalances).mockResolvedValue(mockTokens);

		render(DebugWalletAssetList);

		await waitFor(() => {
			expect(screen.getByText('1.0 RBTC')).toBeInTheDocument();
			expect(screen.getByText('0.5 USDT')).toBeInTheDocument();
		});
	});

	it('should show native token badge for RBTC', async () => {
		vi.mocked(walletManager.loadRSKTokenBalances).mockResolvedValue([mockTokens[0]]);

		render(DebugWalletAssetList);

		await waitFor(() => {
			const badge = screen.getByText('Native Token');
			expect(badge).toBeInTheDocument();
		});
	});

	it('should show ERC-20 token badge for tokens', async () => {
		vi.mocked(walletManager.loadRSKTokenBalances).mockResolvedValue([mockTokens[1]]);

		render(DebugWalletAssetList);

		await waitFor(() => {
			const badge = screen.getByText('ERC-20 Token');
			expect(badge).toBeInTheDocument();
		});
	});

	it('should call onSendToken when send button is clicked', async () => {
		const user = userEvent.setup();
		const onSendToken = vi.fn();

		vi.mocked(walletManager.loadRSKTokenBalances).mockResolvedValue([mockTokens[0]]);

		render(DebugWalletAssetList, { onSendToken });

		await waitFor(() => {
			expect(screen.getByText('Send')).toBeInTheDocument();
		});

		const sendButton = screen.getAllByText('Send')[0];
		await user.click(sendButton);

		expect(onSendToken).toHaveBeenCalledWith(mockTokens[0]);
	});

	it('should refresh tokens when refresh button is clicked', async () => {
		const user = userEvent.setup();

		vi.mocked(walletManager.loadRSKTokenBalances).mockResolvedValue(mockTokens);

		render(DebugWalletAssetList);

		await waitFor(() => {
			expect(screen.getByText('Rootstock Bitcoin')).toBeInTheDocument();
		});

		const refreshButton = screen.getByLabelText('Refresh');
		await user.click(refreshButton);

		expect(walletManager.loadRSKTokenBalances).toHaveBeenCalledTimes(2);
	});

	it('should display error message on load failure', async () => {
		const errorMessage = 'Failed to load tokens';
		vi.mocked(walletManager.loadRSKTokenBalances).mockRejectedValue(new Error(errorMessage));

		render(DebugWalletAssetList);

		await waitFor(() => {
			expect(screen.getByText(errorMessage)).toBeInTheDocument();
		});

		expect(appStore.showErrorToast).toHaveBeenCalled();
	});

	it('should show empty state when no tokens', async () => {
		vi.mocked(walletManager.loadRSKTokenBalances).mockResolvedValue([]);

		render(DebugWalletAssetList);

		await waitFor(() => {
			expect(screen.getByText('No assets found')).toBeInTheDocument();
		});
	});

	it('should display token address for ERC-20 tokens', async () => {
		vi.mocked(walletManager.loadRSKTokenBalances).mockResolvedValue([mockTokens[1]]);

		render(DebugWalletAssetList);

		await waitFor(() => {
			expect(screen.getByText('Address')).toBeInTheDocument();
		});
	});
});

