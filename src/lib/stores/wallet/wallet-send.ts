import { state } from './wallet-state';

export async function sendLightningPayment(lnInvoice: string): Promise<{ txid: string }> {
	console.info('[sendLightningPayment] stub called', { lnInvoice });
	return { txid: 'ln_stub_' + Date.now() };
}

export async function sendRgbAsset(
	assetId: string,
	invoice: string,
	amount?: number
): Promise<{ txid: string; batchTransferIdx: number }> {
	console.info('[sendRgbAsset] stub called', { assetId, invoice, amount });
	return { txid: 'rgb_stub_' + Date.now(), batchTransferIdx: 0 };
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
		feeRate: params.feeRate ?? 1
	});
}

