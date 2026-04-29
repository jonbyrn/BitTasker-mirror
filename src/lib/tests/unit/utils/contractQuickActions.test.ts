import { describe, expect, it } from 'vitest';
import {
	getContractQuickActionIds,
	getContractQuickActionVisibility,
	getVisibleContractQuickActions
} from '$lib/utils/helpers/contractQuickActions';

function buildPermissions(overrides: Partial<Record<string, boolean>> = {}) {
	return {
		canComplete: false,
		canAccept: false,
		canDispute: false,
		canPropose: false,
		canAcceptProposal: false,
		canCancel: false,
		canResolveTimelock: false,
		canDelete: false,
		...overrides
	};
}

describe('getContractQuickActionIds', () => {
	it('prioritizes accept before dispute for completed client contracts', () => {
		expect(
			getContractQuickActionIds(
				buildPermissions({
					canAccept: true,
					canDispute: true
				}),
				2
			)
		).toEqual(['accept', 'dispute']);
	});

	it('prioritizes complete before cancel for in-progress freelancer contracts', () => {
		expect(
			getContractQuickActionIds(
				buildPermissions({
					canComplete: true,
					canCancel: true
				}),
				2
			)
		).toEqual(['complete', 'cancel']);
	});

	it('prioritizes accepting a proposal before countering it in disputes', () => {
		expect(
			getContractQuickActionIds(
				buildPermissions({
					canAcceptProposal: true,
					canPropose: true
				}),
				2
			)
		).toEqual(['acceptProposal', 'propose']);
	});

	it('caps the quick-action list deterministically', () => {
		expect(
			getContractQuickActionIds(
				buildPermissions({
					canAccept: true,
					canDispute: true,
					canCancel: true
				}),
				2
			)
		).toEqual(['accept', 'dispute']);
	});

	it('keeps delete available as the final fallback action', () => {
		expect(
			getContractQuickActionIds(
				buildPermissions({
					canDelete: true
				}),
				2
			)
		).toEqual(['delete']);
	});

	it('returns an empty list when no actions are available', () => {
		expect(getContractQuickActionIds(buildPermissions(), 2)).toEqual([]);
	});

	it('suppresses quick actions for pending contracts even when raw permissions exist', () => {
		expect(
			getVisibleContractQuickActions(
				{
					permissions: buildPermissions({
						canAccept: true,
						canDispute: true,
						canCancel: true
					}),
					isPending: true,
					isClient: true,
					blockchainStatus: 'FUNDED'
				},
				2
			)
		).toEqual([]);
	});

	it('requires a dispute proposal before accept-proposal becomes visible', () => {
		expect(
			getContractQuickActionVisibility({
				permissions: buildPermissions({
					canAcceptProposal: true,
					canPropose: true
				}),
				hasDisputeProposal: false,
				hasProposalsLeft: true
			})
		).toMatchObject({
			canAcceptProposal: false,
			canPropose: true
		});
	});

	it('suppresses propose when the actor has exhausted dispute proposals', () => {
		expect(
			getVisibleContractQuickActions(
				{
					permissions: buildPermissions({
						canAcceptProposal: true,
						canPropose: true,
						canCancel: true
					}),
					hasDisputeProposal: true,
					hasProposalsLeft: false
				},
				2
			)
		).toEqual(['acceptProposal', 'cancel']);
	});

	it('suppresses client cancellation after completion from the shared visibility model', () => {
		expect(
			getVisibleContractQuickActions(
				{
					permissions: buildPermissions({
						canCancel: true,
						canResolveTimelock: true
					}),
					isClient: true,
					blockchainStatus: 'COMPLETED'
				},
				2
			)
		).toEqual(['resolveTimelock']);
	});

	it('selects the earning-surface quick actions for freelancer service contracts deterministically', () => {
		expect(
			getVisibleContractQuickActions(
				{
					permissions: buildPermissions({
						canComplete: true,
						canCancel: true,
						canDelete: true
					}),
					isClient: false,
					isPending: false,
					blockchainStatus: 'FUNDED'
				},
				2
			)
		).toEqual(['complete', 'cancel']);
	});

	it('selects the hiring-surface quick actions for client service contracts deterministically', () => {
		expect(
			getVisibleContractQuickActions(
				{
					permissions: buildPermissions({
						canAccept: true,
						canDispute: true,
						canCancel: true
					}),
					isClient: true,
					isPending: false,
					blockchainStatus: 'COMPLETED'
				},
				2
			)
		).toEqual(['accept', 'dispute']);
	});

	it('selects dispute-review quick actions only when a proposal exists for the hiring surface', () => {
		expect(
			getVisibleContractQuickActions(
				{
					permissions: buildPermissions({
						canAcceptProposal: true,
						canPropose: true,
						canCancel: true
					}),
					isClient: true,
					hasDisputeProposal: true,
					hasProposalsLeft: true,
					blockchainStatus: 'DISPUTE_RESOLUTION_PROPOSED'
				},
				2
			)
		).toEqual(['acceptProposal', 'propose']);
	});

	it('keeps dispute-review contracts read-only when the proposal payload is missing and no counter remains', () => {
		expect(
			getVisibleContractQuickActions(
				{
					permissions: buildPermissions({
						canAcceptProposal: true,
						canPropose: true
					}),
					isClient: true,
					hasDisputeProposal: false,
					hasProposalsLeft: false,
					blockchainStatus: 'DISPUTE_RESOLUTION_PROPOSED'
				},
				2
			)
		).toEqual([]);
	});
});
