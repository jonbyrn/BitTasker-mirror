import { state } from './wallet-state';

export async function sendLightningPayment(lnInvoice: string): Promise<{ txid: string }> {
	const wallet = state.utexoWallet;
	if (!wallet) throw new Error('UTEXO wallet is not initialized');
	const res = await wallet.payLightningInvoice({ lnInvoice });
	return { txid: res.txid };
}

export async function sendRgbAsset(
	assetId: string,
	invoice: string,
	amount?: number
): Promise<{ txid: string; batchTransferIdx: number }> {
	const wallet = state.utexoWallet;
	if (!wallet) throw new Error('UTEXO wallet is not initialized');
	const res = await wallet.onchainSend({
		assetId,
		invoice,
		...(amount === undefined ? {} : { amount })
	});
	return { txid: res.txid, batchTransferIdx: res.batchTransferIdx };
}

export interface SendBtcParams {
	address: string;
	amountSats: number;
	feeRate?: number;
	skipSync?: boolean;
}

export async function sendBtc(params: SendBtcParams): Promise<string> {
	if (!params.address.trim()) throw new Error('Bitcoin destination address is required');
	if (!Number.isSafeInteger(params.amountSats) || params.amountSats <= 0) {
		throw new Error('Bitcoin amount must be a positive whole number of sats');
	}
	if (params.feeRate !== undefined && (!Number.isFinite(params.feeRate) || params.feeRate <= 0)) {
		throw new Error('Bitcoin fee rate must be positive');
	}
	const wallet = state.utexoWallet;
	if (!wallet) throw new Error('UTEXO wallet is not initialized');
	return wallet.sendBtc({
		address: params.address.trim(),
		amount: params.amountSats,
		feeRate: params.feeRate ?? 1,
		skipSync: params.skipSync
	});
}
