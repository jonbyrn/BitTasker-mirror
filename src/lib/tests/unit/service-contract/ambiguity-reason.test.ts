import { describe, expect, it } from 'vitest';
import { classifyServiceAcceptanceAmbiguityError } from '$lib/utils/service-contract/ambiguity-reason';

describe('classifyServiceAcceptanceAmbiguityError', () => {
	it('returns pending_timeout for timeout failures', () => {
		expect(
			classifyServiceAcceptanceAmbiguityError(new Error('Transaction wait timeout after 5 minutes'))
		).toBe('pending_timeout');
	});

	it('returns nonce_conflict for nonce-related failures', () => {
		expect(
			classifyServiceAcceptanceAmbiguityError(
				new Error('Nonce too low for replacement transaction')
			)
		).toBe('nonce_conflict');
	});

	it('returns rpc_unavailable for rpc, provider, or network failures', () => {
		expect(
			classifyServiceAcceptanceAmbiguityError(
				new Error('RPC connection lost while waiting for receipt')
			)
		).toBe('rpc_unavailable');
		expect(classifyServiceAcceptanceAmbiguityError(new Error('Provider disconnected'))).toBe(
			'rpc_unavailable'
		);
	});

	it('returns null for unrelated or non-error inputs', () => {
		expect(classifyServiceAcceptanceAmbiguityError(new Error('user rejected'))).toBeNull();
		expect(classifyServiceAcceptanceAmbiguityError('nonce too low')).toBeNull();
		expect(classifyServiceAcceptanceAmbiguityError(null)).toBeNull();
	});
});
