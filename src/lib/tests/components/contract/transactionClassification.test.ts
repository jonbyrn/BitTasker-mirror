import { describe, it, expect } from 'vitest';
import {
	classifyTransactionType,
	hasValueTransfer
} from '../transactionClassification';

describe('Transaction Classification', () => {
	const userAddress = '0x1234567890123456789012345678901234567890';

	describe('classifyTransactionType', () => {
		it('should classify swap transactions', () => {
			const result = classifyTransactionType({
				from: userAddress,
				to: '0x0987654321098765432109876543210987654321',
				value: '1000000000000000000',
				isContractInteraction: true,
				contractType: 'etherSwap',
				userAddress,
				isSwap: true
			});

			expect(result).toBe('swap');
		});

		it('should classify contract-send when user sends value to contract', () => {
			const result = classifyTransactionType({
				from: userAddress,
				to: '0x0987654321098765432109876543210987654321',
				value: '1000000000000000000',
				isContractInteraction: true,
				contractType: 'escrow',
				userAddress,
				isSwap: false
			});

			expect(result).toBe('contract-send');
		});

		it('should classify contract-receive when user receives value from contract', () => {
			const result = classifyTransactionType({
				from: '0x0987654321098765432109876543210987654321',
				to: userAddress,
				value: '1000000000000000000',
				isContractInteraction: true,
				contractType: 'escrow',
				userAddress,
				isSwap: false
			});

			expect(result).toBe('contract-receive');
		});

		it('should classify contract-function when no value transfer', () => {
			const result = classifyTransactionType({
				from: userAddress,
				to: '0x0987654321098765432109876543210987654321',
				value: '0',
				isContractInteraction: true,
				contractType: 'escrow',
				userAddress,
				isSwap: false
			});

			expect(result).toBe('contract-function');
		});

		it('should classify regular send transaction', () => {
			const result = classifyTransactionType({
				from: userAddress,
				to: '0x0987654321098765432109876543210987654321',
				value: '1000000000000000000',
				isContractInteraction: false,
				contractType: null,
				userAddress,
				isSwap: false
			});

			expect(result).toBe('send');
		});

		it('should classify regular receive transaction', () => {
			const result = classifyTransactionType({
				from: '0x0987654321098765432109876543210987654321',
				to: userAddress,
				value: '1000000000000000000',
				isContractInteraction: false,
				contractType: null,
				userAddress,
				isSwap: false
			});

			expect(result).toBe('receive');
		});
	});

	describe('hasValueTransfer', () => {
		it('should detect send transaction', () => {
			const result = hasValueTransfer(
				{
					from: userAddress,
					to: '0x0987654321098765432109876543210987654321',
					value: '1000000000000000000'
				},
				userAddress
			);

			expect(result.hasValue).toBe(true);
			expect(result.isSend).toBe(true);
			expect(result.isReceive).toBe(false);
		});

		it('should detect receive transaction', () => {
			const result = hasValueTransfer(
				{
					from: '0x0987654321098765432109876543210987654321',
					to: userAddress,
					value: '1000000000000000000'
				},
				userAddress
			);

			expect(result.hasValue).toBe(true);
			expect(result.isSend).toBe(false);
			expect(result.isReceive).toBe(true);
		});

		it('should detect no value transfer', () => {
			const result = hasValueTransfer(
				{
					from: userAddress,
					to: '0x0987654321098765432109876543210987654321',
					value: '0'
				},
				userAddress
			);

			expect(result.hasValue).toBe(false);
			expect(result.isSend).toBe(false);
			expect(result.isReceive).toBe(false);
		});
	});
});

