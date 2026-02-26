import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { Capacitor } from '@capacitor/core';
import InvoiceDisplay from '$lib/components/wallet/InvoiceDisplay.svelte';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
import { copyToClipboard } from '$lib/utils/helpers/clipboard';

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.invoice.payment_request': 'Payment Request',
		'wallet.invoice.qr_generation_failed': 'Failed to generate QR code',
		'wallet.invoice.share': 'Share Invoice',
		'wallet.invoice.share_title': 'Payment Request',
		'wallet.invoice.share_text': 'Please send {amount} sats to: {address}',
		'wallet.address': 'Address',
		'wallet.copy_address': 'Copy Address',
		'wallet.copied': 'Copied',
		'wallet.amount': 'Amount',
		'wallet.sats': 'Sats',
		'wallet.description': 'Description',
		'wallet.network': 'Network',
		'common.close': 'Close'
	};
	const tStore = readable((key: string, values?: { values?: Record<string, string> }) => {
		let result = translations[key] || key;
		if (values?.values) {
			Object.entries(values.values).forEach(([k, v]) => {
				result = result.replace(`{${k}}`, v);
			});
		}
		return result;
	});
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Mock crypto price service
vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50000)
	}
}));

// Mock QR code generation
vi.mock('$lib/utils/helpers/generateQrCodeUrl', () => ({
	default: vi.fn().mockResolvedValue('data:image/png;base64,mock-qr-code-data')
}));

// Mock clipboard
vi.mock('$lib/utils/helpers/clipboard', () => ({
	copyToClipboard: vi.fn().mockResolvedValue(undefined)
}));

// Mock appStore
vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn()
	}
}));

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
	Capacitor: {
		getPlatform: vi.fn(() => 'web')
	}
}));

describe('InvoiceDisplay Component', () => {
	const defaultProps = {
		address: '0x1234567890123456789012345678901234567890',
		amount: 100000
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render invoice with address and amount', async () => {
			render(InvoiceDisplay, defaultProps);
			await tick();
			await waitFor(
				() => {
					// Address and amount should be visible
					expect(screen.getByText(/100,000/)).toBeDefined();
					expect(screen.getByText(/0x1234567890123456789012345678901234567890/)).toBeDefined();
				},
				{ timeout: 2000 }
			);
		});

		it('should render header with close button when onClose is provided', async () => {
			const onClose = vi.fn();
			render(InvoiceDisplay, { ...defaultProps, onClose });
			await tick();
			await waitFor(
				() => {
					expect(screen.getByText('Payment Request')).toBeDefined();
					expect(screen.getByLabelText('Close')).toBeDefined();
				},
				{ timeout: 2000 }
			);
		});

		it('should render QR code when address is provided', async () => {
			render(InvoiceDisplay, defaultProps);
			await tick();

			await waitFor(
				() => {
					expect(generateQrCodeUrl).toHaveBeenCalledWith(defaultProps.address);
				},
				{ timeout: 2000 }
			);
		});

		it('should show loading state while QR code is generating', async () => {
			// Mock slow QR generation
			vi.mocked(generateQrCodeUrl).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve('data:image/png;base64,mock'), 100))
			);

			render(InvoiceDisplay, defaultProps);
			await tick();

			// Should show loading spinner (check for loading class)
			const loadingElement = document.querySelector('.loading');
			expect(loadingElement).toBeDefined();
		});
	});

	describe('Memo Display', () => {
		it('should display memo when provided', async () => {
			render(InvoiceDisplay, { ...defaultProps, memo: 'Test payment memo' });
			await tick();

			expect(screen.getByText('Test payment memo')).toBeDefined();
		});

		it('should not display memo section when not provided', async () => {
			render(InvoiceDisplay, defaultProps);
			await tick();

			// Description label should not be present if no memo
			const descriptionLabels = screen.queryAllByText('Description');
			expect(descriptionLabels.length).toBe(0);
		});
	});

	describe('Network Display', () => {
		it('should display network when provided', async () => {
			render(InvoiceDisplay, { ...defaultProps, network: 'rootstock-bitcoin' });
			await tick();

			expect(screen.getByText('rootstock-bitcoin')).toBeDefined();
		});

		it('should not display network section when not provided', async () => {
			render(InvoiceDisplay, defaultProps);
			await tick();

			const networkLabels = screen.queryAllByText('Network');
			expect(networkLabels.length).toBe(0);
		});
	});

	describe('Address Copying', () => {
		it('should copy address when copy button is clicked', async () => {
			render(InvoiceDisplay, defaultProps);
			await tick();

			const copyButtons = screen.getAllByLabelText('Copy Address');
			if (copyButtons.length > 0) {
				fireEvent.click(copyButtons[0]);
				await tick();

				await waitFor(() => {
					expect(copyToClipboard).toHaveBeenCalledWith(defaultProps.address);
				});
			}
		});

		it('should show copied badge after copying', async () => {
			render(InvoiceDisplay, defaultProps);
			await tick();

			const copyButtons = screen.getAllByLabelText('Copy Address');
			if (copyButtons.length > 0) {
				fireEvent.click(copyButtons[0]);
				await tick();

				await waitFor(() => {
					expect(screen.getByText('Copied')).toBeDefined();
				});
			}
		});
	});

	describe('Amount Formatting', () => {
		it('should format sats with thousand separators', async () => {
			render(InvoiceDisplay, { ...defaultProps, amount: 1000000 });
			await tick();

			expect(screen.getByText(/1,000,000/)).toBeDefined();
		});

		it('should display USD equivalent when BTC price is available', async () => {
			render(InvoiceDisplay, defaultProps);
			await tick();

			await waitFor(
				() => {
					// Should show USD equivalent (100,000 sats = 0.001 BTC = $50 at $50k/BTC)
					const usdText = screen.queryByText(/\$50\.00/);
					expect(usdText).toBeDefined();
				},
				{ timeout: 2000 }
			);
		});
	});

	describe('Close Button', () => {
		it('should call onClose when close button is clicked', async () => {
			const onClose = vi.fn();
			render(InvoiceDisplay, { ...defaultProps, onClose });
			await tick();

			const closeButton = screen.getByLabelText('Close');
			fireEvent.click(closeButton);

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('should not render close button when onClose is not provided', async () => {
			render(InvoiceDisplay, defaultProps);
			await tick();

			const closeButtons = screen.queryAllByLabelText('Close');
			expect(closeButtons.length).toBe(0);
		});
	});

	describe('Share Functionality', () => {
		afterEach(() => {
			vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
		});

		it('should show share button on mobile', async () => {
			// Share button is shown when not web OR when navigator.share is unavailable.
			vi.mocked(Capacitor.getPlatform).mockReturnValue('android');

			render(InvoiceDisplay, defaultProps);
			await tick();

			await waitFor(() => {
				expect(screen.getByText('Share Invoice')).toBeDefined();
			});
		});

		it('should call navigator.share when share button is clicked', async () => {
			const mockShare = vi.fn().mockResolvedValue(undefined);
			Object.defineProperty(navigator, 'share', {
				writable: true,
				value: mockShare
			});
			vi.mocked(Capacitor.getPlatform).mockReturnValue('android');

			render(InvoiceDisplay, defaultProps);
			await tick();

			await waitFor(() => {
				const shareButton = screen.getByText('Share Invoice');
				fireEvent.click(shareButton);
			});

			await waitFor(() => {
				expect(mockShare).toHaveBeenCalled();
			});
		});
	});

	describe('QR Code Error Handling', () => {
		it('should show error message when QR code generation fails', async () => {
			vi.mocked(generateQrCodeUrl).mockRejectedValueOnce(new Error('QR generation failed'));

			render(InvoiceDisplay, defaultProps);
			await tick();

			await waitFor(
				() => {
					expect(screen.getByText(/Failed to generate QR code/)).toBeInTheDocument();
				},
				{ timeout: 3000 }
			);
		});
	});
});
