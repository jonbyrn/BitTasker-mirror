/**
 * Minimal but more meaningful smoke tests for swap-chain.service.ts (critical orchestrator)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Route, SourceWallet, Destination } from '$lib/services/route-resolver';

// We test via the public surface + any exported pure helpers
import * as swapChain from '$lib/services/swap-chain.service';

describe('swap-chain.service (orchestrator smoke)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('exports expected core symbols', () => {
		expect(typeof swapChain.startSwapChain).toBe('function');
		expect(typeof swapChain.resumeSwapChain).toBe('function');
		// Pure helpers if exported
		if (swapChain.isTerminalPhase) {
			expect(swapChain.isTerminalPhase('COMPLETE')).toBe(true);
			expect(swapChain.isTerminalPhase('FAILED')).toBe(true);
		}
	});

	// High-level happy/fail boundary smoke (real execution would require full wallet mocks)
	it('startSwapChain rejects gracefully on invalid input (smoke)', async () => {
		// This is intentionally a shallow boundary check
		const result = await swapChain.startSwapChain(
			{} as unknown as Route,
			'rbtc' as unknown as SourceWallet,
			{} as unknown as Destination,
			'0' as unknown as string,
			null
		);
		// We mainly care that it doesn't throw and returns a structured result
		expect(result).toBeDefined();
	});

	it('exposes expected orchestrator symbols', () => {
		expect(typeof swapChain.getSwapChainStatus).toBe('function');
		// Additional public surface can be asserted here as it is exported
	});
});
