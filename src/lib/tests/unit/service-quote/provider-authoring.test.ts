import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PROVIDER_PROPOSAL_FEE_TIER,
	resolveProviderProposalAuthoring
} from '$lib/utils/service-quote/provider-authoring';

describe('provider proposal authoring', () => {
	it('normalizes the provider wallet and defaults the fee tier to one', () => {
		expect(resolveProviderProposalAuthoring('0x1234567890123456789012345678901234567890')).toEqual({
			ok: true,
			walletAddress: '0x1234567890123456789012345678901234567890',
			freelancerFeeTier: DEFAULT_PROVIDER_PROPOSAL_FEE_TIER
		});
	});

	it('fails closed when the provider wallet is missing', () => {
		expect(resolveProviderProposalAuthoring(null)).toEqual({
			ok: false,
			error: 'Connect your wallet before sending a proposal.'
		});
	});

	it('fails closed when the provider wallet cannot be normalized', () => {
		expect(resolveProviderProposalAuthoring('not-an-address')).toEqual({
			ok: false,
			error: 'Connect your wallet before sending a proposal.'
		});
	});
});

