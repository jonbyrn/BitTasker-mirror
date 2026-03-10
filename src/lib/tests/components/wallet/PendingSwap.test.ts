import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import PendingSwap from '$lib/components/wallet/PendingSwap.svelte';

const mockGenerateQrCodeUrl = vi.fn();

vi.mock('$lib/utils/helpers/generateQrCodeUrl', () => ({
	default: (...args: unknown[]) => mockGenerateQrCodeUrl(...args)
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

type LightningSwapMock = {
	id: string;
	status: string;
	invoice: string;
	amount: number;
	lockupTxHash?: string;
	claimTxHash?: string;
};

function makeLightningSwap(overrides: Partial<LightningSwapMock> = {}): LightningSwapMock {
	return {
		id: 'swap-1',
		status: 'swap.created',
		invoice: 'lnbc1testinvoice',
		amount: 21000,
		lockupTxHash: '0xlockup',
		claimTxHash: undefined,
		...overrides
	};
}

describe('PendingSwap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGenerateQrCodeUrl.mockResolvedValue('data:image/png;base64,abc123');
	});

	it('syncs expanded prop changes without needing real swap execution', async () => {
		const swap = makeLightningSwap();
		const { rerender } = render(PendingSwap, {
			props: {
				swap,
				swapType: 'lightning',
				expanded: false,
				onDeleteSwap: vi.fn().mockResolvedValue(undefined)
			}
		});

		expect(screen.queryByAltText('QR Code')).not.toBeInTheDocument();

		await rerender({
			swap,
			swapType: 'lightning',
			expanded: true,
			onDeleteSwap: vi.fn().mockResolvedValue(undefined)
		});

		await waitFor(() => expect(screen.getByAltText('QR Code')).toBeInTheDocument());

		await rerender({
			swap,
			swapType: 'lightning',
			expanded: false,
			onDeleteSwap: vi.fn().mockResolvedValue(undefined)
		});

		await waitFor(() => expect(screen.queryByAltText('QR Code')).not.toBeInTheDocument());
	});

	it('keeps QR generation stable per payload and regenerates only when payload changes', async () => {
		const swap = makeLightningSwap();
		const onDeleteSwap = vi.fn().mockResolvedValue(undefined);
		const { rerender } = render(PendingSwap, {
			props: {
				swap,
				swapType: 'lightning',
				expanded: false,
				onDeleteSwap
			}
		});

		// QR is generated when details are opened.
		expect(mockGenerateQrCodeUrl).toHaveBeenCalledTimes(0);

		// Local UI toggle should not regenerate for same payload
		const toggleButton = screen.getByRole('button', {
			name: 'wallet.swap.expand_details'
		});
		await fireEvent.click(toggleButton);
		await waitFor(() => expect(mockGenerateQrCodeUrl).toHaveBeenCalledTimes(1));
		expect(mockGenerateQrCodeUrl).toHaveBeenNthCalledWith(1, swap.invoice);
		await fireEvent.click(toggleButton);
		expect(mockGenerateQrCodeUrl).toHaveBeenCalledTimes(1);

		// Parent re-render with same payload should still be stable
		await rerender({
			swap,
			swapType: 'lightning',
			expanded: true,
			onDeleteSwap
		});
		expect(mockGenerateQrCodeUrl).toHaveBeenCalledTimes(1);

		// New payload should trigger one additional generation
		const swapWithNewInvoice = makeLightningSwap({ id: 'swap-2', invoice: 'lnbc1newinvoice' });
		await rerender({
			swap: swapWithNewInvoice,
			swapType: 'lightning',
			expanded: true,
			onDeleteSwap
		});

		await waitFor(() => expect(mockGenerateQrCodeUrl).toHaveBeenCalledTimes(2));
		expect(mockGenerateQrCodeUrl).toHaveBeenLastCalledWith('lnbc1newinvoice');
	});

	it('catches copy handler failures and remains interactive', async () => {
		const swap = makeLightningSwap();
		const onCopyInvoice = vi.fn().mockRejectedValue(new Error('clipboard denied'));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		render(PendingSwap, {
			props: {
				swap,
				swapType: 'lightning',
				expanded: true,
				onCopyInvoice,
				onDeleteSwap: vi.fn().mockResolvedValue(undefined)
			}
		});

		const invoiceButton = await screen.findByRole('button', { name: /lnbc1testinvoice/i });
		await fireEvent.click(invoiceButton);

		await waitFor(() => expect(onCopyInvoice).toHaveBeenCalledWith('lnbc1testinvoice'));
		expect(errorSpy).toHaveBeenCalled();

		// Still interactive after error
		const collapseButton = screen.getByRole('button', { name: 'wallet.swap.collapse_details' });
		await fireEvent.click(collapseButton);
		await waitFor(() => expect(screen.queryByAltText('QR Code')).not.toBeInTheDocument());

		errorSpy.mockRestore();
	});

	it('shows and clears delete loading state around async deletion', async () => {
		const swap = makeLightningSwap();
		let resolveDelete!: () => void;
		const onDeleteSwap = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveDelete = () => resolve();
				})
		);

		render(PendingSwap, {
			props: {
				swap,
				swapType: 'lightning',
				expanded: false,
				onDeleteSwap
			}
		});

		const deleteButton = screen.getByTitle('wallet.swap.delete_swap');
		await fireEvent.click(deleteButton);

		expect(onDeleteSwap).toHaveBeenCalledWith('swap-1');
		expect(deleteButton).toBeDisabled();

		resolveDelete();
		await waitFor(() => expect(deleteButton).not.toBeDisabled());
	});
});
