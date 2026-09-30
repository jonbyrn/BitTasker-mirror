import {
	broadcastEscrowPsbt,
	buildEscrowPsbt,
	requireEscrowSigner,
	signEscrowPsbt
} from '$lib/services/rgb/psbt-escrow';
import { soleIfaAsset, spendableRgbAssets, type SpendableNia } from '$lib/types/rgb-contract';
import { decodeRgbInvoice } from './decode-rgb-invoice';
import { confirmSignetTx, extractSignedTx, publishSignetTx } from './signet-broadcast';
import { persistWalletSnapshot } from './wallet-balances';
import { prepareRgbOnchainSend } from './prepare-rgb-send';
import { state, walletStore } from './wallet-state';
import type { Transaction } from './wallet-types';

export async function sendLightningPayment(lnInvoice: string): Promise<{ txid: string }> {
	console.info('[sendLightningPayment] stub called', { lnInvoice });
	return { txid: 'ln_stub_' + Date.now() };
}

function ifaUnits(row: SpendableNia | undefined): number {
	return soleIfaAsset(row ? [row] : [])?.units ?? 0;
}

function ifaUsdtId(rows: readonly SpendableNia[]): string | undefined {
	const sole = soleIfaAsset(rows);
	if (sole) return sole.assetId;
	const held = rows.find((row) => (row.ticker ?? '').toUpperCase() === 'USDT' && row.assetId);
	return held?.assetId && ifaUnits(held) > 0 ? held.assetId : undefined;
}

function recordSentUsdt(txid: string, units: number): void {
	const row: Transaction = {
		id: txid,
		type: 'send',
		amountSats: 0,
		assetUnits: units,
		timestamp: Date.now(),
		status: 'pending',
		txHash: txid,
		description: 'rgb usdt'
	};
	walletStore.update((current) => ({
		...current,
		transactions: [
			row,
			...current.transactions.filter((item) => item.txHash !== txid && item.id !== txid)
		]
	}));
}

export async function sendRgbAsset(params: {
	invoice: string;
	assetId: string;
	amount?: number;
}): Promise<{ txid: string; batchTransferIdx: number }> {
	const wallet = state.utexoWallet;
	if (!wallet) throw new Error('RGB wallet is not initialized.');
	const decoded = decodeRgbInvoice(params.invoice);
	const amount = decoded.amount === null ? params.amount : decoded.amount;
	if (amount === undefined || !Number.isSafeInteger(amount) || amount <= 0) {
		throw new Error('RGB invoice amount is zero');
	}
	const units = amount;
	const listed = await wallet.listAssets();
	const held = spendableRgbAssets(listed);
	const ifaRows = listed?.ifa ?? [];
	const assetId = decoded.contract
		? held.find((row) => row.assetId === decoded.contract)?.assetId
		: ifaUsdtId(ifaRows);
	if (!assetId) {
		throw new Error(
			decoded.contract
				? 'This wallet has no spendable USDT.'
				: 'Select the funded IFA USDT. This invoice names no contract.'
		);
	}
	const spendable = ifaUnits(held.find((row) => row.assetId === assetId));
	if (units > spendable) throw new Error('USDT amount is larger than the spendable balance.');
	await prepareRgbOnchainSend(wallet, assetId);
	const signer = requireEscrowSigner(wallet);
	const invoice = params.invoice.trim();
	const beginArgs = {
		invoice,
		assetId,
		amount: units,
		feeRate: 2,
		minConfirmations: 1
	};
	console.info('[wallet-send] onchainSendBegin', {
		method: 'onchainSendBegin',
		decoded: {
			endpoints: decoded.endpoints,
			amount: decoded.amount,
			seal: decoded.seal
		},
		args: beginArgs
	});
	let psbt: string;
	try {
		psbt = await buildEscrowPsbt(signer, {
			invoice,
			assetId,
			amount: units,
			feeRate: 2
		});
	} catch (error: unknown) {
		console.warn('[wallet-send] onchainSendBegin rejected', {
			method: 'onchainSendBegin',
			message: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}
	const signed = await signEscrowPsbt(signer, psbt);
	console.info('[wallet-send] onchainSendBegin psbt', { psbtChars: psbt.length });
	const claimed = await broadcastEscrowPsbt(signer, signed);
	const raw = extractSignedTx(signed);
	if (raw.txid !== claimed) {
		console.warn('[wallet-send] onchainSendEnd txid is not the signed transaction', {
			onchainSendEnd: claimed,
			signed: raw.txid
		});
	}
	await publishSignetTx(raw.hex);
	await confirmSignetTx(raw.txid);
	const txid = raw.txid;
	await persistWalletSnapshot(wallet).catch((error: unknown) => {
		console.warn(
			'[wallet-send] backup after send failed',
			error instanceof Error ? error.message : String(error)
		);
	});
	recordSentUsdt(txid, units);
	return { txid, batchTransferIdx: 0 };
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
