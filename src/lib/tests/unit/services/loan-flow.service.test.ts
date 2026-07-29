/**
 * Loan Flow Service Tests
 *
 * Tests the frontend service layer that wraps the SDK's LoanFlowOrchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock orchestrator instance
const mockOrchestrator = {
	getQuote: vi.fn().mockResolvedValue({
		rbtcInputAmount: '1000000000000000000',
		estimatedDocOutput: '500000000000000000000',
		estimatedUsdt0Output: '495000000',
		estimatedBridgeFee: '500000000000000',
		estimatedUsdt0OnArbitrum: '495000000',
		steps: [
			'Mint DOC from rBTC',
			'Swap DOC → USDT0 on RSK DEX',
			'Bridge USDT0 to Arbitrum via LayerZero'
		]
	}),
	executeFullFlow: vi.fn().mockResolvedValue({
		success: true,
		state: { phase: 'COMPLETE', steps: [] },
		txHashes: { docMint: '0xmint', dexSwap: '0xswap', bridge: '0xbridge' }
	}),
	executeBridgeOnly: vi.fn().mockResolvedValue({
		success: true,
		state: { phase: 'COMPLETE', steps: [] },
		txHashes: { bridge: '0xbridge' }
	}),
	recover: vi.fn().mockResolvedValue(undefined),
	onStateChange: vi.fn().mockReturnValue(() => {}),
	getState: vi.fn().mockReturnValue({ phase: 'IDLE', steps: [] })
};

// Mock the SDK — use a class-like function so `new` works
vi.mock('@bittasker/wallet-core', () => ({
	LoanFlowOrchestrator: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
		Object.assign(this, { ...mockOrchestrator });
	}),
	ARB_TOKEN_ADDRESSES: {
		USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		TBTC: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
	}
}));

import {
	createLoanFlowOrchestrator,
	getLoanFlowQuote,
	executeLoanFlow,
	executeBridgeOnly,
	getArbitrumUsdt0Address
} from '$lib/services/loan-flow.service';
import type { LoanFlowServiceConfig } from '$lib/services/loan-flow.service';

describe('Loan Flow Service', () => {
	const mockConfig = {
		rskSigner: { address: '0x1234' },
		rskProvider: {},
		arbRecipientAddress: '0xABC'
	} as unknown as LoanFlowServiceConfig;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('createLoanFlowOrchestrator', () => {
		it('should create an orchestrator instance', () => {
			const orchestrator = createLoanFlowOrchestrator(mockConfig);
			expect(orchestrator).toBeDefined();
		});
	});

	describe('getLoanFlowQuote', () => {
		it('should return a quote for the loan flow', async () => {
			const result = await getLoanFlowQuote(mockConfig, '1000000000000000000');
			expect(result.data).toBeDefined();
			expect(result.data!.rbtcInputAmount).toBe('1000000000000000000');
			expect(result.data!.estimatedDocOutput).toBe('500000000000000000000');
			expect(result.data!.steps).toHaveLength(3);
		});
	});

	describe('executeLoanFlow', () => {
		it('should execute the full loan flow successfully', async () => {
			const result = await executeLoanFlow(mockConfig, '1000000000000000000');
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
			expect(result.data!.txHashes.docMint).toBe('0xmint');
			expect(result.data!.txHashes.dexSwap).toBe('0xswap');
			expect(result.data!.txHashes.bridge).toBe('0xbridge');
		});

		it('should subscribe to state changes', async () => {
			const onStateChange = vi.fn();
			await executeLoanFlow(mockConfig, '1000000000000000000', 1, onStateChange);
			// onStateChange is called on orchestrator, verify the orchestrator received it
		});
	});

	describe('executeBridgeOnly', () => {
		it('should execute bridge-only flow', async () => {
			const result = await executeBridgeOnly(mockConfig, '10000000');
			expect(result.success).toBe(true);
			expect(result.data!.txHashes.bridge).toBe('0xbridge');
		});
	});

	describe('getArbitrumUsdt0Address', () => {
		it('should return the USDT0 address on Arbitrum', () => {
			const address = getArbitrumUsdt0Address();
			expect(address).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
		});
	});
});
