import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { EscrowStatus } from '$lib/utils/escrow';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/components/ConfirmModal.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/ConfirmModal.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getStatusColorClass: vi.fn(() => 'badge-info'),
	getStatusTranslationKey: vi.fn(() => 'dashboard.contracts.status.funded')
}));

vi.mock('$lib/utils/escrow/v1/escrow', () => ({
	escrow: {
		escrowOps: {},
		contractOps: {}
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(0)
	}
}));

describe('DebugContractCard BSC read-only label', () => {
	const contract = {
		id: 'escrow-1',
		client: '0x1234567890123456789012345678901234567890',
		freelancer: '0x0987654321098765432109876543210987654321',
		baseAmount: '1.0',
		clientFee: '0.025',
		freelancerFee: '0.025',
		totalAmount: '1.05',
		status: EscrowStatus.Funded,
		estimatedStartTime: 1_700_000_100,
		estimatedCompletionTime: 1_700_000_200,
		completionTime: 0,
		timelockExpiry: 0,
		clientFeeTier: 1,
		freelancerFeeTier: 1,
		createdAt: 1_700_000_000,
		lastUpdated: 1_700_000_000
	};

	const permissions = {
		canComplete: false,
		canAccept: false,
		canCancel: false,
		canDispute: false,
		canPropose: false,
		canAcceptProposal: false,
		canResolveTimelock: false,
		canDelete: false
	};

	it('uses the canonical BSC rail label in the read-only header and banner', async () => {
		const { default: DebugContractCard } = await import(
			'$lib/components/contracts/DebugContractCard.svelte'
		);

		render(DebugContractCard, {
			contract,
			permissions,
			isClient: true,
			isFreelancer: false,
			network: 'BSC',
			isExpanded: false,
			safetyOverride: false,
			onToggleRawData: vi.fn(),
			onExecuteFunction: vi.fn().mockResolvedValue(undefined)
		});

		expect(screen.getByText('USDT on BSC legacy context')).toBeInTheDocument();
		expect(
			screen.getByText(
				/USDT on BSC contracts loaded in this debug view are read-only until the deployed BSC escrow ABI\/artifacts are accepted\./i
			)
		).toBeInTheDocument();
		expect(screen.queryByText('BSC escrow legacy context')).toBeNull();
	});
});
