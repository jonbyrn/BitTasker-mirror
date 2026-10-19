import { isBdkAddUtxoError, prepareRgbOnchainSend } from '$lib/stores/wallet/prepare-rgb-send';
import { esploraOutputSpent } from '$lib/stores/wallet/signet-broadcast';
import { FAUCET_IFA_ASSET } from '$lib/stores/wallet/signet-lsp';
import { callWithDeadline, RGB_BUILD_MS } from '$lib/stores/wallet/wallet-send';
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
	await prepareRgbOnchainSend(
		wallet as Parameters<typeof prepareRgbOnchainSend>[0],
		assetId,
		undefined,
		esploraOutputSpent,
		amount
	);
	let sent: Awaited<ReturnType<typeof runEscrowSend>>;
	try {
		sent = await callWithDeadline(
			runEscrowSend(requireEscrowSigner(wallet), { assetId, amount, invoice }),
			RGB_BUILD_MS,
			'USDT send stopped before it was built. Nothing was sent.'
		);
	} catch (error: unknown) {
		if (isBdkAddUtxoError(error)) {
			throw new Error('This USDT output was already spent. Nothing was sent.');
		}
		throw error;
	}
	if (!sent.txid) throw new Error('On-chain RGB send did not return a txid');
	return { kind: 'txid', value: sent.txid };
}
