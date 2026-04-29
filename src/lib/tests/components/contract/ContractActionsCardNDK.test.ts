import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.contracts.actions.complete': 'Complete',
		'dashboard.contracts.actions.approve': 'Approve',
		'dashboard.contracts.actions.refund': 'Refund',
		'dashboard.contracts.actions.cancel': 'Cancel',
		'dashboard.contracts.actions.mark_no_show': 'Mark no-show',
		'dashboard.contracts.actions.mark_work_in_progress': 'Mark work in progress',
		'dashboard.contracts.actions.claim_no_show_refund': 'Claim no-show refund',
		'dashboard.contracts.actions.dispute_work': 'Dispute Work',
		'dashboard.contracts.actions.propose_resolution': 'Propose Resolution',
		'dashboard.contracts.actions.accept_proposal': 'Accept Proposal',
		'dashboard.contracts.actions.resolve_timelock': 'Claim Funds',
		'dashboard.contracts.actions.view_details': 'Details',
		'dashboard.contracts.actions.contract_action_failed': 'Action failed',
		'dashboard.contracts.actions.task_completed_success': 'Task completed',
		'dashboard.contracts.actions.accept_work_success': 'Work accepted',
		'dashboard.contracts.actions.refund_tasker_success': 'Refund submitted',
		'dashboard.contracts.actions.cancel_contract_success': 'Contract cancelled',
		'dashboard.contracts.actions.mark_no_show_success': 'No-show marked',
		'dashboard.contracts.actions.mark_work_in_progress_success': 'Work in progress',
		'dashboard.contracts.actions.claim_no_show_refund_success': 'Refund claim submitted',
		'dashboard.contracts.actions.dispute_raised_success': 'Dispute raised',
		'dashboard.contracts.actions.propose_resolution_success': 'Resolution proposed',
		'dashboard.contracts.actions.accept_proposal_success': 'Proposal accepted',
		'dashboard.contracts.actions.resolve_timelock_success': 'Timelock resolved'
	};
	const translate = (key: string) => translations[key] ?? key;
	return {
		t: readable(translate),
		locale: readable('en')
	};
});

// Mock app store with proper writable store interface
vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		appStore: writable({
			nostrKeys: { nsec: null, npub: null, mnemonic: null },
			isLoading: false,
			error: null,
			toasts: [],
			biometricData: null,
			network: 'mainnet' as const,
			pool: { publish: vi.fn() } as unknown as NonNullable<unknown>,
			relays: []
		})
	};
});

// Mock task store to avoid pool initialization
vi.mock('$lib/stores/task.store', async () => {
	const { writable } = await import('svelte/store');
	const original =
		await vi.importActual<typeof import('$lib/stores/task.store')>('$lib/stores/task.store');
	return {
		...original,
		tasksStore: writable({
			pool: { publish: vi.fn() } as unknown as NonNullable<unknown>,
			items: [],
			loading: false,
			error: null,
			currentPage: 0,
			hasMore: true,
			searchParamsKey: '',
			lastRelayTimestamp: undefined
		})
	};
});

// Mock portal
vi.mock('$lib/utils/portal', () => ({
	portal: () => ({ destroy: () => {} })
}));

// Mock modals
vi.mock('$lib/components/contracts/TaskCompletionModalNDK.svelte', () => ({
	default: vi.fn(() => ({ $$: { ctx: [] } }))
}));

vi.mock('$lib/components/contracts/ProposeResolutionModalNDK.svelte', () => ({
	default: vi.fn(() => ({ $$: { ctx: [] } }))
}));

// Import after mocks
import ContractActionsCardNDK from '$lib/components/contracts/ContractActionsCardNDK.svelte';
import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
import type { PermittedActions } from '$lib/utils/contract/v2/permittedActions';

// Helper to create a mock contract rune
function createMockRune(
	overrides: Partial<{
		isTasker: boolean;
		chainIsTerminal: boolean;
		isPending: boolean;
		permittedActions: Partial<PermittedActions>;
	}> = {}
): PaymentContractRune {
	const mockRune = {
		isTasker: overrides.isTasker ?? false,
		chainIsTerminal: overrides.chainIsTerminal ?? false,
		isPending: overrides.isPending ?? false,
		permittedActions: {
			canCompleteTask: false,
			canAcceptTask: false,
			canDisputeTask: false,
			canResolveAfterTimelock: false,
			canProposeResolution: false,
			canAcceptProposal: false,
			canCancelPaymentContract: false,
			canRefundTasker: false,
			canMarkNoShow: false,
			canMarkWorkInProgress: false,
			canClaimNoShowRefund: false,
			canClaimUpfrontDeposit: false,
			...overrides.permittedActions
		}
	} as unknown as PaymentContractRune;

	return mockRune;
}

describe('ContractActionsCardNDK', () => {
	describe('primaryAction derived logic', () => {
		it('returns Accept action for tasker when canAcceptTask is true', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: { canAcceptTask: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
		});

		it('returns ClaimNoShowRefund for tasker when canClaimNoShowRefund is true', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: { canClaimNoShowRefund: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Claim no-show refund' })).toBeInTheDocument();
		});

		it('returns ResolveTimelock when canResolveAfterTimelock is true', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: { canResolveAfterTimelock: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Claim Funds' })).toBeInTheDocument();
		});

		it('returns ProposeResolution when canProposeResolution is true', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: { canProposeResolution: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Propose Resolution' })).toBeInTheDocument();
		});

		it('returns Dispute when canDisputeTask is true', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: { canDisputeTask: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Dispute Work' })).toBeInTheDocument();
		});

		it('returns Cancel when only canCancelPaymentContract is true', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: { canCancelPaymentContract: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		});

		it('returns null when chainIsTerminal is true', () => {
			const rune = createMockRune({
				isTasker: true,
				chainIsTerminal: true,
				permittedActions: { canAcceptTask: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			// Should only show Details button, not Approve
			expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
		});

		it('returns Complete for client (taskee) when canCompleteTask is true', () => {
			const rune = createMockRune({
				isTasker: false,
				permittedActions: { canCompleteTask: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
		});

		it('returns MarkWorkInProgress for client when canMarkWorkInProgress is true', () => {
			const rune = createMockRune({
				isTasker: false,
				permittedActions: { canMarkWorkInProgress: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Mark work in progress' })).toBeInTheDocument();
		});

		it('returns Refund for client when canRefundTasker is true', () => {
			const rune = createMockRune({
				isTasker: false,
				permittedActions: { canRefundTasker: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument();
		});

		it('returns null when no actions are permitted', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: {}
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			// Should only show Details button
			expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
		});

		it('prioritizes Accept over ClaimNoShowRefund for tasker', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: { canAcceptTask: true, canClaimNoShowRefund: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
			expect(
				screen.queryByRole('button', { name: 'Claim no-show refund' })
			).not.toBeInTheDocument();
		});

		it('prioritizes Complete over MarkWorkInProgress for client', () => {
			const rune = createMockRune({
				isTasker: false,
				permittedActions: { canCompleteTask: true, canMarkWorkInProgress: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
			expect(
				screen.queryByRole('button', { name: 'Mark work in progress' })
			).not.toBeInTheDocument();
		});
	});

	describe('button states', () => {
		it('disables button when isPending is true', () => {
			const rune = createMockRune({
				isTasker: true,
				isPending: true,
				permittedActions: { canAcceptTask: true }
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			const button = screen.getByRole('button', { name: 'Approve' });
			expect(button).toBeDisabled();
		});

		it('shows Details button even when no primary action', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: {}
			});
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer: vi.fn() }
			});
			expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
		});
	});

	describe('Details button', () => {
		it('always renders the Details button', () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: { canAcceptTask: true }
			});
			const onOpenDrawer = vi.fn();
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer }
			});
			expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
		});

		it('calls onOpenDrawer when Details is clicked', async () => {
			const rune = createMockRune({
				isTasker: true,
				permittedActions: {}
			});
			const onOpenDrawer = vi.fn();
			render(ContractActionsCardNDK, {
				props: { contractRune: rune, btcPrice: 60000, onOpenDrawer }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Details' }));
			expect(onOpenDrawer).toHaveBeenCalledTimes(1);
		});
	});
});
