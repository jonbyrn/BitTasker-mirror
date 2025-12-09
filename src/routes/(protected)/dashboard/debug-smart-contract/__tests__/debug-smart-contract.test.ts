import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import DebugSmartContractPage from '../+page.svelte';
import { escrow } from '$lib/utils/wallet/escrow';
import { walletStore } from '$lib/stores/wallet.store';
import { appStore } from '$lib/stores/app.store';
import { EscrowStatus } from '$lib/utils/enums/escrow.enum';
import type { EscrowData } from '$lib/types/wallet';

// Mock escrow module
vi.mock('$lib/utils/wallet/escrow', () => ({
	escrow: {
		getEscrow: vi.fn(),
		completeTask: vi.fn(),
		acceptTask: vi.fn(),
		cancelEscrow: vi.fn(),
		disputeTask: vi.fn(),
		proposeResolution: vi.fn(),
		acceptProposal: vi.fn(),
		resolveAfterTimelock: vi.fn(),
		getDisputeProposal: vi.fn(),
		ensureEscrowReady: vi.fn()
	}
}));

// Mock wallet store
const mockWalletState = {
	rsk: {
		connected: true,
		address: '0x1234567890123456789012345678901234567890',
		balance: '1000000000000000000'
	},
	bsc: {
		connected: false,
		address: null,
		balance: null
	}
};

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {
		subscribe: vi.fn((callback) => {
			callback(mockWalletState);
			return () => {};
		})
	}
}));

// Mock app store
vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn(),
		showInfoToast: vi.fn()
	}
}));

// Mock loadContractsByAddress
vi.mock('$lib/utils/wallet/loadContractsByAddress', () => ({
	loadContractsByAddress: vi.fn()
}));

// Mock determineContractState
vi.mock('$lib/utils/helpers/contractPermissions', () => ({
	determineContractState: vi.fn(() => ({
		status: EscrowStatus.Funded,
		permissions: {
			canComplete: true,
			canAccept: false,
			canCancel: true,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canResolveTimelock: false,
			canDelete: false
		}
	}))
}));

// Mock translation
const mockT = (key: string, options?: { values?: Record<string, string | number> }) => {
	if (options?.values) {
		let result = key;
		Object.entries(options.values).forEach(([k, v]) => {
			result = result.replace(`{${k}}`, String(v));
		});
		return result;
	}
	return key;
};

vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: (fn: (value: any) => void) => {
			fn(mockT);
			return () => {};
		}
	},
	locale: { subscribe: vi.fn(() => () => {}) }
}));

// Mock getErrorMessage
vi.mock('$lib/utils/wallet/contractErrorHandler', () => ({
	getErrorMessage: vi.fn((error) => (error instanceof Error ? error.message : 'Unknown error'))
}));

describe('Debug Smart Contract Page Integration', () => {
	const mockContract: EscrowData = {
		id: '1',
		client: '0x1234567890123456789012345678901234567890',
		freelancer: '0x0987654321098765432109876543210987654321',
		baseAmount: '1.0',
		clientFee: '0.025',
		freelancerFee: '0.025',
		totalAmount: '1.05',
		status: EscrowStatus.Funded,
		estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
		estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
		completionTime: 0,
		timelockExpiry: 0,
		clientFeeTier: 1,
		freelancerFeeTier: 1,
		createdAt: Math.floor(Date.now() / 1000) - 3600,
		lastUpdated: Date.now()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Mock localStorage
		Object.defineProperty(window, 'localStorage', {
			value: {
				getItem: vi.fn(() => null),
				setItem: vi.fn(),
				removeItem: vi.fn(),
				clear: vi.fn()
			},
			writable: true
		});
	});

	describe('Contract Function Execution', () => {
		it('should call escrow.completeTask when complete button is clicked', async () => {
			const mockCompleteTask = vi.fn().mockResolvedValue({
				hash: '0x123',
				wait: vi.fn().mockResolvedValue({})
			});

			(escrow.completeTask as any) = mockCompleteTask;

			const { loadContractsByAddress } = await import(
				'$lib/utils/wallet/loadContractsByAddress'
			);
			(loadContractsByAddress as any).mockResolvedValue([mockContract]);

			render(DebugSmartContractPage);

			// Wait for contracts to load
			await waitFor(() => {
				expect(screen.getByText(/contract/i)).toBeInTheDocument();
			});

			const completeButton = screen.getByRole('button', { name: /complete task/i });
			await fireEvent.click(completeButton);

			await waitFor(() => {
				expect(mockCompleteTask).toHaveBeenCalledWith('1');
			});
		});

		it('should handle contract revert errors gracefully', async () => {
			const mockError = new Error('Contract execution reverted');
			(escrow.completeTask as any) = vi.fn().mockRejectedValue(mockError);

			const { loadContractsByAddress } = await import(
				'$lib/utils/wallet/loadContractsByAddress'
			);
			(loadContractsByAddress as any).mockResolvedValue([mockContract]);

			render(DebugSmartContractPage);

			await waitFor(() => {
				expect(screen.getByText(/contract/i)).toBeInTheDocument();
			});

			const completeButton = screen.getByRole('button', { name: /complete task/i });
			await fireEvent.click(completeButton);

			await waitFor(() => {
				expect(appStore.showErrorToast).toHaveBeenCalled();
			});
		});

		it('should refresh contract data after successful execution', async () => {
			const mockGetEscrow = vi.fn().mockResolvedValue({
				...mockContract,
				status: EscrowStatus.Completed
			});

			(escrow.getEscrow as any) = mockGetEscrow;
			(escrow.completeTask as any) = vi.fn().mockResolvedValue({
				hash: '0x123',
				wait: vi.fn().mockResolvedValue({})
			});

			const { loadContractsByAddress } = await import(
				'$lib/utils/wallet/loadContractsByAddress'
			);
			(loadContractsByAddress as any).mockResolvedValue([mockContract]);

			render(DebugSmartContractPage);

			await waitFor(() => {
				expect(screen.getByText(/contract/i)).toBeInTheDocument();
			});

			const completeButton = screen.getByRole('button', { name: /complete task/i });
			await fireEvent.click(completeButton);

			await waitFor(() => {
				// Should reload contracts after execution
				expect(loadContractsByAddress).toHaveBeenCalledTimes(2); // Initial load + refresh
			});
		});
	});

	describe('Multiple Wallet Addresses', () => {
		it('should load contracts for all connected wallet addresses', async () => {
			const { loadContractsByAddress } = await import(
				'$lib/utils/wallet/loadContractsByAddress'
			);
			(loadContractsByAddress as any).mockResolvedValue([mockContract]);

			render(DebugSmartContractPage);

			await waitFor(() => {
				expect(loadContractsByAddress).toHaveBeenCalled();
			});
		});
	});

	describe('Safety Override', () => {
		it('should persist safety override state in localStorage', async () => {
			const setItemSpy = vi.spyOn(window.localStorage, 'setItem');

			const { loadContractsByAddress } = await import(
				'$lib/utils/wallet/loadContractsByAddress'
			);
			(loadContractsByAddress as any).mockResolvedValue([]);

			render(DebugSmartContractPage);

			await waitFor(() => {
				// Safety override state should be saved
				expect(setItemSpy).toHaveBeenCalledWith(
					'debug-safety-override',
					expect.any(String)
				);
			});
		});
	});
});

