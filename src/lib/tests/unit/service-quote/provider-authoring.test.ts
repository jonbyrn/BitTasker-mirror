import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_PROVIDER_PROPOSAL_FEE_TIER,
	ensureProviderProposalAuthoring,
	resolveProviderProposalAuthoring
} from '$lib/utils/service-quote/provider-authoring';

vi.mock('$lib/stores/wallet.store', () => ({
	getRSKAddress: () => Promise.resolve('0x1234567890123456789012345678901234567890')
}));

describe('provider proposal authoring', () => {
	it('normalizes the provider wallet and defaults the fee tier to one', () => {
		expect(resolveProviderProposalAuthoring('0x1234567890123456789012345678901234567890')).toEqual({
			ok: true,
			walletAddress: '0x1234567890123456789012345678901234567890',
			freelancerFeeTier: DEFAULT_PROVIDER_PROPOSAL_FEE_TIER
		});
	});

	it('accepts mixed-case Rootstock-style addresses by normalizing before validation', () => {
		expect(resolveProviderProposalAuthoring('0x45aFd3dAdc7CeFcc6c4B6bAf66299da085583361')).toEqual({
			ok: true,
			walletAddress: '0x45aFD3daDc7CEfCC6C4B6bAF66299da085583361',
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

	it('resolves the provider wallet on demand when the store address is missing', async () => {
		await expect(ensureProviderProposalAuthoring(null)).resolves.toEqual({
			ok: true,
			walletAddress: '0x1234567890123456789012345678901234567890',
			freelancerFeeTier: DEFAULT_PROVIDER_PROPOSAL_FEE_TIER
		});
	});
});
