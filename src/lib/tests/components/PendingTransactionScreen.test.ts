import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import PendingTransactionScreen from '$lib/components/wallet/PendingTransactionScreen.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.send.amount': 'Amount',
		'wallet.network': 'Network',
		'wallet.send.address_or_invoice': 'Address or Invoice',
		'wallet.send.can_close_safely': 'You can close this safely.',
		'wallet.send.status.confirmed': 'Confirmed',
		'wallet.send.status.sending': 'Sending',
		'wallet.debug_wallet.send_form.estimated_time_remaining': 'Estimated time remaining',
		'wallet.view_explorer': 'View explorer',
		'wallet.sats': 'Sats',
		'common.buttons.close': 'Close'
	};

	return {
		t: readable((key: string) => translations[key] || key),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/stores/wallet.store', () => ({
	formatSats: (value: number) => new Intl.NumberFormat('en-US').format(value),
	formatUsd: (value: number) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}));

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn().mockResolvedValue(undefined),
	ImpactStyle: {
		Light: 'Light',
		Medium: 'Medium',
		Heavy: 'Heavy'
	}
}));

vi.mock('~icons/mdi/clock-outline', async () => await import('$lib/tests/components/stubs/EmptyStub.svelte'));
vi.mock('~icons/mdi/check-circle', async () => await import('$lib/tests/components/stubs/EmptyStub.svelte'));
vi.mock('~icons/mdi/loading', async () => await import('$lib/tests/components/stubs/EmptyStub.svelte'));
vi.mock('~icons/mdi/close', async () => await import('$lib/tests/components/stubs/EmptyStub.svelte'));
vi.mock('~icons/mdi/open-in-new', async () => await import('$lib/tests/components/stubs/EmptyStub.svelte'));

describe('PendingTransactionScreen', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders BSC pending sends with fixed-fee and rail labels', async () => {
		const { container } = render(PendingTransactionScreen, {
			amountSats: 12.3456,
			amountUSD: 12.3456,
			serviceFee: 0.25,
			address: '0x1234567890123456789012345678901234567890',
			network: 'usdt-bsc',
			txHash: '0xabc',
			swapId: null,
			networkOptions: {
				'usdt-bsc': {
					icon: '',
					name: 'BSC',
					confirmationTime: 5
				}
			},
			onClose: vi.fn()
		});

		await tick();

		expect(container.textContent).toContain('12.3456 USDT');
		expect(container.textContent).toContain('Service fee: 0.25 USDT');
		expect(container.textContent).toContain('USDT on BSC');
		expect(screen.getByText('USDT')).toBeInTheDocument();
		expect(screen.getAllByText('BSC').length).toBeGreaterThan(0);
	});

	it('treats the plain bsc alias as the BSC USDT rail', async () => {
		const { container } = render(PendingTransactionScreen, {
			amountSats: 9.5,
			amountUSD: 9.5,
			serviceFee: 0.1,
			address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
			network: 'bsc',
			txHash: '0xbeef',
			swapId: null,
			networkOptions: {
				bsc: {
					icon: '',
					name: 'BSC',
					confirmationTime: 5
				}
			},
			onClose: vi.fn()
		});

		await tick();

		expect(container.textContent).toContain('9.5 USDT');
		expect(container.textContent).toContain('Service fee: 0.1 USDT');
		expect(container.textContent).toContain('USDT on BSC');
		expect(container.textContent).not.toContain('Sats');
	});

	it('keeps Rootstock pending sends free of BSC-specific fee copy', async () => {
		const { container } = render(PendingTransactionScreen, {
			amountSats: 125000,
			amountUSD: 62.5,
			serviceFee: 0,
			address: '0x1234567890123456789012345678901234567890',
			network: 'rootstock-bitcoin',
			txHash: '0xdef',
			swapId: null,
			networkOptions: {
				'rootstock-bitcoin': {
					icon: '',
					name: 'Rootstock (Bitcoin)',
					confirmationTime: 30
				}
			},
			onClose: vi.fn()
		});

		await tick();

		expect(container.textContent).toContain('125,000 Sats');
		expect(container.textContent).toContain('rBTC');
		expect(container.textContent).toContain('Rootstock');
		expect(container.textContent).not.toContain('No BNB required');
		expect(container.textContent).not.toContain('Service fee:');
	});
});
