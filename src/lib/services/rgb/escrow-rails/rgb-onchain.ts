import { isBdkAddUtxoError, prepareRgbOnchainSend } from '$lib/stores/wallet/prepare-rgb-send';
import { esploraOutputSpent } from '$lib/stores/wallet/signet-broadcast';
import { FAUCET_IFA_ASSET } from '$lib/stores/wallet/signet-lsp';
import { BTC_SEND_MS, callWithDeadline } from '$lib/stores/wallet/wallet-send';
import { ESCROW_LNUSDT } from '../escrow-rail';
import { keptSendProof, loadEscrowSend, requireEscrowSigner, runEscrowSend } from '../psbt-escrow';
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
	amount: number,
	acceptStuckChange = false
): Promise<EscrowProof> {
	if (assetId === ESCROW_LNUSDT) {
		throw new Error('On-chain RGB cannot use the LN USDT asset');
	}
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		throw new Error('USDT amount must be a positive whole number');
	}
	const signerWallet = wallet as Parameters<typeof prepareRgbOnchainSend>[0];
	const cap = await prepareRgbOnchainSend(
		signerWallet,
		assetId,
		undefined,
		esploraOutputSpent,
		amount,
		acceptStuckChange
	);
	const listed = signerWallet.listAssets
		? await signerWallet.listAssets().catch(() => undefined)
		: undefined;
	const booked = [...(listed?.nia ?? []), ...(listed?.ifa ?? [])].find(
		(row) => row.assetId === assetId
	)?.balance?.spendable;
	const spendable = typeof cap === 'number' ? cap : booked;
	let sent: Awaited<ReturnType<typeof runEscrowSend>>;
	try {
		sent = await callWithDeadline(
			runEscrowSend(requireEscrowSigner(wallet), {
				assetId,
				amount,
				invoice,
				spendable,
				acceptStuckChange
			}),
			BTC_SEND_MS,
			'USDT send stopped before it was built. Nothing was sent.'
		);
	} catch (error: unknown) {
		const kept = keptSendProof(invoice, loadEscrowSend());
		if (kept) return { kind: 'txid', value: kept };
		if (isBdkAddUtxoError(error)) {
			throw new Error('This USDT output was already spent. Nothing was sent.');
		}
		throw error;
	}
	if (!sent.txid) throw new Error('On-chain RGB send did not return a txid');
	return { kind: 'txid', value: sent.txid };
}
