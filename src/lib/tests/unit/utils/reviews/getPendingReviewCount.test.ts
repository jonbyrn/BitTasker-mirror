/**
 * Unit tests for getPendingReviewCount.
 *
 * Core regression: attestation events have TWO e tags — e[0]=reviewEventId,
 * e[1]=contractEventId. The old code used tagValue('e') which returns only
 * the first, causing reviewed contracts to be counted as pending. The fix
 * uses getMatchingTags('e') and intersects with known contract IDs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractStatus } from '$lib/utils/contract/types';

// ── Dependency mocks ──────────────────────────────────────────────────────────

const mockFetchEvents = vi.fn();
const mockFetchNdkPaymentContractsForUser = vi.fn();
const mockFetchLatestStatusFromNostr = vi.fn();
const mockGetNpub = vi.fn();

vi.mock('$lib/nostr/ndk', () => ({
	ndk: { fetchEvents: mockFetchEvents }
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: mockGetNpub
}));

vi.mock('$lib/utils/contract/reviewContractsFromNdk', () => ({
	fetchNdkPaymentContractsForUser: mockFetchNdkPaymentContractsForUser,
	fetchLatestStatusFromNostr: mockFetchLatestStatusFromNostr,
	buildIContractForReviewFromNdkWithNostrStatus: vi.fn()
}));

vi.mock('$lib/utils/nostr-message', () => ({
	fetchProfileMetadata: vi.fn().mockResolvedValue({ name: 'Test' })
}));

vi.mock('$lib/utils/reviews/queries', () => ({
	hasUserReviewedContract: vi.fn().mockResolvedValue(false)
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_PUBKEY_HEX = 'a'.repeat(64);
const OTHER_PUBKEY_HEX = 'b'.repeat(64);

/** Build a minimal NDKPaymentContract-like object. */
function makeContract(id: string, paymentId = `pay-${id}`) {
	return { id, paymentId };
}

/**
 * Build a minimal NDK attestation event.
 *
 * `eTags` is an array of event IDs that become ['e', id] tags — the FIRST
 * entry mirrors the real backend (review event ID), the SECOND mirrors the
 * contract event ID.
 */
function makeAttestation({ reviewerPubkey, eTags }: { reviewerPubkey: string; eTags: string[] }) {
	const tags = eTags.map((id) => ['e', id]);

	return {
		content: JSON.stringify({ reviewerPubkey }),
		// getMatchingTags mirrors NDKEvent API — returns matching tag arrays
		getMatchingTags: (name: string) => (name === 'e' ? tags : []),
		// tagValue mirrors old buggy behaviour — returns FIRST matching value
		tagValue: (name: string) => (name === 'e' ? eTags[0] : undefined),
		tags
	};
}

/** Build a Kind 31006 status event as returned by fetchLatestStatusFromNostr. */
function statusMap(entries: [contractId: string, status: ContractStatus][]) {
	return new Map(entries);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getPendingReviewCount', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetNpub.mockResolvedValue(USER_PUBKEY_HEX);
	});

	it('returns 0 when user has no contracts', async () => {
		mockFetchNdkPaymentContractsForUser.mockResolvedValue([]);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(0);
	});

	it('returns 0 when user has no pending-pubkey', async () => {
		mockGetNpub.mockResolvedValue(null);
		mockFetchNdkPaymentContractsForUser.mockResolvedValue([makeContract('c1')]);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(0);
	});

	it('returns 0 when all contracts have been reviewed (dual e-tag format)', async () => {
		// Scenario: user reviewed contract c1. Attestation has:
		//   e[0] = review event ID (aaaa...)
		//   e[1] = contract event ID (c1)
		const reviewEventId = 'a'.repeat(64);
		const contractId = 'c1' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([makeContract(contractId)]);

		// Relay returns the attestation for this contract
		mockFetchEvents.mockResolvedValue([
			makeAttestation({
				reviewerPubkey: USER_PUBKEY_HEX,
				eTags: [reviewEventId, contractId] // e[0]=review, e[1]=contract
			})
		]);

		// No unreviewed contracts → fetchLatestStatusFromNostr should not be called
		mockFetchLatestStatusFromNostr.mockResolvedValue(statusMap([]));

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(0);
		expect(mockFetchLatestStatusFromNostr).not.toHaveBeenCalled();
	});

	it('counts contracts with reviewable status that have no attestation (genuine pending)', async () => {
		const contractId = 'c2' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([makeContract(contractId)]);
		// No attestations for this contract
		mockFetchEvents.mockResolvedValue([]);
		// Contract status is FundsReleased = 7 (reviewable)
		mockFetchLatestStatusFromNostr.mockResolvedValue(
			statusMap([[contractId, ContractStatus.FundsReleased]])
		);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(1);
	});

	it('does not count contracts in non-reviewable status', async () => {
		const contractId = 'c3' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([makeContract(contractId)]);
		mockFetchEvents.mockResolvedValue([]);
		// Status is Completed (4) — not reviewable until funds move
		mockFetchLatestStatusFromNostr.mockResolvedValue(
			statusMap([[contractId, ContractStatus.Completed]])
		);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(0);
	});

	it('does not count contracts with no Kind 31006 status event', async () => {
		const contractId = 'c4' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([makeContract(contractId)]);
		mockFetchEvents.mockResolvedValue([]);
		// fetchLatestStatusFromNostr returns empty map — no status event found
		mockFetchLatestStatusFromNostr.mockResolvedValue(statusMap([]));

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(0);
	});

	it('handles mix of reviewed and unreviewed contracts correctly', async () => {
		const reviewedId = 'aa' + '0'.repeat(62);
		const pendingId = 'bb' + '0'.repeat(62);
		const reviewEventId = 'cc' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([
			makeContract(reviewedId),
			makeContract(pendingId)
		]);

		// Only the reviewed contract has an attestation from the current user
		mockFetchEvents.mockResolvedValue([
			makeAttestation({
				reviewerPubkey: USER_PUBKEY_HEX,
				eTags: [reviewEventId, reviewedId] // e[0]=review, e[1]=contract
			})
		]);

		// Only the pending contract needs a status check
		mockFetchLatestStatusFromNostr.mockResolvedValue(
			statusMap([[pendingId, ContractStatus.FundsReleased]])
		);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		const count = await getPendingReviewCount();

		expect(count).toBe(1);
		// Status was only queried for the unreviewed contract, not the reviewed one
		expect(mockFetchLatestStatusFromNostr).toHaveBeenCalledWith([pendingId]);
	});

	it('ignores attestations from other users (not the current reviewer)', async () => {
		const contractId = 'dd' + '0'.repeat(62);
		const reviewEventId = 'ee' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([makeContract(contractId)]);

		// Attestation is from a DIFFERENT user reviewing the current user
		mockFetchEvents.mockResolvedValue([
			makeAttestation({
				reviewerPubkey: OTHER_PUBKEY_HEX, // not the current user
				eTags: [reviewEventId, contractId]
			})
		]);

		mockFetchLatestStatusFromNostr.mockResolvedValue(
			statusMap([[contractId, ContractStatus.FundsReleased]])
		);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(1); // still pending because WE haven't reviewed
	});

	it('handles old single-e-tag attestations gracefully (no crash, falls through to status check)', async () => {
		const contractId = 'ff' + '0'.repeat(62);
		const reviewEventId = 'ee' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([makeContract(contractId)]);

		// Old-format attestation: only 1 e tag (the review event ID, not the contract)
		mockFetchEvents.mockResolvedValue([
			makeAttestation({
				reviewerPubkey: USER_PUBKEY_HEX,
				eTags: [reviewEventId] // only 1 e tag, not the contract ID
			})
		]);

		// Because the contract ID is NOT in the single e tag, it's treated as unreviewed.
		// This is acceptable for old-format attestations and is consistent with
		// the relay not being queryable by #e for these old events.
		mockFetchLatestStatusFromNostr.mockResolvedValue(
			statusMap([[contractId, ContractStatus.FundsReleased]])
		);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		// Old format: counted as pending (acceptable — old attestation cannot be linked)
		expect(await getPendingReviewCount()).toBe(1);
	});

	it('counts all three reviewable statuses (FundsReleased=7, FundsClaimed=8, DisputeResolved=2)', async () => {
		const c1 = '11' + '0'.repeat(62);
		const c2 = '22' + '0'.repeat(62);
		const c3 = '33' + '0'.repeat(62);
		const c4 = '44' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([
			makeContract(c1),
			makeContract(c2),
			makeContract(c3),
			makeContract(c4)
		]);
		mockFetchEvents.mockResolvedValue([]); // no attestations

		mockFetchLatestStatusFromNostr.mockResolvedValue(
			statusMap([
				[c1, ContractStatus.FundsReleased], // 7 — reviewable
				[c2, ContractStatus.FundsClaimed], // 8 — reviewable
				[c3, ContractStatus.DisputeResolved], // 2 — reviewable
				[c4, ContractStatus.Cancelled] // 5 — NOT reviewable
			])
		);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(3);
	});

	it('skips malformed attestation content without throwing', async () => {
		const contractId = 'dd' + '0'.repeat(62);

		mockFetchNdkPaymentContractsForUser.mockResolvedValue([makeContract(contractId)]);

		// Inject a malformed attestation
		mockFetchEvents.mockResolvedValue([
			{
				content: 'not-valid-json',
				getMatchingTags: () => [['e', contractId]],
				tagValue: () => contractId,
				tags: [['e', contractId]]
			}
		]);

		mockFetchLatestStatusFromNostr.mockResolvedValue(
			statusMap([[contractId, ContractStatus.FundsReleased]])
		);

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		// Malformed attestation is skipped, contract remains unreviewed, count = 1
		expect(await getPendingReviewCount()).toBe(1);
	});

	it('returns 0 when an unexpected error is thrown', async () => {
		mockGetNpub.mockRejectedValue(new Error('auth failure'));

		const { getPendingReviewCount } = await import('$lib/utils/reviews/helpers');
		expect(await getPendingReviewCount()).toBe(0);
	});
});
