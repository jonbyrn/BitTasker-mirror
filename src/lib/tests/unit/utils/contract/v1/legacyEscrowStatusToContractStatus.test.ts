import { describe, it, expect } from 'vitest';
// Legacy EscrowStatus numeric values (from deleted escrow.enum.ts), used as test inputs
const EscrowStatus = {
	Funded: 0,
	InDispute: 1,
	DisputeResolved: 2,
	DisputeUnresolved: 3,
	Completed: 4,
	Cancelled: 5,
	PendingFunding: 6,
	InProgress: 7,
	PendingCompletion: 8,
	PendingCancellation: 9,
	FundsReleased: 10,
	PendingAcceptance: 11,
	DisputeResolutionProposed: 12,
	PendingDispute: 13,
	PendingResolutionProposal: 14,
	PendingProposalAcceptance: 15,
	PendingTimelockResolution: 16
} as const;
import { ContractStatus } from '$lib/utils/contract/types';
import {
	isLegacyContractStatusWireVersion,
	isValidContractStatusEnumValue,
	normalizeLegacyEscrowStatusTagToContractStatus
} from '$lib/utils/contract/v1/legacyEscrowStatusToContractStatus';

describe('legacyEscrowStatusToContractStatus', () => {
	describe('isLegacyContractStatusWireVersion', () => {
		it('true for v1 and 0.0.1', () => {
			expect(isLegacyContractStatusWireVersion('v1')).toBe(true);
			expect(isLegacyContractStatusWireVersion('0.0.1')).toBe(true);
		});
		it('false for v2 and empty', () => {
			expect(isLegacyContractStatusWireVersion('v2')).toBe(false);
			expect(isLegacyContractStatusWireVersion(undefined)).toBe(false);
			expect(isLegacyContractStatusWireVersion('')).toBe(false);
		});
	});

	describe('normalizeLegacyEscrowStatusTagToContractStatus', () => {
		it('maps Nostr FundsReleased (10) to ContractStatus.FundsReleased (7)', () => {
			expect(normalizeLegacyEscrowStatusTagToContractStatus(EscrowStatus.FundsReleased)).toBe(
				ContractStatus.FundsReleased
			);
		});

		it('maps PendingCompletion and PendingAcceptance to completed / released semantics', () => {
			expect(normalizeLegacyEscrowStatusTagToContractStatus(EscrowStatus.PendingCompletion)).toBe(
				ContractStatus.Completed
			);
			expect(normalizeLegacyEscrowStatusTagToContractStatus(EscrowStatus.PendingAcceptance)).toBe(
				ContractStatus.FundsReleased
			);
		});

		it('maps dispute-related pending rows to InDispute', () => {
			expect(normalizeLegacyEscrowStatusTagToContractStatus(EscrowStatus.PendingDispute)).toBe(
				ContractStatus.InDispute
			);
			expect(
				normalizeLegacyEscrowStatusTagToContractStatus(EscrowStatus.PendingResolutionProposal)
			).toBe(ContractStatus.InDispute);
			expect(
				normalizeLegacyEscrowStatusTagToContractStatus(EscrowStatus.DisputeResolutionProposed)
			).toBe(ContractStatus.InDispute);
		});

		it('maps PendingTimelockResolution using chainState when provided', () => {
			expect(
				normalizeLegacyEscrowStatusTagToContractStatus(
					EscrowStatus.PendingTimelockResolution,
					ContractStatus.Completed
				)
			).toBe(ContractStatus.Completed);
			expect(
				normalizeLegacyEscrowStatusTagToContractStatus(
					EscrowStatus.PendingTimelockResolution,
					ContractStatus.InDispute
				)
			).toBe(ContractStatus.InDispute);
			expect(
				normalizeLegacyEscrowStatusTagToContractStatus(EscrowStatus.PendingTimelockResolution)
			).toBeUndefined();
		});
	});

	describe('isValidContractStatusEnumValue', () => {
		it('accepts 0–11', () => {
			expect(isValidContractStatusEnumValue(0)).toBe(true);
			expect(isValidContractStatusEnumValue(11)).toBe(true);
		});
		it('rejects out of range', () => {
			expect(isValidContractStatusEnumValue(-1)).toBe(false);
			expect(isValidContractStatusEnumValue(12)).toBe(false);
		});
	});
});
