import {
	assertChangeReturns,
	broadcastEscrowPsbt,
	buildEscrowPsbt,
	failOpenSend,
	requireEscrowSigner,
	signEscrowPsbt
} from '$lib/services/rgb/psbt-escrow';
import { soleIfaAsset, type SpendableNia } from '$lib/types/rgb-contract';
import { contractAssetId, decodeRgbInvoice } from './decode-rgb-invoice';
import { confirmSignetTx, extractSignedTx, publishSignetTx } from './signet-broadcast';
import {
	acceptNextUsdtDrop,
	flushWalletState,
	loadAssets,
	persistWalletSnapshot,
	pullIncomingTransfers
} from './wallet-balances';
import { feeEstimateSats } from './plain-wallet';
import { parseWalletUtxos, uncoloredSats } from './rgb-allocations';
import {
	changeRoomBlocker,
	changeStillBooked,
	isBdkAddUtxoError,
	lockedCoinBlocker,
	prepareRgbOnchainSend,
	type RgbUnspentRef
} from './prepare-rgb-send';
import { state, walletStore } from './wallet-state';
import { rememberUsdtSend } from './wallet-transactions';
import type { Transaction } from './wallet-types';
import { wasmBusy } from './wasm-lock';

export async function sendLightningPayment(lnInvoice: string): Promise<{ txid: string }> {
	console.info('[sendLightningPayment] stub called', { lnInvoice });
	return { txid: 'ln_stub_' + Date.now() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** rgb-lib `spendable` only. Settled, future, and pending receives are not spendable. */
export function balanceSpendable(raw: unknown, assetId = ''): number | null {
	if (Array.isArray(raw)) {
		const row = raw.find(
			(item) =>
				isRecord(item) &&
				(!assetId || item.assetId === assetId || String(item.ticker ?? '').toUpperCase() === 'USDT')
		);
		return row ? balanceSpendable(row, assetId) : null;
	}
	if (!isRecord(raw)) return null;
	if (
		typeof raw.spendable === 'number' &&
		Number.isSafeInteger(raw.spendable) &&
		raw.spendable >= 0
	) {
		return raw.spendable;
	}
	if (isRecord(raw.balance)) return balanceSpendable(raw.balance, assetId);
	for (const group of ['ifa', 'nia', 'cfa', 'uda'] as const) {
		if (!Array.isArray(raw[group])) continue;
		const row = raw[group].find(
			(item) =>
				isRecord(item) &&
				(item.assetId === assetId || String(item.ticker ?? '').toUpperCase() === 'USDT')
		);
		if (isRecord(row)) return balanceSpendable(row, assetId);
	}
	return null;
}

export type RgbSendHold = '' | 'fee' | 'locked';

function listedUnspents(value: unknown): RgbUnspentRef[] {
	if (!Array.isArray(value)) return [];
	return value.filter((row): row is RgbUnspentRef => {
		if (!row || typeof row !== 'object') return false;
		const record = row as RgbUnspentRef;
		return (
			Array.isArray(record.rgbAllocations) &&
			typeof record.utxo === 'object' &&
			record.utxo !== null
		);
	});
}

/**
 * Why a USDT send must wait. `fee` means the rest would not come back.
 * `locked` means an old receive code still holds the coin.
 */
export async function rgbSendBlock(
	wallet: { listUnspents?: () => Promise<unknown> },
	assetId: string,
	spendable: number,
	sendAmount: number
): Promise<RgbSendHold> {
	if (!assetId || typeof wallet.listUnspents !== 'function') return '';
	let listed: unknown;
	try {
		listed = await wallet.listUnspents();
	} catch (error: unknown) {
		console.warn(
			'[wallet-send] coin check failed',
			error instanceof Error ? error.message : String(error)
		);
		return '';
	}
	const unspents = listedUnspents(listed);
	if (unspents.length === 0) return '';
	if (lockedCoinBlocker(unspents, assetId)) return 'locked';
	if (changeRoomBlocker(unspents, assetId, spendable, sendAmount)) return 'fee';
	return '';
}

/** True when spendable covers the invoice. Pending receives are not an input. */
export function sendEnabled(spendable: number, invoiceUnits: number): boolean {
	if (!Number.isSafeInteger(spendable) || !Number.isSafeInteger(invoiceUnits)) return false;
	return invoiceUnits > 0 && spendable >= invoiceUnits;
}

interface SpendableWallet {
	getAssetBalance?: (assetId: string) => Promise<unknown>;
	listAssets?: () => Promise<unknown>;
	listTransfers?: (assetId?: string) => Promise<unknown>;
}

/** `getAssetBalance(assetId).spendable`, then listAssets. Never `future`. */
function assetMissing(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /not found|memory access out of bounds|null pointer/i.test(message);
}

export async function quoteSpendable(wallet: SpendableWallet, assetId: string): Promise<number> {
	if (assetId && typeof wallet.getAssetBalance === 'function') {
		try {
			const units = balanceSpendable(await wallet.getAssetBalance(assetId), assetId);
			if (units !== null) return units;
		} catch (error) {
			if (!assetMissing(error)) throw error;
		}
	}
	if (typeof wallet.listAssets === 'function') {
		const units = balanceSpendable(await wallet.listAssets(), assetId);
		if (units !== null) return units;
	}
	return 0;
}

export function pendingReceiveCount(rows: unknown): number {
	if (!Array.isArray(rows)) return 0;
	return rows.filter((row) => {
		if (!isRecord(row) || row.kind !== 'ReceiveBlind') return false;
		const status = typeof row.status === 'string' ? row.status : '';
		return status !== '' && status !== 'Settled' && status !== 'Failed';
	}).length;
}

/** Wallet and wasm failures often arrive with an empty Error.message. */
export function describeThrown(error: unknown): string {
	if (error instanceof Error) {
		const message = error.message.trim();
		if (message) return message;
		const frame = error.stack
			?.split('\n')
			.map((line) => line.trim())
			.find((line) => line.length > 0);
		return frame || error.name || 'Send failed';
	}
	if (typeof error === 'string' && error.trim()) return error.trim();
	if (typeof error === 'object' && error !== null) {
		const record = error as Record<string, unknown>;
		if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
		try {
			const json = JSON.stringify(error);
			if (json && json !== '{}') return json;
		} catch (stringifyError: unknown) {
			console.warn(
				'[wallet-send] error stringify failed',
				stringifyError instanceof Error ? stringifyError.message : String(stringifyError)
			);
		}
	}
	const text = String(error);
	return text === '[object Object]' ? 'Send failed' : text;
}

function ifaUsdtId(rows: readonly SpendableNia[]): string | undefined {
	const sole = soleIfaAsset(rows);
	if (sole) return sole.assetId;
	const held = rows.find((row) => (row.ticker ?? '').toUpperCase() === 'USDT' && row.assetId);
	return held?.assetId;
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
	acceptNextUsdtDrop();
	rememberUsdtSend(row);
	walletStore.update((current) => ({
		...current,
		transactions: [
			row,
			...(current.transactions ?? []).filter((item) => item.txHash !== txid && item.id !== txid)
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
	const ifaRows = listed?.ifa ?? [];
	const assetId = contractAssetId(decoded.contract) || ifaUsdtId(ifaRows);
	if (!assetId) {
		throw new Error(
			decoded.contract
				? 'This wallet has no spendable USDT.'
				: 'Select the funded IFA USDT. This invoice names no contract.'
		);
	}
	const spendable = await quoteSpendable(wallet, assetId);
	if (!sendEnabled(spendable, units)) {
		throw new Error(
			spendable <= 0 ? 'Not spendable yet' : 'USDT amount is larger than the spendable balance.'
		);
	}
	await prepareRgbOnchainSend(wallet, assetId, spendable, undefined, units);
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
		psbt = await callWithDeadline(
			buildEscrowPsbt(signer, {
				invoice,
				assetId,
				amount: units,
				feeRate: 2
			}),
			RGB_BUILD_MS,
			'USDT send stopped before it was built. Nothing was sent.'
		);
	} catch (error: unknown) {
		const message = isBdkAddUtxoError(error)
			? 'This USDT output was already spent. Nothing was sent.'
			: describeThrown(error);
		console.error(
			'[wallet-send] onchainSendBegin rejected',
			message,
			error instanceof Error ? error.stack : error
		);
		throw new Error(message);
	}
	try {
		assertChangeReturns(psbt, spendable, units);
	} catch (error) {
		await failOpenSend(signer);
		throw error;
	}
	const signed = await signEscrowPsbt(signer, psbt);
	console.info('[wallet-send] onchainSendBegin psbt', { psbtChars: psbt.length });
	const claimed = await broadcastEscrowPsbt(signer, signed);
	const raw = extractSignedTx(signed);
	if (raw.txid !== claimed) {
		console.error('[wallet-send] onchainSendEnd txid is not the signed transaction', {
			onchainSendEnd: claimed,
			signed: raw.txid
		});
		throw new Error('onchainSendEnd txid is not the signed transaction');
	}
	await publishSignetTx(raw.hex);
	await confirmSignetTx(raw.txid);
	const txid = raw.txid;
	await pullIncomingTransfers(wallet, { skipSync: false, assetId }).catch((error: unknown) => {
		console.warn('[wallet-send] refresh after send failed', describeThrown(error));
	});
	let after: number | null = null;
	if (typeof wallet.getAssetBalance === 'function') {
		try {
			after = balanceSpendable(await wallet.getAssetBalance(assetId), assetId);
		} catch (error: unknown) {
			if (!assetMissing(error)) {
				console.warn('[wallet-send] balance after send failed', describeThrown(error));
			}
		}
	}
	if (after !== null && changeStillBooked(after, spendable, units)) {
		throw new Error(
			`RGB still shows the full balance after ${txid}. Refresh transfers before sending again.`
		);
	}
	await persistWalletSnapshot(wallet).catch((error: unknown) => {
		console.warn(
			'[wallet-send] backup after send failed',
			error instanceof Error ? error.message : String(error)
		);
	});
	recordSentUsdt(txid, units);
	await loadAssets().catch((error: unknown) => {
		console.warn('[wallet-send] balance reload failed', describeThrown(error));
	});
	return { txid, batchTransferIdx: 0 };
}

export interface SendBtcParams {
	address: string;
	amountSats: number;
	feeRate?: number;
	skipSync?: boolean;
}

/** On-chain send must not sit on a spinner with no txid. A real send can take about 70s. */
export const BTC_SEND_MS = 120_000;

/** RGB PSBT build must fail in seconds when a spent seal is still listed. */
export const RGB_BUILD_MS = 20_000;
const IDLE_WAIT_MS = 8_000;

export function callWithDeadline<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), ms);
		work.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

async function waitUntilIdle(): Promise<void> {
	const start = Date.now();
	while (wasmBusy()) {
		if (Date.now() - start >= IDLE_WAIT_MS) {
			throw new Error('Wallet is busy. Wait until it says Ready, then send once.');
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
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
	const coins = wallet as { listUnspents?: () => Promise<unknown> };
	if (typeof coins.listUnspents === 'function') {
		const rows = await coins.listUnspents().catch(() => null);
		const parsed = rows === null ? [] : parseWalletUtxos(rows);
		const carriesUsdt = parsed.some((row) => row.kind === 'colored' || row.kind === 'receiving');
		const fee = feeEstimateSats(params.feeRate ?? 1);
		if (carriesUsdt && uncoloredSats(rows) < params.amountSats + fee) {
			throw new Error('Not enough bitcoin');
		}
	}
	await waitUntilIdle();
	const txid = await callWithDeadline(
		wallet.sendBtc({
			address: params.address.trim(),
			amount: params.amountSats,
			feeRate: params.feeRate ?? 1
		}),
		BTC_SEND_MS,
		'Bitcoin send timed out before broadcast. Nothing was sent.'
	);
	await flushWalletState(wallet);
	const sync = wallet as { syncWallet?: () => Promise<unknown> };
	if (typeof sync.syncWallet === 'function') {
		await sync.syncWallet().catch((error: unknown) => {
			console.warn('[wallet-send] sync after send failed', describeThrown(error));
		});
	}
	await loadAssets().catch((error: unknown) => {
		console.warn('[wallet-send] balance reload failed', describeThrown(error));
	});
	return txid;
}
