import { formatUsdtBalance } from '$lib/types/rgb-contract';
import { esploraHasTx, esploraOutputSpent } from '$lib/stores/wallet/signet-broadcast';
import {
	OTHER_SESSION_WARNING,
	sessionBlocksSend,
	setWalletRefreshing
} from '$lib/stores/wallet/wallet-session';

/** Outbound sends that are dead. A WaitingCounterparty receive or send may still be broadcasting. */
const STUCK_SEND_STATUS = new Set(['Failed', 'Initiated']);

/**
 * Local sendEnd id from the unbroadcast USDT attempt. Esplora has no such
 * transaction, so the IFA seal on it is not a coin this BDK store can sign.
 */
export const PHANTOM_BROADCAST_TXID =
	'72787a4abb9e2abad7fb03c4f5242a3a323e5df6342351101ec973f78418fadf';

const FEE_VOUTS = new Set([0, 1]);
const UTEXO_INDEXER = 'https://esplora-api.utexo.com';
const UNSEALED_MINT_UNITS = 10_000;
const ORPHAN_TXID = 'f4148f9d02745498ace80993c3365f6745dddba80ff96cbac1976aaf54567ca8';

export interface RgbTransferRef {
	kind: string;
	status: string;
	batchTransferIdx: number;
	txid?: string;
	/** Unix seconds. Absent means the row has not expired. */
	expiration?: number;
}

export interface RgbAllocationRef {
	assetId?: string;
	assignment?: { type?: string; amount?: number };
}

export interface RgbUnspentRef {
	rgbAllocations: RgbAllocationRef[];
	pendingBlinded?: number;
	utxo: {
		exists: boolean;
		outpoint?: { txid?: string; vout?: number };
		colorable?: boolean;
		/** Sats on this output. Absent means the wallet did not say. */
		btcAmount?: number;
	};
}

export interface RgbNiaRef {
	assetId?: string;
	balance?: { spendable?: number };
}

/** Sends that were built and never broadcast. Safe to fail so the seal is spendable again. */
export function openSendBatches(transfers: RgbTransferRef[]): number[] {
	const indexes = transfers
		.filter(
			(transfer) =>
				transfer.kind === 'Send' &&
				!transfer.txid &&
				transfer.status !== 'Failed' &&
				transfer.status !== 'Settled'
		)
		.map((transfer) => transfer.batchTransferIdx);
	return [...new Set(indexes)];
}

export function stuckSendBatchIndexes(transfers: RgbTransferRef[]): number[] {
	const indexes = transfers
		.filter((transfer) => transfer.kind === 'Send' && STUCK_SEND_STATUS.has(transfer.status))
		.map((transfer) => transfer.batchTransferIdx);
	return [...new Set(indexes)];
}

/** Send batches whose txid is the unbroadcast 72787a… id. Receives stay. */
export function phantomSendBatches(transfers: RgbTransferRef[]): number[] {
	const indexes = transfers
		.filter(
			(transfer) =>
				transfer.kind === 'Send' &&
				transfer.status !== 'Failed' &&
				transfer.txid?.toLowerCase() === PHANTOM_BROADCAST_TXID
		)
		.map((transfer) => transfer.batchTransferIdx);
	return [...new Set(indexes)];
}

/** Colored allocation outputs sit at high vouts. Fees need vout 0 or 1. */
export function isVanillaFeeUtxo(unspent: RgbUnspentRef): boolean {
	const vout = unspent.utxo.outpoint?.vout;
	return (
		unspent.utxo.exists &&
		unspent.rgbAllocations.length === 0 &&
		vout !== undefined &&
		FEE_VOUTS.has(vout)
	);
}

export function needsVanillaFeeUtxo(
	unspents: RgbUnspentRef[],
	vanillaSpendableSats: number
): boolean {
	const feeInputs = unspents.filter(isVanillaFeeUtxo);
	return feeInputs.length === 0 || vanillaSpendableSats < 3_000;
}

export function isBdkAddUtxoError(error: unknown): boolean {
	return String(error).toLowerCase().includes('adding utxos');
}

function holdsAsset(unspent: RgbUnspentRef, assetId: string): boolean {
	return unspent.rgbAllocations.some((allocation) => allocation.assetId === assetId);
}

/** RGB row this wallet must not spend. BDK does not own it, or a blank invoice locked it. */
export function strandedSeal(unspent: RgbUnspentRef, assetId: string): boolean {
	if (!holdsAsset(unspent, assetId)) return false;
	if (!unspent.utxo.exists) return true;
	if ((unspent.pendingBlinded ?? 0) > 0) return true;
	return unspent.utxo.outpoint?.txid === ORPHAN_TXID;
}

/** Colorable outputs this wallet session can spend. A blank invoice lock is not one of them. */
export function allocatedSealRows(unspents: RgbUnspentRef[], assetId: string): RgbUnspentRef[] {
	return unspents.filter(
		(unspent) =>
			unspent.utxo.exists &&
			unspent.utxo.colorable === true &&
			(unspent.pendingBlinded ?? 0) === 0 &&
			unspent.utxo.outpoint?.txid !== ORPHAN_TXID &&
			holdsAsset(unspent, assetId)
	);
}

export function fungibleAllocationSum(unspents: RgbUnspentRef[], assetId: string): number {
	return allocatedSealRows(unspents, assetId).reduce((sum, unspent) => {
		const sealed = unspent.rgbAllocations.reduce((inner, allocation) => {
			if (allocation.assetId !== assetId) return inner;
			if (allocation.assignment?.type && allocation.assignment.type !== 'Fungible') return inner;
			return inner + (allocation.assignment?.amount ?? 0);
		}, 0);
		return sum + sealed;
	}, 0);
}

/** Remainder that must land on the send transaction after a partial spend. */
export function changeUnits(spendable: number, sent: number): number {
	if (!Number.isSafeInteger(spendable) || !Number.isSafeInteger(sent)) return 0;
	if (sent <= 0 || sent >= spendable) return 0;
	return spendable - sent;
}

/** True only when a partial send left the old full balance spendable. */
export function changeStillBooked(spendableAfter: number, previous: number, sent: number): boolean {
	if (!Number.isSafeInteger(spendableAfter) || !Number.isSafeInteger(previous)) return false;
	if (changeUnits(previous, sent) <= 0) return false;
	return spendableAfter >= previous;
}

export interface SpentSeal {
	txid: string;
	vout: number;
	amount: number;
	spentBy: string | null;
}

export interface ChainAllocation {
	live: number;
	spent: SpentSeal[];
	checked: number;
	unknown: boolean;
	pending: number;
}

export type OutputSpendProbe = (
	txid: string,
	vout: number
) => Promise<{ spent: boolean; txid?: string; confirmed?: boolean } | null>;

function sealOutpoint(unspent: RgbUnspentRef): { txid: string; vout: number } | null {
	const txid = unspent.utxo.outpoint?.txid?.trim().toLowerCase();
	const vout = unspent.utxo.outpoint?.vout;
	if (!txid || !/^[0-9a-f]+$/i.test(txid)) return null;
	if (!Number.isSafeInteger(vout) || vout == null || vout < 0) return null;
	return { txid, vout };
}

/**
 * Units whose output Esplora still lists as unspent.
 * A spent allocation is dropped. A failed or unconfirmed lookup is ignored.
 */
export async function chainAllocation(
	unspents: RgbUnspentRef[],
	assetId: string,
	probe: OutputSpendProbe
): Promise<ChainAllocation> {
	let live = 0;
	let checked = 0;
	let pending = 0;
	let unknown = false;
	const spent: SpentSeal[] = [];
	for (const unspent of unspents) {
		if (!unspent.utxo.exists || !holdsAsset(unspent, assetId)) continue;
		const amount = allocationUnits(unspent, assetId);
		if (amount <= 0) continue;
		const outpoint = sealOutpoint(unspent);
		if (!outpoint) {
			unknown = true;
			continue;
		}
		let result: { spent: boolean; txid?: string; confirmed?: boolean } | null = null;
		try {
			result = await probe(outpoint.txid, outpoint.vout);
		} catch (error: unknown) {
			console.warn(
				'[wallet-send] outspend lookup failed',
				outpoint.txid,
				outpoint.vout,
				error instanceof Error ? error.message : String(error)
			);
		}
		if (!result) {
			unknown = true;
			continue;
		}
		if (result.confirmed === false) {
			pending += amount;
			continue;
		}
		checked += 1;
		if (result.spent) {
			spent.push({
				txid: outpoint.txid,
				vout: outpoint.vout,
				amount,
				spentBy: result.txid ?? null
			});
			continue;
		}
		live += amount;
	}
	return { live, spent, checked, unknown, pending };
}

/**
 * Drop outputs Esplora already spent.
 * A stale colorable coin must not count as balance, fee, or change.
 */
export function pruneSpentAllocations(
	unspents: RgbUnspentRef[],
	spent: readonly SpentSeal[]
): RgbUnspentRef[] {
	if (spent.length === 0) return unspents;
	const dead = new Set(spent.map((row) => `${row.txid.toLowerCase()}:${row.vout}`));
	return unspents.filter((row) => {
		const point = sealOutpoint(row);
		return point === null || !dead.has(`${point.txid}:${point.vout}`);
	});
}

/**
 * Units that sit on unspent outputs.
 * The engine total can still include an allocation whose coin is already spent.
 */
export function unspentSpendable(
	engine: number,
	listed: number,
	chain: ChainAllocation,
	sawRows: boolean
): number {
	const booked = Number.isSafeInteger(engine) && engine >= 0 ? engine : 0;
	const onCoins = Number.isSafeInteger(listed) && listed >= 0 ? listed : booked;
	const spent = chain.spent.reduce((sum, row) => sum + row.amount, 0);
	if (!chain.unknown && chain.checked > 0 && spent > 0) return Math.min(booked, chain.live);
	if (sawRows && onCoins < booked) return onCoins;
	return booked;
}

/** True when the listed outputs account for the spendable balance. */
export function allocationCoversSpendable(chain: ChainAllocation, spendable: number): boolean {
	if (chain.unknown || !Number.isSafeInteger(spendable) || spendable < 0) return false;
	const spent = chain.spent.reduce((sum, row) => sum + row.amount, 0);
	const accounted = chain.live + spent + chain.pending;
	return accounted >= spendable && (chain.checked > 0 || chain.pending > 0 || spendable === 0);
}

/** Clear refusal when RGB still lists an output the chain already spent. */
export function spentSealMessage(spent: SpentSeal[]): string | null {
	if (spent.length === 0) return null;
	const first = spent[0];
	const by = first.spentBy ? ` by ${first.spentBy}` : '';
	return `Refusing onchainSend: ${first.txid}:${first.vout} was already spent on-chain${by}. RGB still lists that USDT, so this send is blocked.`;
}

const RETIRE_KINDS = new Set(['Send', 'ReceiveBlind', 'ReceiveWitness']);

/**
 * Unsettled transfers sitting on an outpoint Esplora already spent.
 * A settled transfer stays: failing it deletes the payment from history and
 * drops a change consignment rgb-lib cannot put back.
 * The send that spent the coin stays too. Its txid is `spentBy`.
 */
export function spentSealBatches(transfers: RgbTransferRef[], spent: SpentSeal[]): number[] {
	const dead = new Set(spent.map((row) => row.txid.toLowerCase()));
	const indexes = transfers
		.filter((transfer) => {
			const txid = transfer.txid?.toLowerCase();
			return (
				RETIRE_KINDS.has(transfer.kind) &&
				transfer.kind !== 'ReceiveBlind' &&
				transfer.kind !== 'ReceiveWitness' &&
				transfer.status !== 'Failed' &&
				transfer.status !== 'Settled' &&
				Boolean(txid) &&
				dead.has(txid)
			);
		})
		.map((transfer) => transfer.batchTransferIdx);
	return [...new Set(indexes)];
}

const COUNTERPARTY_KINDS = new Set(['Send', 'ReceiveBlind', 'ReceiveWitness']);

/**
 * WaitingCounterparty rows that can no longer settle.
 * An unexpired unpaid receive stays. The send whose txid spent the coin stays,
 * even when that row is expired: failing it drops the change.
 */
export function staleCounterpartyBatches(
	transfers: RgbTransferRef[],
	spent: SpentSeal[],
	nowSec: number
): number[] {
	const dead = new Set(spent.map((row) => row.txid.toLowerCase()));
	const spending = new Set(
		spent.map((row) => row.spentBy?.trim().toLowerCase() ?? '').filter((id) => id.length > 0)
	);
	const indexes = transfers
		.filter((transfer) => {
			if (transfer.status !== 'WaitingCounterparty') return false;
			if (!COUNTERPARTY_KINDS.has(transfer.kind)) return false;
			const incoming = transfer.kind === 'ReceiveBlind' || transfer.kind === 'ReceiveWitness';
			const txid = transfer.txid?.trim().toLowerCase() ?? '';
			if (txid && spending.has(txid)) return false;
			if (!incoming && txid && dead.has(txid)) return true;
			if (transfer.kind === 'Send' && !txid) return true;
			const expiration = transfer.expiration;
			return typeof expiration === 'number' && Number.isFinite(expiration) && expiration <= nowSec;
		})
		.map((transfer) => transfer.batchTransferIdx);
	return [...new Set(indexes)];
}

function assignmentChange(value: unknown): number {
	if (!Array.isArray(value)) return 0;
	return value.reduce((sum, item) => {
		if (!item || typeof item !== 'object') return sum;
		const amount = (item as { amount?: unknown }).amount;
		return typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0
			? sum + amount
			: sum;
	}, 0);
}

/**
 * Change still owed on the send that spent a coin RGB has not moved yet.
 * `assignments` on that send is the remainder, not a second copy of the amount sent.
 */
export function changeOwed(
	transfers: unknown,
	spentBy: readonly (string | null | undefined)[]
): number {
	if (!Array.isArray(transfers)) return 0;
	const ids = new Set(
		spentBy.map((id) => id?.trim().toLowerCase() ?? '').filter((id) => id.length > 0)
	);
	if (ids.size === 0) return 0;
	let total = 0;
	const seen = new Set<string>();
	for (const item of transfers) {
		if (!item || typeof item !== 'object') continue;
		const row = item as {
			kind?: unknown;
			status?: unknown;
			txid?: unknown;
			assignments?: unknown;
		};
		const kind = typeof row.kind === 'string' ? row.kind.toLowerCase() : '';
		if (!kind.includes('send') || row.status === 'Failed') continue;
		const txid = typeof row.txid === 'string' ? row.txid.trim().toLowerCase() : '';
		if (!txid || !ids.has(txid) || seen.has(txid)) continue;
		const change = assignmentChange(row.assignments);
		if (change <= 0) continue;
		seen.add(txid);
		total += change;
	}
	return total;
}

/** Plain sentence when the live outputs cannot cover the payment. */
export function spentOutputMessage(live: number, spent: number): string {
	return `${formatUsdtBalance(live, 6)} USDT can be sent. ${formatUsdtBalance(spent, 6)} is locked or unconfirmed. Tap Repair wallet, then try again.`;
}

/**
 * rgb-lib still lists an output Esplora spent, or the listed total is not the
 * live total. An unknown or unconfirmed lookup is not a mismatch.
 */
export function listedChainMismatch(chain: ChainAllocation, listedUnits: number): boolean {
	if (chain.unknown || chain.checked === 0) return false;
	if (chain.spent.length > 0) return true;
	if (chain.pending > 0) return false;
	return listedUnits !== chain.live;
}

export function liveShortfall(chain: ChainAllocation, amount: number): string | null {
	if (chain.unknown || chain.spent.length === 0) return null;
	const spent = chain.spent.reduce((sum, row) => sum + row.amount, 0);
	if (Number.isSafeInteger(amount) && amount >= 0 && chain.live >= amount) return null;
	return spentOutputMessage(chain.live, spent);
}

function allocationUnits(unspent: RgbUnspentRef, assetId: string): number {
	return unspent.rgbAllocations.reduce((sum, allocation) => {
		if (allocation.assetId !== assetId) return sum;
		if (allocation.assignment?.type && allocation.assignment.type !== 'Fungible') return sum;
		return sum + (allocation.assignment?.amount ?? 0);
	}, 0);
}

/**
 * The pre-send seal is still booked after sendEnd. The next spend then fails
 * with "BDK: UTXO not found" because that output is already spent.
 */
export function spentSealBooked(
	unspents: RgbUnspentRef[],
	assetId: string,
	sendTxid: string,
	previousSpendable: number
): boolean {
	if (previousSpendable <= 0) return false;
	return unspents.some(
		(unspent) =>
			unspent.utxo.exists &&
			unspent.utxo.outpoint?.txid !== sendTxid &&
			allocationUnits(unspent, assetId) === previousSpendable
	);
}

export function hasUncoloredFeeUtxo(unspents: RgbUnspentRef[]): boolean {
	return unspents.some((unspent) => unspent.utxo.exists && unspent.utxo.colorable === false);
}

/** Colorable output with no RGB on it. The asset send can spend this; a vanilla coin it cannot. */
export function freeColorableCoin(unspents: RgbUnspentRef[]): boolean {
	return unspents.some(
		(unspent) =>
			unspent.utxo.exists &&
			unspent.utxo.colorable === true &&
			unspent.rgbAllocations.length === 0 &&
			(unspent.pendingBlinded ?? 0) === 0
	);
}

/**
 * Safety net when a short payment was not given a change recipient.
 * The send path assigns that change first. This sentence is still thrown if a
 * spent allocation is listed, or if a partial PSBT is about to be signed
 * without that assignment. The wallet screen does not show "send the full balance".
 */
export const PARTIAL_SEND_BLOCK =
	'Refusing onchainSend: a partial send leaves the rest stuck. Send the full balance. Nothing was sent.';

/** The refusal sentence for a short payment. Null when the send spends the whole listed balance. */
export function changeRoomBlocker(
	_unspents: RgbUnspentRef[],
	_assetId: string,
	spendable: number,
	sendAmount: number
): string | null {
	if (!Number.isSafeInteger(sendAmount) || sendAmount <= 0) return null;
	if (!Number.isSafeInteger(spendable) || sendAmount >= spendable) return null;
	return PARTIAL_SEND_BLOCK;
}

/** True when an allocation Esplora already spent is still in the list rgb-lib would spend. */
export function listsSpentAllocation(
	rows: RgbUnspentRef[],
	assetId: string,
	spent: SpentSeal[]
): boolean {
	if (spent.length === 0) return false;
	const dead = new Set(spent.map((row) => `${row.txid.toLowerCase()}:${row.vout}`));
	return allocatedSealRows(rows, assetId).some((row) => {
		const point = sealOutpoint(row);
		return point !== null && dead.has(`${point.txid}:${point.vout}`);
	});
}

/** The only coin is inside an unpaid receive. Checked before any sync, so Confirm payment can say so at once. */
export function lockedCoinBlocker(unspents: RgbUnspentRef[], assetId: string): string | null {
	const pendingLock = unspents.some(
		(unspent) => holdsAsset(unspent, assetId) && (unspent.pendingBlinded ?? 0) > 0
	);
	if (!pendingLock || allocatedSealRows(unspents, assetId).length > 0) return null;
	return `Refusing onchainSend: ${assetId} is locked by a blank invoice. The payment arrives as a new UTXO.`;
}

/** Why onchainSend must not run. Null means the seal, fee coin, and spendable agree. */
export function sealSendBlocker(
	unspents: RgbUnspentRef[],
	assetId: string,
	spendable: number
): string | null {
	const stranded = unspents.find(
		(unspent) => strandedSeal(unspent, assetId) && (unspent.pendingBlinded ?? 0) === 0
	);
	if (stranded) {
		const txid = stranded.utxo.outpoint?.txid ?? 'unknown';
		return `Refusing onchainSend: ${assetId} is sealed on ${txid}, which this BDK store does not own`;
	}
	const locked = lockedCoinBlocker(unspents, assetId);
	if (locked) return locked;
	const seals = allocatedSealRows(unspents, assetId);
	const anyAllocated = unspents.some((unspent) => unspent.rgbAllocations.length > 0);
	if (!anyAllocated && spendable === UNSEALED_MINT_UNITS) {
		return 'Refusing onchainSend: spendable 10000 has no seal in listUnspents';
	}
	if (seals.length === 0) {
		return `Refusing onchainSend: ${assetId} has no colorable allocation`;
	}
	if (!hasUncoloredFeeUtxo(unspents) && !freeColorableCoin(unspents)) {
		return 'Refusing onchainSend: no uncolored fee UTXO';
	}
	const sealed = fungibleAllocationSum(unspents, assetId);
	if (sealed !== spendable) {
		return `Refusing onchainSend: allocation sum ${sealed} does not match spendable ${spendable}`;
	}
	return null;
}

export function listsLocalOutpoint(unspents: RgbUnspentRef[], txid: string, vout: number): boolean {
	return unspents.some(
		(unspent) =>
			unspent.utxo.exists &&
			unspent.utxo.outpoint?.txid === txid &&
			unspent.utxo.outpoint?.vout === vout
	);
}

export function openFeeVouts(unspents: RgbUnspentRef[]): Array<number | null> {
	return unspents
		.filter((unspent) => unspent.utxo.exists && unspent.rgbAllocations.length === 0)
		.map((unspent) => unspent.utxo.outpoint?.vout ?? null);
}

type PrepareWallet = {
	isOnline?: () => boolean;
	goOnline?: (indexerUrl?: string) => Promise<void>;
	syncWallet?: () => Promise<void>;
	refreshWallet: () => Promise<unknown>;
	listTransfers?: () => Promise<RgbTransferRef[]>;
	failTransfers?: (params: {
		batchTransferIdx?: number;
		skipSync?: boolean;
		noAssetOnly?: boolean;
	}) => Promise<boolean>;
	listUnspents?: () => Promise<RgbUnspentRef[]>;
	listAssets?: () => Promise<{ nia?: RgbNiaRef[]; ifa?: RgbNiaRef[] }>;
	getBtcBalance?: () => Promise<{ vanilla: { spendable: number } }>;
	getAddress?: () => Promise<string>;
	sendBtc?: (params: { address: string; amount: number; feeRate: number }) => Promise<string>;
	createUtxos?: (params: {
		upTo?: boolean;
		num?: number;
		size?: number;
		feeRate?: number;
	}) => Promise<number>;
};

/** Fail expired or never-broadcast counterparty rows. Does not fail the spending send. */
export async function failStaleCounterparties(
	wallet: PrepareWallet,
	spent: SpentSeal[],
	nowSec = Math.floor(Date.now() / 1000)
): Promise<boolean> {
	if (!wallet.listTransfers || !wallet.failTransfers) return false;
	const transfers = await wallet.listTransfers().catch(() => []);
	const batches = staleCounterpartyBatches(transfers, spent, nowSec);
	for (const batchTransferIdx of batches) {
		await wallet.failTransfers({ batchTransferIdx, skipSync: true }).catch(() => false);
	}
	return batches.length > 0;
}

/**
 * Sync Bitcoin, refresh RGB, fail stale counterparty rows, then drop allocations
 * that sit on outputs Esplora already spent. Does not fail the spending send.
 */
export async function rescanColoredCoins(
	wallet: PrepareWallet,
	assetId: string,
	outputSpent: OutputSpendProbe = esploraOutputSpent
): Promise<void> {
	await retryBusy(async () => {
		if (wallet.goOnline && wallet.isOnline?.() !== true) {
			await wallet.goOnline(UTEXO_INDEXER);
		}
		await syncWhenPresent(wallet);
		await wallet.refreshWallet();
	});
	if (!wallet.listUnspents) return;
	const first = await chainAllocation(await readUnspents(wallet), assetId, outputSpent);
	await failStaleCounterparties(wallet, first.unknown ? [] : first.spent);
	if (!first.unknown && first.spent.length > 0) {
		await retireSpentSeals(wallet, first.spent);
	}
	await retryBusy(async () => {
		await syncWhenPresent(wallet);
		await wallet.refreshWallet();
	});
}

/** Fail transfers whose bitcoin output Esplora already spent, then the caller re-lists seals. */
export async function retireSpentSeals(wallet: PrepareWallet, spent: SpentSeal[]): Promise<void> {
	if (!wallet.listTransfers || !wallet.failTransfers || spent.length === 0) return;
	const transfers = await wallet.listTransfers().catch(() => []);
	const batches = spentSealBatches(transfers, spent);
	for (const batchTransferIdx of batches) {
		await wallet.failTransfers({ batchTransferIdx, skipSync: true }).catch(() => false);
	}
}

async function syncWalletState(wallet: PrepareWallet): Promise<void> {
	if (wallet.syncWallet) await wallet.syncWallet();
	await wallet.refreshWallet();
}

async function releaseStuckSends(wallet: PrepareWallet): Promise<void> {
	if (!wallet.listTransfers || !wallet.failTransfers) return;
	const transfers = await wallet.listTransfers().catch(() => []);
	const stuck = stuckSendBatchIndexes(transfers);
	for (const batchTransferIdx of stuck) {
		await wallet.failTransfers({ batchTransferIdx, skipSync: true }).catch(() => false);
	}
	if (stuck.length > 0) await syncWalletState(wallet);
}

type PhantomWallet = {
	listTransfers?: () => Promise<RgbTransferRef[]>;
	failTransfers?: PrepareWallet['failTransfers'];
	listUnspents?: () => Promise<RgbUnspentRef[]>;
	syncWallet?: () => Promise<void>;
	refreshWallet?: () => Promise<unknown>;
};

function sealStillPhantom(unspents: RgbUnspentRef[]): boolean {
	return unspents.some(
		(unspent) => unspent.utxo.outpoint?.txid?.toLowerCase() === PHANTOM_BROADCAST_TXID
	);
}

/**
 * Drop the send batch that sealed IFA onto the unbroadcast 72787a… id.
 * Does not restore rgb_backup_bytes: the stored export was taken after that send.
 * Returns true only when the seal is gone afterwards.
 */
export async function releasePhantomSends(
	wallet: PhantomWallet,
	probe: (txid: string) => Promise<boolean> = esploraHasTx
): Promise<boolean> {
	if (!wallet.listTransfers || !wallet.failTransfers) return false;
	const transfers = await wallet.listTransfers().catch(() => []);
	const batches = phantomSendBatches(transfers);
	if (batches.length === 0) return false;
	let seen = false;
	try {
		seen = await probe(PHANTOM_BROADCAST_TXID);
	} catch (error: unknown) {
		console.warn(
			'[wallet-send] signet lookup failed',
			error instanceof Error ? error.message : String(error)
		);
		return false;
	}
	if (seen) return false;
	let failed = false;
	for (const batchTransferIdx of batches) {
		try {
			await wallet.failTransfers({ batchTransferIdx, skipSync: true });
			failed = true;
			console.info('[wallet-send] failed unbroadcast batch', batchTransferIdx);
		} catch (error: unknown) {
			console.warn(
				'[wallet-send] failTransfers refused',
				batchTransferIdx,
				error instanceof Error ? error.message : String(error)
			);
		}
	}
	if (wallet.syncWallet) await wallet.syncWallet().catch(() => undefined);
	if (wallet.refreshWallet) await wallet.refreshWallet().catch(() => undefined);
	const unspents = wallet.listUnspents ? await wallet.listUnspents().catch(() => []) : [];
	if (!failed || sealStillPhantom(unspents)) {
		console.warn('[wallet-send] phantom seal remains; not restoring rgb_backup_bytes');
		return false;
	}
	for (const unspent of unspents) {
		if (!unspent.utxo.exists || unspent.rgbAllocations.length === 0) continue;
		const txid = unspent.utxo.outpoint?.txid;
		if (!txid) continue;
		try {
			const listed = await probe(txid);
			console.info('[wallet-send] ifa outpoint', txid, listed);
		} catch (error: unknown) {
			console.warn(
				'[wallet-send] signet lookup failed',
				error instanceof Error ? error.message : String(error)
			);
		}
	}
	return true;
}

/** Probe every USDT allocation and retire the ones Esplora already spent. */
export async function retireListedSeals(wallet: PrepareWallet, assetId: string): Promise<void> {
	if (!wallet.listUnspents) return;
	const chain = await chainAllocation(await readUnspents(wallet), assetId, esploraOutputSpent);
	if (chain.unknown || chain.spent.length === 0) return;
	await retireSpentSeals(wallet, chain.spent);
}

/** Throw before a send or escrow join when live outputs cannot cover the amount. */
export async function assertLiveCover(
	wallet: PrepareWallet,
	assetId: string,
	amount: number,
	outputSpent?: OutputSpendProbe
): Promise<void> {
	if (!wallet.listUnspents) return;
	const chain = await chainAllocation(
		await readUnspents(wallet),
		assetId,
		outputSpent ?? esploraOutputSpent
	);
	const short = liveShortfall(chain, amount);
	if (short) throw new Error(short);
}

async function readUnspents(wallet: PrepareWallet): Promise<RgbUnspentRef[]> {
	if (!wallet.listUnspents) return [];
	return wallet.listUnspents().catch(() => []);
}

function logSealState(nia: RgbNiaRef[], unspents: RgbUnspentRef[]): void {
	const allocated = unspents.filter((unspent) => unspent.rgbAllocations.length > 0);
	console.info('[e2e] nia', JSON.stringify(nia));
	console.info('[e2e] allocated', JSON.stringify(allocated));
}

let sendDepth = 0;
let unconfirmedChange = false;

/** The next asset send may spend the colorable coin just funded in this turn. */
export function allowUnconfirmedChange(): void {
	unconfirmedChange = true;
}

/** 0 only for the send that follows a same-turn funding. Every other send waits for 1 confirmation. */
export function takeChangeConfirmations(): number {
	const min = unconfirmedChange ? 0 : 1;
	unconfirmedChange = false;
	return min;
}
let turn = 0;
let pendingTurns = 0;
let turnTail: Promise<void> = Promise.resolve();

/** True while an on-chain send is using the wasm wallet. */
export function walletSendPending(): boolean {
	return sendDepth > 0;
}

/** True while this tab is inside the single wasm wallet turn. */
export function inWalletTurn(): boolean {
	return turn > 0;
}

/** Run wasm wallet work one call at a time. An idle wallet starts the work immediately. */
export function enqueueWallet<T>(work: () => Promise<T>): Promise<T> {
	const execute = async (): Promise<T> => {
		turn += 1;
		try {
			return await work();
		} finally {
			turn -= 1;
			pendingTurns -= 1;
		}
	};
	pendingTurns += 1;
	if (pendingTurns === 1 && turn === 0) {
		const current = execute();
		turnTail = current.then(
			() => undefined,
			() => undefined
		);
		return current;
	}
	const current = turnTail.then(execute);
	turnTail = current.then(
		() => undefined,
		() => undefined
	);
	return current;
}

/** Hold the wallet turn and tell balance polling to stay out until send finishes. */
export function enqueueSend<T>(work: () => Promise<T>): Promise<T> {
	return enqueueWallet(async () => {
		sendDepth += 1;
		try {
			return await work();
		} finally {
			sendDepth -= 1;
		}
	});
}

function walletIsBusy(error: unknown): boolean {
	return String(error).toLowerCase().includes('busy with another operation');
}

async function retryBusy<T>(work: () => Promise<T>): Promise<T> {
	let last: unknown;
	for (let attempt = 0; attempt < 8; attempt += 1) {
		try {
			return await work();
		} catch (error: unknown) {
			last = error;
			if (!walletIsBusy(error) || attempt === 7) throw error;
			await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
		}
	}
	throw last instanceof Error ? last : new Error(String(last));
}

async function syncWhenPresent(wallet: PrepareWallet): Promise<void> {
	if (!wallet.syncWallet) return;
	await wallet.syncWallet();
}

/** rgb-lib refresh plus a Bitcoin resync. Callers re-read Esplora after this. */
export async function resyncRgbWallet(wallet: PrepareWallet): Promise<void> {
	await retryBusy(async () => {
		if (wallet.goOnline && wallet.isOnline?.() !== true) {
			await wallet.goOnline(UTEXO_INDEXER);
		}
		await syncWhenPresent(wallet);
		await wallet.refreshWallet();
	});
}

/** Sync BDK, then return the listed balance. A mismatch is refreshed once before a refusal. */
export async function prepareRgbOnchainSend(
	wallet: PrepareWallet,
	assetId: string,
	knownSpendable?: number,
	outputSpent?: OutputSpendProbe,
	sendAmount?: number
): Promise<number> {
	const probe = outputSpent ?? esploraOutputSpent;
	if (sendDepth === 0) {
		return enqueueSend(() =>
			prepareRgbOnchainSend(wallet, assetId, knownSpendable, probe, sendAmount)
		);
	}
	sendDepth += 1;
	try {
		if (sessionBlocksSend()) throw new Error(OTHER_SESSION_WARNING);
		if (wallet.listUnspents) {
			const previewRows = await readUnspents(wallet);
			const locked = lockedCoinBlocker(previewRows, assetId);
			if (locked) throw new Error(locked);
		}
		await resyncRgbWallet(wallet);
		await retryBusy(() => releaseStuckSends(wallet));
		await retryBusy(() => releasePhantomSends(wallet));
		await retryBusy(() => syncWhenPresent(wallet));

		if (!wallet.listAssets || !wallet.listUnspents) {
			throw new Error('Refusing onchainSend: wallet cannot list seals');
		}
		let unspents = await readUnspents(wallet);
		let chain = await chainAllocation(unspents, assetId, probe);
		if (listedChainMismatch(chain, fungibleAllocationSum(unspents, assetId))) {
			setWalletRefreshing(true);
			try {
				await resyncRgbWallet(wallet);
				unspents = await readUnspents(wallet);
				chain = await chainAllocation(unspents, assetId, probe);
			} finally {
				setWalletRefreshing(false);
			}
		}
		const listed = await wallet.listAssets();
		const assets = [...(listed.nia ?? []), ...(listed.ifa ?? [])];
		if (import.meta.env.VITE_E2E_TEST === 'true') logSealState(assets, unspents);

		const listedSpendable =
			assets.find((asset) => asset.assetId === assetId)?.balance?.spendable ?? 0;
		const spendable =
			typeof knownSpendable === 'number' && Number.isSafeInteger(knownSpendable)
				? knownSpendable
				: listedSpendable;
		const needed =
			typeof sendAmount === 'number' && Number.isSafeInteger(sendAmount) && sendAmount > 0
				? sendAmount
				: spendable;
		const failedStale = await failStaleCounterparties(wallet, chain.unknown ? [] : chain.spent);
		let rows = unspents;
		let reading = chain;
		let spentStill = chain.spent;
		if (!chain.unknown && (chain.spent.length > 0 || failedStale)) {
			if (chain.spent.length > 0) await retireSpentSeals(wallet, chain.spent);
			rows = await readUnspents(wallet);
			reading = await chainAllocation(rows, assetId, probe);
			spentStill = reading.spent;
			const short = liveShortfall(reading, needed);
			if (short) throw new Error(short);
		}
		const active = reading.unknown ? rows : pruneSpentAllocations(rows, spentStill);
		const listedSum = fungibleAllocationSum(active, assetId);
		const usable = unspentSpendable(spendable, listedSum, reading, rows.length > 0);
		// Change is the unspent remainder only. A spent coin must not be an input.
		const comparable = listedSum > 0 ? listedSum : usable;
		const partial = changeRoomBlocker(active, assetId, comparable, needed);
		// A short payment continues into the remainder assignment. Block it only when a
		// spent coin is still in the list rgb-lib would select.
		if (partial && listsSpentAllocation(rows, assetId, spentStill)) {
			throw new Error(partial);
		}
		const blocker = sealSendBlocker(active, assetId, usable);
		if (blocker) throw new Error(blocker);
		return comparable;
	} finally {
		sendDepth -= 1;
	}
}
