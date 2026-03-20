import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';

import PaymentRequestModal from '$lib/components/wallet/PaymentRequestModal.svelte';

const mocks = vi.hoisted(() => ({
	generateQrCodeUrl: vi.fn().mockResolvedValue('data:image/png;base64,test'),
	showSuccessToast: vi.fn(),
	loadAssets: vi.fn().mockResolvedValue(undefined),
	transactionsStore: null as null | { set: (value: unknown[]) => void }
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	mocks.transactionsStore = writable([]);
	return {
		walletManager: {
			reverseSwapService: { getSwap: vi.fn().mockReturnValue(null) },
			chainSwapService: { getSwap: vi.fn().mockReturnValue(null) },
			submarineSwapService: { getSwap: vi.fn().mockReturnValue(null) },
			loadAssets: mocks.loadAssets
		},
		transactions: mocks.transactionsStore
	};
});

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		showSuccessToast: mocks.showSuccessToast
	}
}));

vi.mock('$lib/utils/helpers/generateQrCodeUrl', () => ({
	default: (...args: unknown[]) => mocks.generateQrCodeUrl(...args)
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50000)
	}
}));

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'Light', Medium: 'Medium' }
}));

vi.mock(
	'$lib/components/wallet/AddressAccordion.svelte',
	async () => await import('$lib/tests/components/stubs/AddressAccordionStub.svelte')
);

describe('PaymentRequestModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.generateQrCodeUrl.mockResolvedValue('data:image/png;base64,test');
		mocks.transactionsStore?.set([]);
	});

	it('generates a chain-qualified Rootstock QR payload for direct payments', async () => {
		render(PaymentRequestModal, {
			isOpen: true,
			onClose: vi.fn(),
			address: '0x1234567890123456789012345678901234567890',
			network: 'rootstock-bitcoin',
			amount: 1500
		});

		await waitFor(() => {
			expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
				'rsk:0x1234567890123456789012345678901234567890?value=15000000000000'
			);
		});
	});

	it('generates a chain-qualified BSC QR payload for direct payments', async () => {
		render(PaymentRequestModal, {
			isOpen: true,
			onClose: vi.fn(),
			address: '0x1234567890123456789012345678901234567890',
			network: 'usdt-bsc',
			amount: 0
		});

		await waitFor(() => {
			expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
				'bsc:0x1234567890123456789012345678901234567890'
			);
		});
	});

	it('preserves token-native BSC amount and memo in the QR payload at 6-decimal precision', async () => {
		render(PaymentRequestModal, {
			isOpen: true,
			onClose: vi.fn(),
			address: '0x1234567890123456789012345678901234567890',
			network: 'usdt-bsc',
			amount: 12.345678,
			memo: 'USDT request'
		});

		await waitFor(() => {
			expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
				'bsc:0x1234567890123456789012345678901234567890?amount=12.345678&memo=USDT+request'
			);
		});
	});

	it('uses the exact same BSC payment request string for the visible address accordion as for the QR payload', async () => {
		render(PaymentRequestModal, {
			isOpen: true,
			onClose: vi.fn(),
			address: '0x1234567890123456789012345678901234567890',
			network: 'usdt-bsc',
			amount: 7.5,
			memo: 'Parity'
		});

		await waitFor(() => {
			expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
				'bsc:0x1234567890123456789012345678901234567890?amount=7.5&memo=Parity'
			);
			expect(screen.getByTestId('address-accordion-stub')).toHaveTextContent(
				'bsc:0x1234567890123456789012345678901234567890?amount=7.5&memo=Parity'
			);
		});
	});

	it('marks a direct BSC request as paid when a matching confirmed USDT receive arrives after the modal opens', async () => {
		render(PaymentRequestModal, {
			isOpen: true,
			onClose: vi.fn(),
			address: '0x1234567890123456789012345678901234567890',
			network: 'usdt-bsc',
			amount: 7.5
		});

		await waitFor(() => {
			expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
				'bsc:0x1234567890123456789012345678901234567890?amount=7.5'
			);
		});

		mocks.transactionsStore?.set([
			{
				hash: '0xconfirmed',
				from: '0xsender',
				to: '0xrecipient',
				value: '7.5',
				timestamp: new Date(Date.now() + 1000).toISOString(),
				status: {
					label: 'wallet.transaction.status.confirmed',
					icon: null,
					color: 'success'
				},
				network: 'bsc',
				type: 'receive',
				displayType: 'receive',
				borderColor: 'success',
				iconConfig: {
					base: null,
					overlay: null
				},
				title: 'wallet.transaction.receive',
				networkIcon: '/images/chains/Binance-logo.svg',
				networkDisplayName: 'Binance Smart Chain',
				explorerUrl: 'https://testnet.bscscan.com/tx/0xconfirmed',
				feeSats: 0,
				balanceAfter: 7.5,
				amountUnit: 'USDT',
				feeUnit: 'USDT',
				balanceUnit: 'USDT'
			}
		]);

		await waitFor(() => {
			expect(mocks.showSuccessToast).toHaveBeenCalledWith(
				'wallet.payment_request.payment_received'
			);
			expect(mocks.loadAssets).toHaveBeenCalled();
		});
	});

	it('renders the direct BSC warning copy alongside the explicit USDT on BSC label', async () => {
		render(PaymentRequestModal, {
			isOpen: true,
			onClose: vi.fn(),
			address: '0x1234567890123456789012345678901234567890',
			network: 'usdt-bsc',
			amount: 0
		});

		await waitFor(() => {
			expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
				'bsc:0x1234567890123456789012345678901234567890'
			);
		});

		expect(screen.getByText('USDT on BSC')).toBeInTheDocument();
		expect(screen.getByText('Only send USDT on BSC to this payment request.')).toBeInTheDocument();
	});

	it('normalizes the plain bsc alias onto the canonical USDT on BSC request payload and label', async () => {
		render(PaymentRequestModal, {
			isOpen: true,
			onClose: vi.fn(),
			address: '0x1234567890123456789012345678901234567890',
			network: 'bsc',
			amount: 2.5,
			memo: 'Alias'
		});

		await waitFor(() => {
			expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
				'bsc:0x1234567890123456789012345678901234567890?amount=2.5&memo=Alias'
			);
			expect(screen.getByTestId('address-accordion-stub')).toHaveTextContent(
				'bsc:0x1234567890123456789012345678901234567890?amount=2.5&memo=Alias'
			);
		});

		expect(screen.getByText('USDT on BSC')).toBeInTheDocument();
		expect(screen.getByText('Only send USDT on BSC to this payment request.')).toBeInTheDocument();
	});

	describe('URI Generation with chain qualifiers', () => {
		it('should generate proper chain-qualified BSC URIs', async () => {
			render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
				network: 'usdt-bsc',
				amount: 50.5
			});

			await waitFor(() => {
				expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
					'bsc:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd?amount=50.5'
				);
			});
		});

		it('should include encoded memo in BSC URI', async () => {
			render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 10.0,
				memo: 'Invoice for services'
			});

			await waitFor(() => {
				expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
					expect.stringContaining('memo=Invoice+for+services')
				);
			});
		});

		it('should preserve RSK chain qualifier', async () => {
			render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'rootstock-bitcoin',
				amount: 0
			});

			await waitFor(() => {
				expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(expect.stringContaining('rsk:'));
			});
		});
	});

	describe('QR Code generation matching visible address', () => {
		it('should match QR payload with displayed address for USDT requests', async () => {
			render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 25.75,
				memo: 'Testing'
			});

			await waitFor(() => {
				const qrPayload =
					'bsc:0x1234567890123456789012345678901234567890?amount=25.75&memo=Testing';
				expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(qrPayload);
				expect(screen.getByTestId('address-accordion-stub')).toHaveTextContent(qrPayload);
			});
		});

		it('should sync QR code and displayed address when amount changes', async () => {
			const { rerender } = render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 10.0
			});

			await waitFor(() => {
				expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
					'bsc:0x1234567890123456789012345678901234567890?amount=10'
				);
			});

			await rerender({
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 25.5
			});

			await waitFor(() => {
				expect(mocks.generateQrCodeUrl).toHaveBeenCalledWith(
					'bsc:0x1234567890123456789012345678901234567890?amount=25.5'
				);
			});
		});
	});

	describe('Network badge display', () => {
		it('should display USDT on BSC badge for BSC requests', async () => {
			render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 0
			});

			await waitFor(() => {
				expect(screen.getByText('USDT on BSC')).toBeInTheDocument();
			});
		});

		it('should display appropriate warning for USDT on BSC', async () => {
			render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 15.0
			});

			await waitFor(() => {
				expect(
					screen.getByText('Only send USDT on BSC to this payment request.')
				).toBeInTheDocument();
			});
		});

		it('should show correct badge for Rootstock network', async () => {
			render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'rootstock-bitcoin',
				amount: 0
			});

			await waitFor(() => {
				expect(mocks.generateQrCodeUrl).toHaveBeenCalled();
			});

			// Should display Rootstock/rBTC badge
			expect(screen.queryByText('USDT on BSC')).not.toBeInTheDocument();
		});
	});

	describe('Payment detection and confirmation', () => {
		it('should detect matching USDT transaction on BSC', async () => {
			render(PaymentRequestModal, {
				isOpen: true,
				onClose: vi.fn(),
				address: '0x1234567890123456789012345678901234567890',
				network: 'usdt-bsc',
				amount: 30.5
			});

			await waitFor(() => {
				expect(mocks.generateQrCodeUrl).toHaveBeenCalled();
			});

			mocks.transactionsStore?.set([
				{
					hash: '0xbsctx',
					from: '0xsender',
					to: '0x1234567890123456789012345678901234567890',
					value: '30.5',
					timestamp: new Date().toISOString(),
					status: { label: 'wallet.transaction.status.confirmed', icon: null, color: 'success' },
					network: 'bsc',
					type: 'receive',
					displayType: 'receive',
					borderColor: 'success',
					iconConfig: { base: null, overlay: null },
					title: 'wallet.transaction.receive',
					networkIcon: '/images/chains/Binance-logo.svg',
					networkDisplayName: 'Binance Smart Chain',
					explorerUrl: 'https://testnet.bscscan.com/tx/0xbsctx',
					feeSats: 0,
					balanceAfter: 30.5,
					amountUnit: 'USDT',
					feeUnit: 'USDT',
					balanceUnit: 'USDT'
				}
			]);

			await waitFor(() => {
				expect(mocks.showSuccessToast).toHaveBeenCalledWith(
					'wallet.payment_request.payment_received'
				);
			});
		});
	});
});
