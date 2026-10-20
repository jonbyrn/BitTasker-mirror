import { resolveSendFeeRate } from '$lib/stores/wallet/fee-rate';
import { openSendBatches, PARTIAL_SEND_BLOCK } from '$lib/stores/wallet/prepare-rgb-send';

/**
 * Sats on the witness output that carries the unsent USDT.
 * rgb-lib's send-to-oneself test uses 1000. That output is created in this
 * transaction, so it cannot be selected as an input and destroyed.
 */
export const WITNESS_REMAINDER_SATS = 1000;

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

interface RemainderWallet {
	sendBeginBatch?: BatchSend;
	witnessReceive?: (params: {
		assetId: string;
		amount: number;
		minConfirmations?: number;
	}) => Promise<unknown>;
	decodeRGBInvoice?: (params: { invoice: string }) => Promise<unknown>;
	failTransfers?: (params: { batchTransferIdx?: number; skipSync?: boolean }) => Promise<boolean>;
	listTransfers?: () => Promise<
		Array<{ kind: string; status: string; batchTransferIdx: number; txid?: string }>
	>;
	_manager?: { rlnBinding?: { sendBeginBatch?: BatchSend } };
}

export interface RemainderSendInput {
	invoice: string;
	assetId: string;
	amount: number;
	spendable: number;
	feeRate?: number;
	minConfirmations?: number;
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
	if (witnessRecipient(payeeId) || !witnessRecipient(remainderId)) return null;
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
				witnessData: { amountSat: String(WITNESS_REMAINDER_SATS) },
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

async function abandonSplit(wallet: RemainderWallet, witnessIdx: number | undefined): Promise<void> {
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

/**
 * Build a partial USDT send whose remainder is an explicit witness output.
 * Returns null when the split cannot be started, after failing anything it opened.
 * A failed batch throws the existing refusal. The caller must not fall through
 * to a one-recipient send.
 */
export async function beginRemainderSend(
	wallet: RemainderWallet,
	input: RemainderSendInput
): Promise<string | null> {
	const remainder = input.spendable - input.amount;
	if (!Number.isSafeInteger(input.spendable) || !Number.isSafeInteger(input.amount)) return null;
	if (remainder <= 0 || input.amount <= 0) return null;
	const sendBatch = batchSender(wallet);
	if (
		!sendBatch ||
		typeof wallet.witnessReceive !== 'function' ||
		typeof wallet.decodeRGBInvoice !== 'function'
	) {
		return null;
	}
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

	let opened: Record<string, unknown> | null = null;
	try {
		const received = await wallet.witnessReceive({
			assetId: input.assetId,
			amount: remainder,
			minConfirmations: input.minConfirmations ?? 1
		});
		opened = typeof received === 'string' ? { invoice: received } : recordOf(received);
	} catch (error: unknown) {
		console.warn(
			'[wallet-send] witness remainder was not created',
			error instanceof Error ? error.message : String(error)
		);
		return null;
	}
	const witnessIdx = opened ? batchIndex(opened) : undefined;
	let remainderParty: RemainderParty | null = null;
	const directId = opened ? textField(opened, 'recipientId', 'recipient_id') : '';
	if (directId && witnessRecipient(directId)) {
		remainderParty = {
			recipientId: directId,
			transportEndpoints: opened ? endpointField(opened) : []
		};
	} else {
		const ownInvoice = opened ? textField(opened, 'invoice', 'invoice') : '';
		try {
			const decoded = await partyFromInvoice(wallet, ownInvoice);
			if (decoded && witnessRecipient(decoded.recipientId)) remainderParty = decoded;
		} catch (error: unknown) {
			console.warn(
				'[wallet-send] witness remainder invoice could not be decoded',
				error instanceof Error ? error.message : String(error)
			);
		}
	}
	if (remainderParty && remainderParty.transportEndpoints.length === 0) {
		remainderParty = {
			recipientId: remainderParty.recipientId,
			transportEndpoints: payee.transportEndpoints
		};
	}
	const map = remainderParty
		? remainderMap(input.assetId, payee, input.amount, remainderParty, remainder)
		: null;
	if (!map) {
		await abandonSplit(wallet, witnessIdx);
		return null;
	}
	try {
		console.info('[wallet-send] partial USDT uses a witness remainder', {
			pay: input.amount,
			remainder,
			sats: WITNESS_REMAINDER_SATS
		});
		const psbt = await sendBatch({
			recipientMap: map,
			donation: false,
			feeRate: resolveSendFeeRate(input.feeRate),
			minConfirmations: input.minConfirmations ?? 1
		});
		if (typeof psbt !== 'string' || psbt.length === 0) {
			await abandonSplit(wallet, witnessIdx);
			throw new Error(PARTIAL_SEND_BLOCK);
		}
		return psbt;
	} catch (error: unknown) {
		await abandonSplit(wallet, witnessIdx);
		console.warn(
			'[wallet-send] witness remainder send was not built',
			error instanceof Error ? error.message : String(error)
		);
		if (error instanceof Error && error.message === PARTIAL_SEND_BLOCK) throw error;
		throw new Error(PARTIAL_SEND_BLOCK);
	}
}
