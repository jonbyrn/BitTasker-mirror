import { ethers } from 'ethers';
import { getRSKAddress } from '$lib/stores/wallet.store';

export const DEFAULT_PROVIDER_PROPOSAL_FEE_TIER = 1 as const;

export interface ProviderProposalAuthoringReady {
	ok: true;
	walletAddress: string;
	freelancerFeeTier: typeof DEFAULT_PROVIDER_PROPOSAL_FEE_TIER;
}

export interface ProviderProposalAuthoringBlocked {
	ok: false;
	error: string;
}

export type ProviderProposalAuthoringState =
	| ProviderProposalAuthoringReady
	| ProviderProposalAuthoringBlocked;

const MISSING_WALLET_ERROR = 'Connect your wallet before sending a proposal.';

function normalizeProviderWalletAddress(walletAddress: string): string {
	return ethers.getAddress(walletAddress.trim().toLowerCase());
}

export function resolveProviderProposalAuthoring(
	walletAddress: string | null | undefined
): ProviderProposalAuthoringState {
	if (!walletAddress) {
		return {
			ok: false,
			error: MISSING_WALLET_ERROR
		};
	}

	try {
		return {
			ok: true,
			walletAddress: normalizeProviderWalletAddress(walletAddress),
			freelancerFeeTier: DEFAULT_PROVIDER_PROPOSAL_FEE_TIER
		};
	} catch {
		return {
			ok: false,
			error: MISSING_WALLET_ERROR
		};
	}
}

export async function ensureProviderProposalAuthoring(
	walletAddress: string | null | undefined
): Promise<ProviderProposalAuthoringState> {
	const resolvedAddress = walletAddress || (await getRSKAddress());
	return resolveProviderProposalAuthoring(resolvedAddress);
}
