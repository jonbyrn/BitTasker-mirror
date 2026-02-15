import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	extractFunctionSelector,
	parseEscrowFunction,
	decodeUnknownFunction,
	parseFunction
} from '$lib/utils/wallet/functionParsing';

// Mock escrow ABI
vi.mock('../../constants/escrowABI.json', () => ({
	default: [
		{
			inputs: [{ name: 'escrowId', type: 'uint256' }],
			name: 'createEscrow',
			outputs: [],
			stateMutability: 'nonpayable',
			type: 'function'
		},
		{
			inputs: [{ name: 'escrowId', type: 'uint256' }],
			name: 'completeTask',
			outputs: [],
			stateMutability: 'nonpayable',
			type: 'function'
		}
	]
}));

// Mock contractDetection
vi.mock('../contractDetection', () => ({
	hasContractInteraction: (input: string | null | undefined) => {
		if (!input || input === '0x' || input.length <= 2) return false;
		return input.length > 10;
	}
}));

describe('Function Parsing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('extractFunctionSelector', () => {
		it('should extract selector from valid input data', () => {
			expect(extractFunctionSelector('0xa9059cbb000000000000000000000000')).toBe('0xa9059cbb');
			expect(extractFunctionSelector('a9059cbb000000000000000000000000')).toBe('0xa9059cbb');
		});

		it('should return null for invalid input', () => {
			expect(extractFunctionSelector(null)).toBeNull();
			expect(extractFunctionSelector(undefined)).toBeNull();
			expect(extractFunctionSelector('0x12')).toBeNull();
			expect(extractFunctionSelector('0x')).toBeNull();
		});
	});

	describe('decodeUnknownFunction', () => {
		it('should decode common ERC-20 functions', () => {
			expect(decodeUnknownFunction('0xa9059cbb')).toBe('transfer');
			expect(decodeUnknownFunction('0x23b872dd')).toBe('transferFrom');
			expect(decodeUnknownFunction('0x095ea7b3')).toBe('approve');
		});

		it('should return null for unknown selectors', () => {
			expect(decodeUnknownFunction('0x12345678')).toBeNull();
			expect(decodeUnknownFunction('invalid')).toBeNull();
		});
	});

	describe('parseFunction', () => {
		it('should parse escrow function when contract type is escrow', () => {
			// Mock parseEscrowFunction to return a result
			const result = parseFunction('0x123456780000000000000000000000000000000000000000000000000000000000000001', 'escrow');
			// Should attempt to parse as escrow function
			expect(result).not.toBeNull();
		});

		it('should decode common functions for unknown contract type', () => {
			const result = parseFunction('0xa9059cbb000000000000000000000000', 'unknown');
			
			expect(result).not.toBeNull();
			if (result) {
				expect(result.functionName).toBe('transfer');
				expect(result.functionSelector).toBe('0xa9059cbb');
			}
		});

		it('should return selector only for unknown functions', () => {
			const result = parseFunction('0x123456780000000000000000000000000000000000000000000000000000000000000001', 'unknown');
			
			expect(result).not.toBeNull();
			if (result) {
				expect(result.functionSelector).toBe('0x12345678');
				expect(result.functionName).toBeNull();
			}
		});

		it('should return null for non-contract interactions', () => {
			expect(parseFunction('0x', 'escrow')).toBeNull();
			expect(parseFunction(null, 'escrow')).toBeNull();
		});
	});
});

