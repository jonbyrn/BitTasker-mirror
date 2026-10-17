import { walletManager } from '$lib/stores/wallet/wallet-manager';
import { payEscrowLightning } from '$lib/stores/wallet/signet-lsp';
import { ESCROW_LNUSDT, isEscrowBolt11, lnUsdtOpen, refusedBotPayee } from '../escrow-rail';
import type { EscrowProof } from './types';

/** LN USDT pays the LSP asset only. The faucet IFA stays on the on-chain rail. */
export async function payLnUsdt(
	channels: unknown,
	invoice: string,
	amount: number
): Promise<EscrowProof> {
	if (!lnUsdtOpen(channels)) throw new Error('LSP channel is not open');
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		throw new Error('USDT amount must be a positive whole number');
	}
	const mappingId = await payEscrowLightning(invoice, ESCROW_LNUSDT, amount);
	if (!mappingId) throw new Error('LN USDT payment did not return a mapping id');
	return { kind: 'lsp_mapping', value: mappingId };
}

interface LnAssetWallet {
	listChannels?: () => Promise<unknown>;
	decodeLnInvoice: (invoice: string) => Promise<{
		payee?: string;
		assetId?: string;
		assetAmount?: number | bigint | null;
	}>;
}

/** Pay a Lightning invoice that carries the LN-USDT amount. One attempt. */
export async function payLnUsdtBolt11(
	wallet: LnAssetWallet,
	invoice: string,
	amount: number
): Promise<EscrowProof> {
	if (!isEscrowBolt11(invoice)) throw new Error('LN-USDT escrow requires a Lightning invoice');
	const channels = typeof wallet.listChannels === 'function' ? await wallet.listChannels() : [];
	if (!lnUsdtOpen(channels)) throw new Error('Lightning not ready');
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		throw new Error('USDT amount must be a positive whole number');
	}
	const decoded = await wallet.decodeLnInvoice(invoice);
	if (refusedBotPayee(decoded.payee)) throw new Error('Lightning peer is refused');
	if (decoded.assetId && decoded.assetId !== ESCROW_LNUSDT) {
		throw new Error('Lightning invoice is for a different asset');
	}
	const invoiced =
		typeof decoded.assetAmount === 'bigint' ? Number(decoded.assetAmount) : decoded.assetAmount;
	if (invoiced != null && invoiced !== amount) {
		throw new Error('Lightning invoice amount does not match the locked USDT');
	}
	const paid = await walletManager.payLightningInvoice({
		lnInvoice: invoice,
		assetId: ESCROW_LNUSDT,
		assetAmount: amount
	});
	if (paid.status !== 'Succeeded' && paid.status !== 'settled') {
		throw new Error('Lightning payment did not succeed');
	}
	return {
		kind: 'preimage',
		value: paid.preimage || paid.txid,
		paymentHash: paid.paymentHash
	};
}
