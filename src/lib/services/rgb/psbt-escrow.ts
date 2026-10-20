import { Psbt } from 'bitcoinjs-lib';
import { openSendBatches, takeChangeConfirmations } from '$lib/stores/wallet/prepare-rgb-send';

const STORAGE_KEY = 'bittasker.escrow-send';

export type EscrowPhase =
	| 'idle'
	| 'building_psbt'
	| 'psbt_ready'
	| 'signing'
	| 'awaiting_confirmation'
	| 'failed';

export interface EscrowSendInput {
	assetId: string;
	amount: number;
	invoice: string;
	feeRate?: number;
	minConfirmations?: number;
	/** Units still spendable before this send. Change is required when this is larger than amount. */
	spendable?: number;
}

export interface EscrowSendState {
	phase: EscrowPhase;
	assetId: string;
	amount: number;
	invoice: string;
	psbt: string | null;
	signedPsbt: string | null;
	txid: string | null;
	lastError: string | null;
}

export interface EscrowReceiver {
	blindReceive(params: {
		assetId: string;
		amount: number;
		durationSeconds: number;
		minConfirmations: number;
	}): Promise<{ invoice?: string } | string>;
}

export interface EscrowSigner {
	onchainSendBegin(params: {
		invoice: string;
		assetId: string;
		amount: number;
		feeRate?: number;
		minConfirmations?: number;
	}): Promise<string>;
	signPsbt(psbt: string, mnemonic?: string): Promise<string>;
	onchainSendEnd(params: { signedPsbt: string; skipSync?: boolean }): Promise<unknown>;
	listTransfers?: () => Promise<
		Array<{ kind: string; status: string; batchTransferIdx: number; txid?: string }>
	>;
	failTransfers?: (params: { batchTransferIdx?: number; skipSync?: boolean }) => Promise<boolean>;
}

function invoiceSeal(invoice: string): string {
	return invoice.match(/utxob:([^-/?]+)/)?.[1] ?? '';
}

/** Txid of a send that already left for this invoice. Failed rows are ignored. */
export function sentInvoiceTxid(rows: unknown, invoice: string): string | null {
	if (!Array.isArray(rows)) return null;
	const target = invoice.trim();
	const seal = invoiceSeal(target);
	if (!target) return null;
	for (const value of rows) {
		if (!value || typeof value !== 'object') continue;
		const row = value as {
			kind?: unknown;
			status?: unknown;
			invoiceString?: unknown;
			txid?: unknown;
		};
		const kind = typeof row.kind === 'string' ? row.kind.toLowerCase() : '';
		if (!kind.includes('send')) continue;
		if (row.status === 'Failed') continue;
		const rowInvoice = typeof row.invoiceString === 'string' ? row.invoiceString.trim() : '';
		if (!rowInvoice) continue;
		const same = rowInvoice === target || (seal !== '' && invoiceSeal(rowInvoice) === seal);
		if (!same) continue;
		const txid = typeof row.txid === 'string' ? row.txid.trim() : '';
		if (/^[0-9a-f]{64}$/i.test(txid)) return txid;
	}
	return null;
}

const OPEN_PAYOUT = new Set([
	'WaitingConfirmations',
	'WaitingCounterparty',
	'WaitingSafeHeight',
	'Initiated'
]);

function requestedUnits(row: { requestedAssignment?: unknown }): number {
	const requested = row.requestedAssignment;
	if (!requested || typeof requested !== 'object') return 0;
	const amount = (requested as { amount?: unknown }).amount;
	return typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
}

/**
 * Txid for a payout this wallet already broadcast.
 * The invoice match works in the same tab. One unconfirmed send of the contract amount
 * covers a reload or another device, where the invoice text is gone.
 */
export function openPayoutTxid(rows: unknown, invoice: string, amount: number): string | null {
	const named = sentInvoiceTxid(rows, invoice);
	if (named) return named;
	if (!Array.isArray(rows) || !Number.isSafeInteger(amount) || amount <= 0) return null;
	const found: string[] = [];
	for (const value of rows) {
		if (!value || typeof value !== 'object') continue;
		const row = value as {
			kind?: unknown;
			status?: unknown;
			txid?: unknown;
			requestedAssignment?: unknown;
		};
		const kind = typeof row.kind === 'string' ? row.kind.toLowerCase() : '';
		if (!kind.includes('send')) continue;
		if (typeof row.status !== 'string' || !OPEN_PAYOUT.has(row.status)) continue;
		if (requestedUnits(row) !== amount) continue;
		const txid = typeof row.txid === 'string' ? row.txid.trim() : '';
		if (/^[0-9a-f]{64}$/i.test(txid)) found.push(txid);
	}
	return found.length === 1 ? found[0] : null;
}

/** A broadcast this tab already saved for the same invoice. A txid means it left the wallet. */
export function keptSendProof(invoice: string, saved: EscrowSendState | null): string | null {
	if (!saved?.txid) return null;
	if (saved.phase !== 'awaiting_confirmation' && saved.phase !== 'failed') return null;
	if (saved.invoice.trim() !== invoice.trim()) return null;
	return /^[0-9a-f]{64}$/i.test(saved.txid) ? saved.txid : null;
}

export function txidFromSend(value: unknown): string {
	if (typeof value === 'string') {
		return value.match(/[0-9a-f]{64}/i)?.[0] ?? '';
	}
	if (typeof value !== 'object' || value === null) return '';
	const row = value as Record<string, unknown>;
	for (const key of ['txid', 'txId', 'transactionId']) {
		const candidate = row[key];
		if (typeof candidate === 'string' && /^[0-9a-f]{64}$/i.test(candidate)) return candidate;
	}
	return '';
}

export function requireEscrowSigner(wallet: object): EscrowSigner {
	const signer = wallet as EscrowSigner;
	if (
		typeof signer.onchainSendBegin !== 'function' ||
		typeof signer.signPsbt !== 'function' ||
		typeof signer.onchainSendEnd !== 'function'
	) {
		throw new Error('Wallet does not expose the PSBT send steps');
	}
	return signer;
}

export function saveEscrowSend(next: EscrowSendState): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function loadEscrowSend(): EscrowSendState | null {
	if (typeof sessionStorage === 'undefined') return null;
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return null;
		const row = parsed as Partial<EscrowSendState>;
		if (typeof row.phase !== 'string' || typeof row.assetId !== 'string') return null;
		return {
			phase: row.phase as EscrowPhase,
			assetId: row.assetId,
			amount: typeof row.amount === 'number' ? row.amount : 0,
			invoice: typeof row.invoice === 'string' ? row.invoice : '',
			psbt: typeof row.psbt === 'string' ? row.psbt : null,
			signedPsbt: typeof row.signedPsbt === 'string' ? row.signedPsbt : null,
			txid: typeof row.txid === 'string' ? row.txid : null,
			lastError: typeof row.lastError === 'string' ? row.lastError : null
		};
	} catch (error: unknown) {
		console.warn(
			'[escrow-send] stored state unreadable',
			error instanceof Error ? error.message : String(error)
		);
		return null;
	}
}

/** Build the unsigned PSBT. BDK rejects unknown inputs here, before broadcast. */
export async function buildEscrowPsbt(
	wallet: EscrowSigner,
	input: EscrowSendInput
): Promise<string> {
	const psbt = await wallet.onchainSendBegin({
		invoice: input.invoice,
		assetId: input.assetId,
		amount: input.amount,
		feeRate: input.feeRate ?? 2,
		minConfirmations: input.minConfirmations ?? takeChangeConfirmations()
	});
	if (typeof psbt !== 'string' || psbt.length === 0) {
		throw new Error('onchainSendBegin did not return a PSBT');
	}
	return psbt;
}

export async function signEscrowPsbt(wallet: EscrowSigner, psbt: string): Promise<string> {
	const signed = await wallet.signPsbt(psbt);
	if (typeof signed !== 'string' || signed.length === 0) {
		throw new Error('signPsbt did not return a signed PSBT');
	}
	return signed;
}

function describeSendEnd(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null) {
		return { type: typeof value, txid: txidFromSend(value) || null };
	}
	const row = value as Record<string, unknown>;
	return {
		keys: Object.keys(row),
		txid: txidFromSend(value) || null,
		batchTransferIdx: row.batchTransferIdx ?? row.batch_transfer_idx ?? null
	};
}

type PsbtOutput = {
	bip32Derivation?: readonly unknown[];
	tapBip32Derivation?: readonly unknown[];
};

/** True when the PSBT has no output derived from this wallet. Null when the PSBT cannot be read. */
export function changeOutputMissing(psbtBase64: string): boolean | null {
	try {
		const parsed = Psbt.fromBase64(psbtBase64);
		const outputs = parsed.data.outputs as PsbtOutput[];
		if (outputs.length === 0) return true;
		const derived = outputs.some(
			(output) =>
				(output.bip32Derivation?.length ?? 0) > 0 || (output.tapBip32Derivation?.length ?? 0) > 0
		);
		return !derived;
	} catch (error: unknown) {
		console.warn(
			'[wallet-send] change output unreadable',
			error instanceof Error ? error.message : String(error)
		);
		return null;
	}
}

/** Stop a partial send whose PSBT would not pay the remainder back to this wallet. */
export function assertChangeReturns(
	psbt: string,
	spendable: number | undefined,
	amount: number
): void {
	if (!Number.isSafeInteger(spendable) || !Number.isSafeInteger(amount) || amount >= spendable)
		return;
	if (changeOutputMissing(psbt) !== true) return;
	throw new Error(
		'Refusing onchainSend: the remaining USDT would not come back as change. Nothing was sent.'
	);
}

export async function failOpenSend(wallet: EscrowSigner): Promise<void> {
	if (!wallet.listTransfers || !wallet.failTransfers) return;
	const transfers = await wallet.listTransfers().catch(() => []);
	for (const batchTransferIdx of openSendBatches(transfers)) {
		await wallet.failTransfers({ batchTransferIdx, skipSync: true }).catch(() => false);
	}
}

export async function broadcastEscrowPsbt(
	wallet: EscrowSigner,
	signedPsbt: string
): Promise<string> {
	let result: unknown;
	try {
		result = await wallet.onchainSendEnd({ signedPsbt });
	} catch (error: unknown) {
		console.error(
			'[wallet-send] onchainSendEnd failed',
			error instanceof Error ? error.message : String(error)
		);
		throw error;
	}
	console.info('[wallet-send] onchainSendEnd', describeSendEnd(result));
	const txid = txidFromSend(result);
	if (!txid) throw new Error('onchainSendEnd did not return a txid');
	return txid;
}

export async function runEscrowSend(
	wallet: EscrowSigner,
	input: EscrowSendInput
): Promise<EscrowSendState> {
	const next: EscrowSendState = {
		phase: 'building_psbt',
		assetId: input.assetId,
		amount: input.amount,
		invoice: input.invoice,
		psbt: null,
		signedPsbt: null,
		txid: null,
		lastError: null
	};
	saveEscrowSend(next);
	try {
		next.psbt = await buildEscrowPsbt(wallet, input);
		assertChangeReturns(next.psbt, input.spendable, input.amount);
		next.phase = 'psbt_ready';
		saveEscrowSend(next);
		next.phase = 'signing';
		saveEscrowSend(next);
		next.signedPsbt = await signEscrowPsbt(wallet, next.psbt);
		saveEscrowSend(next);
		next.txid = await broadcastEscrowPsbt(wallet, next.signedPsbt);
		next.phase = 'awaiting_confirmation';
		saveEscrowSend(next);
		console.info('[contract-rune] psbt phase', next.phase, next.txid);
		return next;
	} catch (error: unknown) {
		next.phase = 'failed';
		next.lastError = error instanceof Error ? error.message : String(error);
		saveEscrowSend(next);
		if (next.psbt && next.lastError.includes('come back')) {
			await failOpenSend(wallet);
		}
		console.info('[contract-rune] psbt phase', next.phase, next.lastError);
		throw error;
	}
}

/** Tasker sends the asset back to a fresh invoice on the same wallet. */
export async function refundEscrow(
	wallet: EscrowSigner & EscrowReceiver,
	input: { assetId: string; amount: number; feeRate?: number }
): Promise<EscrowSendState> {
	const received = await wallet.blindReceive({
		assetId: input.assetId,
		amount: input.amount,
		durationSeconds: 3600,
		minConfirmations: 0
	});
	const invoice = typeof received === 'string' ? received : (received.invoice ?? '');
	if (!invoice.startsWith('rgb')) throw new Error('Self-invoice did not return an RGB invoice');
	return runEscrowSend(wallet, { ...input, invoice });
}
