export type EscrowRailId = 'rgb_onchain_usdt' | 'ln_btc' | 'ln_usdt';

export interface EscrowProof {
	kind: 'txid' | 'preimage' | 'lsp_mapping';
	value: string;
	paymentHash?: string;
	consignmentId?: string;
}

export function proofReady(proof: EscrowProof | undefined): boolean {
	return Boolean(proof && proof.value.trim().length > 0);
}
