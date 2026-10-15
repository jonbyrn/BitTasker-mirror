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
		minConfirmations: 1
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
