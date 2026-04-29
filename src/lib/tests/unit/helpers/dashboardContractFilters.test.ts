import { describe, expect, it } from 'vitest';
import {
	matchesDisplayStatusFilter,
	matchesRoleFilter,
	matchesTypeFilter
} from '$lib/utils/helpers/dashboardContractFilters';
import { ContractStatus, DisplayOnlyStatus } from '$lib/utils/contract/types';
import type { NDKPaymentContract } from '$lib/nostr/events/contract';

describe('matchesDisplayStatusFilter', () => {
	it('all matches any status', () => {
		expect(matchesDisplayStatusFilter('all', ContractStatus.Funded)).toBe(true);
		expect(matchesDisplayStatusFilter('all', ContractStatus.Cancelled)).toBe(true);
	});

	it('funded', () => {
		expect(matchesDisplayStatusFilter('funded', ContractStatus.Funded)).toBe(true);
		expect(matchesDisplayStatusFilter('funded', ContractStatus.Completed)).toBe(false);
	});

	it('in_progress', () => {
		expect(matchesDisplayStatusFilter('in_progress', DisplayOnlyStatus.InProgress)).toBe(true);
		expect(matchesDisplayStatusFilter('in_progress', ContractStatus.WorkInProgress)).toBe(true);
		expect(matchesDisplayStatusFilter('in_progress', ContractStatus.Funded)).toBe(false);
	});

	it('completed_success', () => {
		expect(matchesDisplayStatusFilter('completed_success', ContractStatus.Completed)).toBe(true);
		expect(matchesDisplayStatusFilter('completed_success', ContractStatus.FundsReleased)).toBe(
			true
		);
		expect(matchesDisplayStatusFilter('completed_success', ContractStatus.FundsClaimed)).toBe(true);
		expect(matchesDisplayStatusFilter('completed_success', ContractStatus.Funded)).toBe(false);
	});

	it('in_dispute', () => {
		expect(matchesDisplayStatusFilter('in_dispute', ContractStatus.InDispute)).toBe(true);
		expect(matchesDisplayStatusFilter('in_dispute', ContractStatus.InDisputeWorkInProgress)).toBe(
			true
		);
		expect(
			matchesDisplayStatusFilter('in_dispute', DisplayOnlyStatus.DisputeResolutionProposed)
		).toBe(true);
		expect(matchesDisplayStatusFilter('in_dispute', ContractStatus.Funded)).toBe(false);
	});

	it('dispute_resolved', () => {
		expect(matchesDisplayStatusFilter('dispute_resolved', ContractStatus.DisputeResolved)).toBe(
			true
		);
		expect(matchesDisplayStatusFilter('dispute_resolved', ContractStatus.InDispute)).toBe(false);
	});

	it('ended_other', () => {
		expect(matchesDisplayStatusFilter('ended_other', ContractStatus.Cancelled)).toBe(true);
		expect(matchesDisplayStatusFilter('ended_other', ContractStatus.Refunded)).toBe(true);
		expect(matchesDisplayStatusFilter('ended_other', ContractStatus.DisputeUnresolved)).toBe(true);
		expect(matchesDisplayStatusFilter('ended_other', ContractStatus.NoShow)).toBe(true);
		expect(matchesDisplayStatusFilter('ended_other', ContractStatus.Funded)).toBe(false);
	});
});

describe('matchesRoleFilter', () => {
	const tasker = 'a'.repeat(64);
	const taskee = 'b'.repeat(64);

	function mockContract(authorPubkey: string, pTags: string[]): NDKPaymentContract {
		return {
			taskerPubkey: authorPubkey,
			getMatchingTags: (name: string) =>
				name === 'p' ? pTags.map((pk) => ['p', pk] as [string, string]) : [],
			author: { pubkey: authorPubkey }
		} as unknown as NDKPaymentContract;
	}

	it('all passes', () => {
		const c = mockContract(tasker, [tasker, taskee]);
		expect(matchesRoleFilter(c, 'all', tasker)).toBe(true);
		expect(matchesRoleFilter(c, 'all', undefined)).toBe(true);
	});

	it('client = tasker (author)', () => {
		const c = mockContract(tasker, [tasker, taskee]);
		expect(matchesRoleFilter(c, 'client', tasker)).toBe(true);
		expect(matchesRoleFilter(c, 'client', taskee)).toBe(false);
	});

	it('freelancer = taskee', () => {
		const c = mockContract(tasker, [tasker, taskee]);
		expect(matchesRoleFilter(c, 'freelancer', taskee)).toBe(true);
		expect(matchesRoleFilter(c, 'freelancer', tasker)).toBe(false);
	});
});

describe('matchesTypeFilter', () => {
	function mockContract(contextType?: string): NDKPaymentContract {
		const tags: [string, string][] = [];
		if (contextType !== undefined) {
			tags.push(['contextType', contextType]);
		}
		return {
			tagValue: (name: string) => (name === 'contextType' ? contextType : undefined),
			tags
		} as unknown as NDKPaymentContract;
	}

	it('all passes any type', () => {
		expect(matchesTypeFilter(mockContract('task'), 'all')).toBe(true);
		expect(matchesTypeFilter(mockContract('service'), 'all')).toBe(true);
		expect(matchesTypeFilter(mockContract(undefined), 'all')).toBe(true);
		expect(matchesTypeFilter(mockContract(''), 'all')).toBe(true);
	});

	it('tasks matches task or missing contextType', () => {
		expect(matchesTypeFilter(mockContract('task'), 'tasks')).toBe(true);
		expect(matchesTypeFilter(mockContract(undefined), 'tasks')).toBe(true);
		expect(matchesTypeFilter(mockContract(''), 'tasks')).toBe(true);
		expect(matchesTypeFilter(mockContract('service'), 'tasks')).toBe(false);
	});

	it('services matches service contextType only', () => {
		expect(matchesTypeFilter(mockContract('service'), 'services')).toBe(true);
		expect(matchesTypeFilter(mockContract('task'), 'services')).toBe(false);
		expect(matchesTypeFilter(mockContract(undefined), 'services')).toBe(false);
		expect(matchesTypeFilter(mockContract(''), 'services')).toBe(false);
	});
});
