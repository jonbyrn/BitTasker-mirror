import { describe, it, expect } from 'vitest';
import { getTransactionTitle, getTransactionTitleKey } from '../titleGeneration';
import type { Transaction } from '$lib/types/wallet';

describe('Title Generation', () => {
	describe('getTransactionTitle', () => {
		it('should return human-readable title for known escrow functions', () => {
			const tx: Partial<Transaction> = {
				type: 'contract-function',
				contractFunction: 'createEscrow',
				contractMetadata: {
					functionName: 'createEscrow',
					network: 'rsk',
					environment: 'testnet'
				}
			};

			expect(getTransactionTitle(tx)).toBe('Created Escrow');
		});

		it('should return function name for unknown contract functions', () => {
			const tx: Partial<Transaction> = {
				type: 'contract-function',
				contractFunction: 'someUnknownFunction',
				contractMetadata: {
					functionSelector: '0x12345678',
					network: 'rsk',
					environment: 'testnet'
				}
			};

			expect(getTransactionTitle(tx)).toBe('Contract Function: someUnknownFunction');
		});

		it('should return selector for unknown function without name', () => {
			const tx: Partial<Transaction> = {
				type: 'contract-function',
				contractMetadata: {
					functionSelector: '0x12345678',
					network: 'rsk',
					environment: 'testnet'
				}
			};

			expect(getTransactionTitle(tx)).toBe('Contract Function: 0x12345678');
		});

		it('should return type-based title for regular transactions', () => {
			expect(getTransactionTitle({ type: 'send' } as Transaction)).toBe('Sent');
			expect(getTransactionTitle({ type: 'receive' } as Transaction)).toBe('Received');
			expect(getTransactionTitle({ type: 'contract-function' } as Transaction)).toBe('Contract Function');
			expect(getTransactionTitle({ type: 'swap' } as Transaction)).toBe('Swap Claimed');
		});

		it('should prioritize human-readable names over type', () => {
			const tx: Partial<Transaction> = {
				type: 'contract-send',
				contractMetadata: {
					functionName: 'createEscrow',
					network: 'rsk',
					environment: 'testnet'
				}
			};

			expect(getTransactionTitle(tx)).toBe('Created Escrow');
		});
	});

	describe('getTransactionTitleKey', () => {
		it('should return translation key for known functions', () => {
			const tx: Partial<Transaction> = {
				type: 'contract-function',
				contractMetadata: {
					functionName: 'createEscrow',
					network: 'rsk',
					environment: 'testnet'
				}
			};

			expect(getTransactionTitleKey(tx as Transaction)).toBe('wallet.transaction.contract.createescrow');
		});

		it('should return type-based translation key', () => {
			expect(getTransactionTitleKey({ type: 'send' } as Transaction)).toBe('wallet.sent');
			expect(getTransactionTitleKey({ type: 'receive' } as Transaction)).toBe('wallet.received');
			expect(getTransactionTitleKey({ type: 'contract-function' } as Transaction)).toBe('wallet.transaction.type.contract_function');
		});
	});
});

