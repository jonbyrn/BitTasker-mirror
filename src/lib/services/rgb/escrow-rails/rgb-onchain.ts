import { FAUCET_IFA_ASSET } from '$lib/stores/wallet/signet-lsp';
import { ESCROW_LNUSDT } from '../escrow-rail';
import { requireEscrowSigner, runEscrowSend } from '../psbt-escrow';
import type { EscrowProof } from './types';

/** On-chain RGB uses the faucet IFA, never the LN USDT asset. */
export function onchainUsdtId(held: string | undefined): string {
	if (!held || held === ESCROW_LNUSDT) return FAUCET_IFA_ASSET;
	return held;
}

export async function payOnchainUsdt(
	wallet: object,
	invoice: string,
	assetId: string,
	amount: number
): Promise<EscrowProof> {
	if (assetId === ESCROW_LNUSDT) {
		throw new Error('On-chain RGB cannot use the LN USDT asset');
	}
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		throw new Error('USDT amount must be a positive whole number');
	}
	const sent = await runEscrowSend(requireEscrowSigner(wallet), { assetId, amount, invoice });
	if (!sent.txid) throw new Error('On-chain RGB send did not return a txid');
	return { kind: 'txid', value: sent.txid };
}
