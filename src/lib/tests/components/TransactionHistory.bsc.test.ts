import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

const createMockIcon = vi.hoisted(() => () => 'svg');

vi.mock('~icons/mdi/arrow-up-bold', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/arrow-down-bold', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/file-document-outline', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/check', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/chevron-down', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/check-all', () => ({ default: createMockIcon }));
vi.mock('~icons/mdi/close', () => ({ default: createMockIcon }));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'wallet.transaction.network.rootstock_bitcoin') return 'Rootstock (Bitcoin)';
			if (key === 'wallet.transaction.network.bsc') return 'BSC';
			if (key === 'wallet.transaction.network.lightning_bitcoin') return 'Lightning Bitcoin';
			if (key === 'wallet.sent') return 'Sent';
			if (key === 'wallet.tx_fee') return 'Fee';
			if (key === 'wallet.balance_after') return 'Balance after';
			if (key === 'wallet.all_networks') return 'All networks';
			if (key === 'wallet.all') return 'All';
			if (key === 'wallet.received') return 'Received';
			if (key === 'wallet.transaction.type.contracts') return 'Contracts';
			if (key === 'wallet.total_transactions') return 'total transactions';
			return key;
		})
	};
});

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'light' }
}));

vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');

	const bscTransaction = {
		hash: '0xbscsend',
		from: '0x1111111111111111111111111111111111111111',
		to: '0x2222222222222222222222222222222222222222',
		value: '1',
		timestamp: '2026-03-13T12:00:00Z',
		status: { label: 'Confirmed', icon: createMockIcon, color: 'text-success' },
		network: 'bsc' as const,
		type: 'send' as const,
		displayType: 'send' as const,
		borderColor: 'warning' as const,
		iconConfig: { base: createMockIcon, overlay: null },
		title: 'wallet.sent',
		networkIcon: '/images/chains/Binance-logo.svg',
		networkDisplayName: 'Binance Smart Chain',
		explorerUrl: 'https://testnet.bscscan.com/tx/0xbscsend',
		feeSats: 0.025,
		balanceAfter: 25.5,
		amountUnit: 'USDT',
		feeUnit: 'USDT',
		balanceUnit: 'USDT',
		tokenSymbol: 'USDT',
		tokenDecimals: 6
	};

	return {
		walletStore: writable({
			isConnected: true,
			isInitializing: false
		}),
		transactions: writable([bscTransaction]),
		walletManager: {
			initialize: vi.fn().mockResolvedValue(undefined),
			loadTransactions: vi.fn().mockResolvedValue(undefined)
		}
	};
});

import TransactionHistory from '$lib/components/wallet/TransactionHistory.svelte';

describe('TransactionHistory BSC rendering', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders explicit BSC asset and network badges with USDT-denominated amounts', async () => {
		const { container } = render(TransactionHistory, {
			props: {
				onOpenPaymentRequest: vi.fn()
			}
		});

		await waitFor(() => {
			expect(container.textContent).toContain('25.5 USDT');
		});

		expect(screen.getAllByText('USDT').length).toBeGreaterThan(0);
		expect(container.textContent).toContain('BSC');
		expect(container.textContent).toContain('- 1 USDT');
		expect(container.textContent).toContain('0.025 USDT');
		expect(container.textContent).toContain('25.5 USDT');
	});
});
