import { describe, it, expect, vi } from 'vitest';
import { formatCompletedAt, getOtherPartyPubkey, getRevieweeRole } from '../review-helpers';
import type { ContractWithEvents } from '$lib/types/contract';

vi.mock('$lib/utils/helpers/dateFormatter', () => ({
	formatStandardDateTimeShort: vi.fn((d: Date) => d.toISOString().slice(0, 16))
}));

vi.mock('$lib/utils/review-source', () => ({
	getReviewsByReviewer: vi.fn(),
	getReviewsForUser: vi.fn(),
	hasUserReviewedEscrow: vi.fn()
}));

vi.mock('$lib/utils/nostr-review', () => ({
	getReviewsForEscrow: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn(),
	npubToHex: (p: string) => (p?.startsWith('npub') ? 'a'.repeat(64) : (p ?? '').replace(/^0x/, '')),
	hexToNpub: (h: string) => h
}));

vi.mock('$lib/utils/escrow', () => ({
	escrow: { contractOps: { getContracts: vi.fn() } },
	EscrowStatus: {},
	ESCROW_STATUSES_REVIEW_COMPLETED: [4, 6, 2]
}));

describe('review-helpers', () => {
	describe('formatCompletedAt', () => {
		it('returns em dash for zero or negative timestamp', () => {
			expect(formatCompletedAt(0)).toBe('—');
			expect(formatCompletedAt(-1)).toBe('—');
		});

		it('returns em dash for invalid timestamp', () => {
			expect(formatCompletedAt(Number.NaN)).toBe('—');
		});

		it('formats seconds timestamp', () => {
			const s = Math.floor(Date.UTC(2024, 0, 15, 12, 0) / 1000);
			const result = formatCompletedAt(s);
			expect(result).not.toBe('—');
			expect(result.length).toBeGreaterThan(0);
		});

		it('formats milliseconds timestamp', () => {
			const ms = Date.UTC(2024, 0, 15);
			const result = formatCompletedAt(ms);
			expect(result).not.toBe('—');
		});
	});

	describe('getOtherPartyPubkey', () => {
		function makeContract(clientPubkey: string, freelancerPubkey: string): ContractWithEvents {
			return {
				contractEvent: {
					content: { clientPubkey, freelancerPubkey },
					created_at: 0
				},
				escrowData: { id: 'e1' },
				status: 6,
				statusEvents: []
			} as ContractWithEvents;
		}

		it('returns freelancer pubkey when current user is client', () => {
			const contract = makeContract('client-hex', 'freelancer-hex');
			expect(getOtherPartyPubkey(contract, 'client-hex')).toBe('freelancer-hex');
		});

		it('returns client pubkey when current user is freelancer', () => {
			const contract = makeContract('client-hex', 'freelancer-hex');
			expect(getOtherPartyPubkey(contract, 'freelancer-hex')).toBe('client-hex');
		});

		it('returns null when content is missing', () => {
			const contract = {
				contractEvent: { content: {} },
				escrowData: { id: 'e1' }
			} as ContractWithEvents;
			expect(getOtherPartyPubkey(contract, 'any')).toBeNull();
		});

		it('returns null when current user is neither party', () => {
			const contract = makeContract('client-hex', 'freelancer-hex');
			expect(getOtherPartyPubkey(contract, 'other-hex')).toBeNull();
		});

		it('returns null when contractEvent or content is missing', () => {
			const contract = {
				contractEvent: undefined,
				escrowData: { id: 'e1' }
			} as unknown as ContractWithEvents;
			expect(getOtherPartyPubkey(contract, 'any')).toBeNull();
		});
	});

	describe('getRevieweeRole', () => {
		it('returns null when no contracts found', async () => {
			const { escrow } = await import('$lib/utils/escrow');
			vi.mocked(escrow.contractOps.getContracts).mockResolvedValue([] as never);
			const role = await getRevieweeRole('e1', 'npub-other');
			expect(role).toBeNull();
		});

		it('returns null when contract has no client/freelancer pubkeys', async () => {
			const { escrow } = await import('$lib/utils/escrow');
			vi.mocked(escrow.contractOps.getContracts).mockResolvedValue([
				{ contractEvent: { content: {} }, escrowData: { id: 'e1' } }
			] as never);
			const role = await getRevieweeRole('e1', 'npub-other');
			expect(role).toBeNull();
		});
	});
});
