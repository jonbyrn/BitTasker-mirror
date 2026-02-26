import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	extractFunctionSelector,
	parseEscrowFunction,
	decodeUnknownFunction,
	parseFunction
} from '$lib/utils/wallet/functionParsing';

const minimalEscrowABI = [
	{
		type: 'function',
		name: 'createEscrow',
		inputs: [{ name: 'escrowId', type: 'uint256' }],
		outputs: [],
		stateMutability: 'nonpayable' as const
	}
];

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		getABI: () => minimalEscrowABI
	}
}));

vi.mock('$lib/utils/wallet/contractDetection', () => ({
	hasContractInteraction: (input: string | null | undefined) => !!input && input.length > 10
}));

describe('functionParsing', () => {
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

		it('should return null for selector with wrong length', () => {
			expect(decodeUnknownFunction('0x1234')).toBeNull();
			expect(decodeUnknownFunction('')).toBeNull();
		});
	});

	describe('parseFunction', () => {
		it('should decode common functions for unknown contract type', () => {
			const result = parseFunction('0xa9059cbb000000000000000000000000', 'unknown');
			expect(result).not.toBeNull();
			if (result) {
				expect(result.functionName).toBe('transfer');
				expect(result.functionSelector).toBe('0xa9059cbb');
				expect(result.parameters).toEqual({});
			}
		});

		it('should return selector only for unknown functions when contract type is unknown', () => {
			const result = parseFunction(
				'0x123456780000000000000000000000000000000000000000000000000000000000000001',
				'unknown'
			);
			expect(result).not.toBeNull();
			if (result) {
				expect(result.functionSelector).toBe('0x12345678');
				expect(result.functionName).toBeNull();
				expect(result.parameters).toEqual({});
			}
		});

		it('should return null for non-contract interactions', () => {
			expect(parseFunction('0x', 'escrow')).toBeNull();
			expect(parseFunction(null, 'escrow')).toBeNull();
			expect(parseFunction('0x12', 'unknown')).toBeNull();
		});

		it('should attempt escrow parse first when contract type is escrow', () => {
			const result = parseFunction(
				'0x123456780000000000000000000000000000000000000000000000000000000000000001',
				'escrow'
			);
			expect(result).not.toBeNull();
			if (result) {
				expect(result.functionSelector).toBe('0x12345678');
			}
		});
	});

	describe('parseEscrowFunction', () => {
		it('should return null for selector not in escrow ABI', () => {
			const result = parseEscrowFunction(
				'0x123456780000000000000000000000000000000000000000000000000000000000000001'
			);
			expect(result).toBeNull();
		});

		it('should return null for empty input', () => {
			expect(parseEscrowFunction('')).toBeNull();
		});
	});
});
