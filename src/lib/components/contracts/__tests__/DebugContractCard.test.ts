/**
 * Component rendering tests for DebugContractCard
 * 
 * These tests run in a real browser environment using Vitest Browser Mode.
 * Business logic tests are in DebugContractCard.logic.test.ts
 * 
 * This test file is configured to run in browser mode via the 'component' project
 * in vite.config.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import DebugContractCard from '../DebugContractCard.svelte';
import type { EscrowData } from '$lib/types/wallet';
import type { ContractPermissions } from '$lib/types/contract';
import { EscrowStatus } from '$lib/utils/enums/escrow.enum';

// Mock translation
const mockT = (key: string, options?: { values?: Record<string, string> }) => {
	if (options?.values) {
		let result = key;
		Object.entries(options.values).forEach(([k, v]) => {
			result = result.replace(`{${k}}`, v);
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

// Mock ConfirmModal
vi.mock('$lib/components/ConfirmModal.svelte', () => ({
	default: vi.fn(() => ({ $$: { ctx: [] } }))
}));

// Mock status formatter
vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getStatusColorClass: vi.fn(() => 'badge-primary'),
	getStatusTranslationKey: vi.fn(() => 'dashboard.contracts.status.funded')
}));

describe('DebugContractCard Component', () => {
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

	const mockPermissions: ContractPermissions = {
		canComplete: true,
		canAccept: false,
		canCancel: true,
		canDispute: false,
		canPropose: false,
		canAcceptProposal: false,
		canResolveTimelock: false,
		canDelete: false
	};

	const defaultProps = {
		contract: mockContract,
		permissions: mockPermissions,
		isClient: true,
		isFreelancer: false,
		currentAddress: '0x1234567890123456789012345678901234567890',
		isExpanded: false,
		safetyOverride: false,
		isExecuting: false,
		onToggleRawData: vi.fn(),
		onExecuteFunction: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Zero Value Check', () => {
		it('should disable all buttons when contract value is zero', () => {
			const zeroValueContract = {
				...mockContract,
				baseAmount: '0'
			};

			render(DebugContractCard, {
				props: {
					...defaultProps,
					contract: zeroValueContract
				}
			});

			const buttons = screen.getAllByRole('button');
			const actionButtons = buttons.filter(
				(btn) =>
					btn.textContent?.includes('Complete') ||
					btn.textContent?.includes('Accept') ||
					btn.textContent?.includes('Cancel') ||
					btn.textContent?.includes('Dispute')
			);

			actionButtons.forEach((button) => {
				expect(button).toBeDisabled();
			});
		});

		it('should show tooltip for zero value disabled buttons', () => {
			const zeroValueContract = {
				...mockContract,
				baseAmount: '0'
			};

			render(DebugContractCard, {
				props: {
					...defaultProps,
					contract: zeroValueContract
				}
			});

			const completeButton = screen.getByRole('button', { name: /complete task/i });
			expect(completeButton).toHaveAttribute('title');
		});
	});

	describe('Safety Override', () => {
		it('should enable buttons when safety override is active (except zero value)', () => {
			render(DebugContractCard, {
				props: {
					...defaultProps,
					permissions: { ...mockPermissions, canAccept: false },
					safetyOverride: true
				}
			});

			const acceptButton = screen.getByRole('button', { name: /accept task/i });
			// Should be enabled with override (if not zero value)
			expect(acceptButton).not.toBeDisabled();
		});

		it('should still disable buttons for zero value even with override', () => {
			const zeroValueContract = {
				...mockContract,
				baseAmount: '0'
			};

			render(DebugContractCard, {
				props: {
					...defaultProps,
					contract: zeroValueContract,
					safetyOverride: true // Override enabled
				}
			});

			const buttons = screen.getAllByRole('button');
			const actionButtons = buttons.filter(
				(btn) =>
					btn.textContent?.includes('Complete') || btn.textContent?.includes('Accept')
			);

			actionButtons.forEach((button) => {
				expect(button).toBeDisabled(); // Still disabled due to zero value
			});
		});
	});

	describe('Permission-Based Button States', () => {
		it('should disable buttons based on permissions', () => {
			const restrictedPermissions: ContractPermissions = {
				canComplete: false,
				canAccept: false,
				canCancel: false,
				canDispute: false,
				canPropose: false,
				canAcceptProposal: false,
				canResolveTimelock: false,
				canDelete: false
			};

			render(DebugContractCard, {
				props: {
					...defaultProps,
					permissions: restrictedPermissions
				}
			});

			const completeButton = screen.queryByRole('button', { name: /complete task/i });
			if (completeButton) {
				expect(completeButton).toBeDisabled();
			}
		});

		it('should show correct tooltip for permission-disabled buttons', () => {
			render(DebugContractCard, {
				props: {
					...defaultProps,
					permissions: { ...mockPermissions, canComplete: false },
					isClient: false,
					isFreelancer: true,
					currentAddress: '0x0987654321098765432109876543210987654321'
				}
			});

			const completeButton = screen.getByRole('button', { name: /complete task/i });
			expect(completeButton).toHaveAttribute('title');
		});
	});

	describe('Function Execution', () => {
		it('should call onExecuteFunction when button is clicked', async () => {
			const mockExecuteFunction = vi.fn().mockResolvedValue(undefined);

			render(DebugContractCard, {
				props: {
					...defaultProps,
					onExecuteFunction: mockExecuteFunction,
					safetyOverride: true // Skip confirmation
				}
			});

			const cancelButton = screen.getByRole('button', { name: /cancel/i });
			await fireEvent.click(cancelButton);

			await waitFor(() => {
				expect(mockExecuteFunction).toHaveBeenCalledWith(
					mockContract.id,
					'cancelEscrow'
				);
			});
		});

		it('should show loading state during function execution', () => {
			render(DebugContractCard, {
				props: {
					...defaultProps,
					isExecuting: true
				}
			});

			const buttons = screen.getAllByRole('button');
			const loadingSpinner = buttons.find((btn) => btn.querySelector('.loading-spinner'));
			expect(loadingSpinner).toBeDefined();
		});
	});

	describe('Contract Data Display', () => {
		it('should display contract ID correctly', () => {
			render(DebugContractCard, {
				props: defaultProps
			});

			// Contract ID should be displayed
			const contractIdElement = screen.getByText(/1/);
			expect(contractIdElement).toBeDefined();
		});

		it('should format addresses correctly', () => {
			render(DebugContractCard, {
				props: defaultProps
			});

			// Address should be formatted (first 6 chars)
			const addressElement = screen.getByText(/0x1234/);
			expect(addressElement).toBeDefined();
		});
	});

	describe('Raw Data Toggle', () => {
		it('should toggle raw data view when button is clicked', async () => {
			const mockToggle = vi.fn();

			render(DebugContractCard, {
				props: {
					...defaultProps,
					onToggleRawData: mockToggle
				}
			});

			const rawDataButton = screen.getByRole('button', { name: /raw data/i });
			await fireEvent.click(rawDataButton);

			expect(mockToggle).toHaveBeenCalledTimes(1);
		});
	});
});
