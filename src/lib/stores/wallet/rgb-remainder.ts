import { resolveSendFeeRate } from '$lib/stores/wallet/fee-rate';
import {
	freeColorableCoin,
	hasUncoloredFeeUtxo,
	openSendBatches,
	type RgbUnspentRef
} from '$lib/stores/wallet/prepare-rgb-send';

/**
 * Sats on the witness output that carries the unsent USDT.
 * rgb-lib's send-to-oneself test uses 1000. That output is created in this
 * transaction, so it cannot be selected as an input and destroyed.
 */
export const WITNESS_REMAINDER_SATS = 1000;

/**
 * Shown when the unsent USDT cannot be returned to this wallet.
 * A partial send must not tell the person to send the whole balance.
 */
export const CHANGE_NEEDS_BITCOIN =
	'Add a little bitcoin so the rest of your dollars can stay in this wallet. Nothing was sent.';

/** Plain-language step while a colorable coin is created for the USDT change. */
export type RemainderProgress = 'change-coin';

/** One new 1000-sat colorable output. The fee stays on the test-network cap. */
export function changeCoinParams(): {
	upTo: false;
	num: 1;
	size: number;
	feeRate: number;
} {
	return {
		upTo: false,
		num: 1,
		size: WITNESS_REMAINDER_SATS,
		feeRate: resolveSendFeeRate(2)
	};
}

const RGB_PROXY_ENDPOINT = 'rpcs://rgb-proxy.utexo.com/json-rpc';

export interface RemainderParty {
	recipientId: string;
	transportEndpoints: string[];
}

export interface RemainderRecipient {
	recipientId: string;
	witnessData: { amountSat: string; blinding?: number | null } | null;
	assignment: { Fungible: number };
	transportEndpoints: string[];
}

export type RemainderMap = Record<string, RemainderRecipient[]>;

type BatchSend = (params: {
	recipientMap: RemainderMap;
	feeRate?: number;
	minConfirmations?: number;
	donation?: boolean;
}) => Promise<string>;

type ReceiveCall = (params: {
	assetId: string;
	amount: number;
	minConfirmations?: number;
	durationSeconds?: number;
}) => Promise<unknown>;

interface RemainderWallet {
	sendBeginBatch?: BatchSend;
	witnessReceive?: ReceiveCall;
	blindReceive?: ReceiveCall;
	decodeRGBInvoice?: (params: { invoice: string }) => Promise<unknown>;
	failTransfers?: (params: { batchTransferIdx?: number; skipSync?: boolean }) => Promise<boolean>;
	listTransfers?: () => Promise<
		Array<{ kind: string; status: string; batchTransferIdx: number; txid?: string }>
	>;
	listUnspents?: () => Promise<unknown>;
	createUtxos?: (params: {
		upTo?: boolean;
		num?: number;
		size?: number;
		feeRate?: number;
	}) => Promise<number>;
	_manager?: { rlnBinding?: { sendBeginBatch?: BatchSend } };
}

export interface RemainderSendInput {
	invoice: string;
	assetId: string;
	amount: number;
	spendable: number;
	feeRate?: number;
	minConfirmations?: number;
	onProgress?: (step: RemainderProgress) => void;
}

/** Witness invoices need amountSat. A blinded payee must not be sent that way. */
export function witnessRecipient(recipientId: string): boolean {
	return recipientId.includes('wvout:');
}

function endpointsOrProxy(endpoints: string[]): string[] {
	const listed = endpoints.filter((endpoint) => endpoint.trim() !== '');
	return listed.length > 0 ? listed : [RGB_PROXY_ENDPOINT];
}

/**
 * One asset, two recipients, amounts that add up to the listed allocation.
 * rgb-lib adds a change seal only when the recipient sum is short of the
 * inputs. A full sum leaves that seal out.
 */
export function remainderMap(
	assetId: string,
	payee: RemainderParty,
	payAmount: number,
	remainder: RemainderParty,
	remainderAmount: number
): RemainderMap | null {
	if (!assetId.trim()) return null;
	if (!Number.isSafeInteger(payAmount) || payAmount <= 0) return null;
	if (!Number.isSafeInteger(remainderAmount) || remainderAmount <= 0) return null;
	const payeeId = payee.recipientId.trim();
	const remainderId = remainder.recipientId.trim();
	if (!payeeId || !remainderId || payeeId === remainderId) return null;
	// The payee invoice stays blinded. Our change may be a witness output or our own blinded seal.
	if (witnessRecipient(payeeId)) return null;
	return {
		[assetId]: [
			{
				recipientId: payeeId,
				witnessData: null,
				assignment: { Fungible: payAmount },
				transportEndpoints: endpointsOrProxy(payee.transportEndpoints)
			},
			{
				recipientId: remainderId,
				witnessData: witnessRecipient(remainderId)
					? { amountSat: String(WITNESS_REMAINDER_SATS) }
					: null,
				assignment: { Fungible: remainderAmount },
				transportEndpoints: endpointsOrProxy(remainder.transportEndpoints)
			}
		]
	};
}

function recordOf(value: unknown): Record<string, unknown> | null {
	if (typeof value !== 'object' || value === null) return null;
	return value as Record<string, unknown>;
}

function textField(row: Record<string, unknown>, camel: string, snake: string): string {
	const value = row[camel] ?? row[snake];
	return typeof value === 'string' ? value.trim() : '';
}

function endpointField(row: Record<string, unknown>): string[] {
	const value = row.transportEndpoints ?? row.transport_endpoints;
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function batchIndex(row: Record<string, unknown>): number | undefined {
	const value = row.batchTransferIdx ?? row.batch_transfer_idx;
	return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function batchSender(wallet: RemainderWallet): BatchSend | null {
	if (typeof wallet.sendBeginBatch === 'function') return wallet.sendBeginBatch.bind(wallet);
	const nested = wallet._manager?.rlnBinding?.sendBeginBatch;
	if (typeof nested === 'function') return nested.bind(wallet._manager?.rlnBinding);
	return null;
}

async function partyFromInvoice(
	wallet: RemainderWallet,
	invoice: string
): Promise<RemainderParty | null> {
	if (typeof wallet.decodeRGBInvoice !== 'function' || !invoice.trim()) return null;
	const decoded = recordOf(await wallet.decodeRGBInvoice({ invoice }));
	if (!decoded) return null;
	const recipientId = textField(decoded, 'recipientId', 'recipient_id');
	if (!recipientId) return null;
	return { recipientId, transportEndpoints: endpointField(decoded) };
}

async function abandonSplit(
	wallet: RemainderWallet,
	witnessIdx: number | undefined
): Promise<void> {
	if (typeof wallet.failTransfers !== 'function') return;
	const seen = new Set<number>();
	if (typeof witnessIdx === 'number') {
		seen.add(witnessIdx);
		await wallet.failTransfers({ batchTransferIdx: witnessIdx, skipSync: true }).catch(() => false);
	}
	if (typeof wallet.listTransfers !== 'function') return;
	const transfers = await wallet.listTransfers().catch(() => []);
	for (const batchTransferIdx of openSendBatches(transfers)) {
		if (seen.has(batchTransferIdx)) continue;
		await wallet.failTransfers({ batchTransferIdx, skipSync: true }).catch(() => false);
	}
}

function unspentRows(value: unknown): RgbUnspentRef[] | null {
	if (!Array.isArray(value)) return null;
	const rows: RgbUnspentRef[] = [];
	for (const row of value) {
		if (!row || typeof row !== 'object') continue;
		const utxo = (row as { utxo?: unknown }).utxo;
		if (!utxo || typeof utxo !== 'object') continue;
		rows.push(row as RgbUnspentRef);
	}
	return rows;
}

function needsFunding(error: unknown): boolean {
	const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
	return /insufficient|allocation|not enough|bitcoin|colorable|uncolored/.test(text);
}

/**
 * A witness or blinded change needs a colorable output that does not already
 * hold USDT. Create one from vanilla bitcoin only. Never spend the colored coin
 * to manufacture that output. Returns true when a new coin was created.
 */
async function makeChangeCoin(
	wallet: RemainderWallet,
	input: RemainderSendInput,
	tried: { current: boolean }
): Promise<boolean> {
	if (tried.current || typeof wallet.listUnspents !== 'function') return false;
	let listed: unknown;
	try {
		listed = await wallet.listUnspents();
	} catch (error: unknown) {
		console.warn(
			'[wallet-send] could not list coins before USDT change',
			error instanceof Error ? error.message : String(error)
		);
		return false;
	}
	const rows = unspentRows(listed);
	if (!rows || freeColorableCoin(rows)) return false;
	if (!hasUncoloredFeeUtxo(rows) || typeof wallet.createUtxos !== 'function') return false;
	tried.current = true;
	input.onProgress?.('change-coin');
	try {
		await wallet.createUtxos(changeCoinParams());
		return true;
	} catch (error: unknown) {
		console.warn(
			'[wallet-send] colorable coin for USDT change was not created',
			error instanceof Error ? error.message : String(error)
		);
		return false;
	}
}

interface OpenedChange {
	party: RemainderParty;
	idx: number | undefined;
}

async function partyFromReceive(
	wallet: RemainderWallet,
	received: unknown,
	payee: RemainderParty,
	expectWitness: boolean
): Promise<OpenedChange | null> {
	const opened = typeof received === 'string' ? { invoice: received } : recordOf(received);
	const idx = opened ? batchIndex(opened) : undefined;
	const matches = (recipientId: string) =>
		expectWitness ? witnessRecipient(recipientId) : !witnessRecipient(recipientId);
	let party: RemainderParty | null = null;
	const directId = opened ? textField(opened, 'recipientId', 'recipient_id') : '';
	if (directId && matches(directId)) {
		party = {
			recipientId: directId,
			transportEndpoints: opened ? endpointField(opened) : []
		};
	} else {
		const ownInvoice = opened ? textField(opened, 'invoice', 'invoice') : '';
		try {
			const decoded = await partyFromInvoice(wallet, ownInvoice);
			if (decoded && matches(decoded.recipientId)) party = decoded;
		} catch (error: unknown) {
			console.warn(
				'[wallet-send] remainder invoice could not be decoded',
				error instanceof Error ? error.message : String(error)
			);
		}
	}
	if (!party) {
		await abandonSplit(wallet, idx);
		return null;
	}
	if (party.transportEndpoints.length === 0) {
		party = { recipientId: party.recipientId, transportEndpoints: payee.transportEndpoints };
	}
	return { party, idx };
}

async function openChange(
	wallet: RemainderWallet,
	input: RemainderSendInput,
	payee: RemainderParty,
	remainder: number
): Promise<OpenedChange> {
	const errors: unknown[] = [];
	const confirmations = input.minConfirmations ?? 1;
	if (typeof wallet.witnessReceive === 'function') {
		try {
			const received = await wallet.witnessReceive({
				assetId: input.assetId,
				amount: remainder,
				minConfirmations: confirmations
			});
			const opened = await partyFromReceive(wallet, received, payee, true);
			if (opened) return opened;
		} catch (error: unknown) {
			console.warn(
				'[wallet-send] witness remainder was not created',
				error instanceof Error ? error.message : String(error)
			);
			errors.push(error);
		}
	}
	if (typeof wallet.blindReceive === 'function') {
		try {
			const received = await wallet.blindReceive({
				assetId: input.assetId,
				amount: remainder,
				minConfirmations: confirmations,
				durationSeconds: 86_400
			});
			const opened = await partyFromReceive(wallet, received, payee, false);
			if (opened) return opened;
		} catch (error: unknown) {
			console.warn(
				'[wallet-send] blinded remainder was not created',
				error instanceof Error ? error.message : String(error)
			);
			errors.push(error);
		}
	}
	const last = errors.at(-1);
	if (last) throw last;
	throw new Error(CHANGE_NEEDS_BITCOIN);
}

async function buildSplit(
	wallet: RemainderWallet,
	input: RemainderSendInput,
	payee: RemainderParty,
	remainder: number,
	sendBatch: BatchSend
): Promise<string> {
	const opened = await openChange(wallet, input, payee, remainder);
	const map = remainderMap(input.assetId, payee, input.amount, opened.party, remainder);
	if (!map) {
		await abandonSplit(wallet, opened.idx);
		throw new Error(CHANGE_NEEDS_BITCOIN);
	}
	try {
		console.info('[wallet-send] partial USDT assigns the remainder', {
			pay: input.amount,
			remainder,
			witness: witnessRecipient(opened.party.recipientId),
			sats: WITNESS_REMAINDER_SATS
		});
		const psbt = await sendBatch({
			recipientMap: map,
			donation: false,
			feeRate: resolveSendFeeRate(input.feeRate),
			minConfirmations: input.minConfirmations ?? 1
		});
		if (typeof psbt !== 'string' || psbt.length === 0) throw new Error(CHANGE_NEEDS_BITCOIN);
		return psbt;
	} catch (error: unknown) {
		await abandonSplit(wallet, opened.idx);
		throw error;
	}
}

/**
 * Build a partial USDT send whose remainder comes back to this wallet.
 * The change is a witness output when that can be opened, otherwise our own
 * blinded seal. Both amounts are named in one rgb-lib batch so no change seal
 * is left on the spent coin. Returns null when the payee cannot take that
 * split. A failed split throws a fix-it error and does not fall through to a
 * one-recipient send.
 */
export async function beginRemainderSend(
	wallet: RemainderWallet,
	input: RemainderSendInput
): Promise<string | null> {
	const remainder = input.spendable - input.amount;
	if (!Number.isSafeInteger(input.spendable) || !Number.isSafeInteger(input.amount)) return null;
	if (remainder <= 0 || input.amount <= 0) return null;
	const sendBatch = batchSender(wallet);
	const canReceive =
		typeof wallet.witnessReceive === 'function' || typeof wallet.blindReceive === 'function';
	if (!sendBatch || !canReceive || typeof wallet.decodeRGBInvoice !== 'function') return null;
	let payee: RemainderParty | null = null;
	try {
		payee = await partyFromInvoice(wallet, input.invoice);
	} catch (error: unknown) {
		console.warn(
			'[wallet-send] payee invoice could not be decoded',
			error instanceof Error ? error.message : String(error)
		);
		return null;
	}
	if (!payee || witnessRecipient(payee.recipientId)) return null;

	const tried = { current: false };
	const created = await makeChangeCoin(wallet, input, tried);
	try {
		return await buildSplit(wallet, input, payee, remainder, sendBatch);
	} catch (error: unknown) {
		console.warn(
			'[wallet-send] remainder send was not built',
			error instanceof Error ? error.message : String(error)
		);
		if (!created && needsFunding(error)) {
			const again = await makeChangeCoin(wallet, input, tried);
			if (again) {
				try {
					return await buildSplit(wallet, input, payee, remainder, sendBatch);
				} catch (retryError: unknown) {
					console.warn(
						'[wallet-send] remainder send failed after a change coin',
						retryError instanceof Error ? retryError.message : String(retryError)
					);
					throw new Error(CHANGE_NEEDS_BITCOIN);
				}
			}
		}
		if (error instanceof Error && error.message === CHANGE_NEEDS_BITCOIN) throw error;
		throw new Error(CHANGE_NEEDS_BITCOIN);
	}
}
