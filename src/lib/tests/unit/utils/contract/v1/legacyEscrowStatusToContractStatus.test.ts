import { describe, it, expect } from 'vitest';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
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
