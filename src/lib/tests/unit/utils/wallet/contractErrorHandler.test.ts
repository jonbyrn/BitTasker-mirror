import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractContractError, getErrorMessage } from '$lib/utils/wallet/contractErrorHandler';

const translateFn = vi.fn((key: string) => key);

vi.mock('svelte-i18n', () => ({ t: {} }));
vi.mock('svelte/store', () => ({
	get: vi.fn(() => translateFn)
}));

describe('contractErrorHandler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		translateFn.mockImplementation((key: string) => key);
	});

	describe('extractContractError', () => {
		it('should return unknown_error for non-Error input', () => {
			const result = extractContractError(null);
			expect(result.userMessage).toBe('dashboard.contracts.errors.unknown_error');
			expect(result.technicalMessage).toBe('Unknown error type');
			expect(result.errorCode).toBeUndefined();
		});

		it('should map "only client can accept" to not_client', () => {
			const result = extractContractError(new Error('Only client can accept'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.not_client');
			expect(result.technicalMessage).toBe('Only client can accept');
			expect(result.errorCode).toBe('NOT_CLIENT');
		});

		it('should map "only freelancer can complete" to not_freelancer', () => {
			const result = extractContractError(new Error('Only freelancer can complete'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.not_freelancer');
			expect(result.errorCode).toBe('NOT_FREELANCER');
		});

		it('should map "escrow not funded" to invalid_state', () => {
			const result = extractContractError(new Error('Escrow not funded'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.invalid_state');
			expect(result.errorCode).toBe('INVALID_STATE');
		});

		it('should map "invalid escrow state" to invalid_state', () => {
			const result = extractContractError(new Error('Invalid escrow state'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.invalid_state');
		});

		it('should map "insufficient balance" to insufficient_funds', () => {
			const result = extractContractError(new Error('Insufficient balance'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.insufficient_funds');
			expect(result.errorCode).toBe('INSUFFICIENT_FUNDS');
		});

		it('should map "insufficient balance" with "transaction cost" to insufficient_gas', () => {
			const result = extractContractError(new Error('Insufficient balance for transaction cost'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.insufficient_gas');
			expect(result.errorCode).toBe('INSUFFICIENT_GAS');
		});

		it('should map "user rejected" to user_rejected', () => {
			const result = extractContractError(new Error('User rejected the request'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.user_rejected');
			expect(result.errorCode).toBe('USER_REJECTED');
		});

		it('should map "network" to network_error', () => {
			const result = extractContractError(new Error('Network error'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.network_error');
			expect(result.errorCode).toBe('NETWORK_ERROR');
		});

		it('should map "out of gas" to gas_error', () => {
			const result = extractContractError(new Error('Out of gas'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.gas_error');
			expect(result.errorCode).toBe('GAS_ERROR');
		});

		it('should map "execution reverted" without quoted reason to contract_revert key', () => {
			const result = extractContractError(new Error('Execution reverted'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.contract_revert');
			expect(result.errorCode).toBe('CONTRACT_REVERT');
		});

		it('should extract quoted revert reason and use specific handler when possible', () => {
			const result = extractContractError(
				new Error('Execution reverted: "Only client can accept"')
			);
			expect(result.userMessage).toBe('dashboard.contracts.errors.not_client');
			expect(result.errorCode).toBe('NOT_CLIENT');
		});

		it('should return generic_error for very long messages', () => {
			const longMessage = 'x'.repeat(151);
			const result = extractContractError(new Error(longMessage));
			expect(result.userMessage).toBe('dashboard.contracts.errors.generic_error');
			expect(result.errorCode).toBe('GENERIC_ERROR');
		});

		it('should return original message for short unrecognized errors', () => {
			const msg = 'Something went wrong';
			const result = extractContractError(new Error(msg));
			expect(result.userMessage).toBe(msg);
			expect(result.technicalMessage).toBe(msg);
			expect(result.errorCode).toBeUndefined();
		});

		it('should map "already completed" to already_completed', () => {
			const result = extractContractError(new Error('Task already completed'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.already_completed');
			expect(result.errorCode).toBe('ALREADY_COMPLETED');
		});

		it('should map "dispute period expired" to dispute_expired', () => {
			const result = extractContractError(new Error('Dispute period expired'));
			expect(result.userMessage).toBe('dashboard.contracts.errors.dispute_expired');
			expect(result.errorCode).toBe('DISPUTE_EXPIRED');
		});
	});

	describe('getErrorMessage', () => {
		it('should return only user message when showTechnical is false', () => {
			const result = getErrorMessage(new Error('Only client can accept'), false);
			expect(result).toBe('dashboard.contracts.errors.not_client');
		});

		it('should include technical details when showTechnical is true and messages differ', () => {
			const result = getErrorMessage(new Error('Only client can accept'), true);
			expect(result).toContain('dashboard.contracts.errors.not_client');
			expect(result).toContain('Technical details:');
			expect(result).toContain('Only client can accept');
		});

		it('should return user message when showTechnical is true but user and technical are same', () => {
			const msg = 'Short unknown error';
			const result = getErrorMessage(new Error(msg), true);
			expect(result).toBe(msg);
		});
	});
});
