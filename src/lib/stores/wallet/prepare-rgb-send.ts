import { esploraHasTx, esploraOutputSpent } from '$lib/stores/wallet/signet-broadcast';

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
	};
}

export interface RgbNiaRef {
	assetId?: string;
	balance?: { spendable?: number };
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
}

export type OutputSpendProbe = (
	txid: string,
	vout: number
) => Promise<{ spent: boolean; txid?: string } | null>;

function sealOutpoint(unspent: RgbUnspentRef): { txid: string; vout: number } | null {
	const txid = unspent.utxo.outpoint?.txid?.trim().toLowerCase();
	const vout = unspent.utxo.outpoint?.vout;
	if (!txid || !/^[0-9a-f]+$/i.test(txid)) return null;
	if (!Number.isSafeInteger(vout) || vout == null || vout < 0) return null;
	return { txid, vout };
}

/**
 * Units whose output Esplora still lists as unspent.
 * A spent allocation is dropped. A failed lookup stays in `live` and sets `unknown`.
 */
export async function chainAllocation(
	unspents: RgbUnspentRef[],
	assetId: string,
	probe: OutputSpendProbe
): Promise<ChainAllocation> {
	let live = 0;
	let checked = 0;
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
		let result: { spent: boolean; txid?: string } | null = null;
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
			live += amount;
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
	return { live, spent, checked, unknown };
}

/** Clear refusal when RGB still lists an output the chain already spent. */
export function spentSealMessage(spent: SpentSeal[]): string | null {
	if (spent.length === 0) return null;
	const first = spent[0];
	const by = first.spentBy ? ` by ${first.spentBy}` : '';
	return `Refusing onchainSend: ${first.txid}:${first.vout} was already spent on-chain${by}. RGB still lists that USDT, so this send is blocked.`;
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

/** Why onchainSend must not run. Null means the seal, fee coin, and spendable agree. */
export function sealSendBlocker(
	unspents: RgbUnspentRef[],
	assetId: string,
	spendable: number
): string | null {
	const spendableSeals = allocatedSealRows(unspents, assetId);
	const stranded = unspents.find(
		(unspent) => strandedSeal(unspent, assetId) && (unspent.pendingBlinded ?? 0) === 0
	);
	if (stranded) {
		const txid = stranded.utxo.outpoint?.txid ?? 'unknown';
		return `Refusing onchainSend: ${assetId} is sealed on ${txid}, which this BDK store does not own`;
	}
	const pendingLock = unspents.some(
		(unspent) => holdsAsset(unspent, assetId) && (unspent.pendingBlinded ?? 0) > 0
	);
	if (pendingLock && spendableSeals.length === 0) {
		return `Refusing onchainSend: ${assetId} is locked by a blank invoice. The payment arrives as a new UTXO.`;
	}
	const seals = allocatedSealRows(unspents, assetId);
	const anyAllocated = unspents.some((unspent) => unspent.rgbAllocations.length > 0);
	if (!anyAllocated && spendable === UNSEALED_MINT_UNITS) {
		return 'Refusing onchainSend: spendable 10000 has no seal in listUnspents';
	}
	if (seals.length === 0) {
		return `Refusing onchainSend: ${assetId} has no colorable allocation`;
	}
	if (!hasUncoloredFeeUtxo(unspents)) {
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

async function readUnspents(wallet: PrepareWallet): Promise<RgbUnspentRef[]> {
	if (!wallet.listUnspents) return [];
	return wallet.listUnspents().catch(() => []);
}

function logSealState(nia: RgbNiaRef[], unspents: RgbUnspentRef[]): void {
	const allocated = unspents.filter((unspent) => unspent.rgbAllocations.length > 0);
	console.info('[e2e] nia', JSON.stringify(nia));
	console.info('[e2e] allocated', JSON.stringify(allocated));
}

/** Sync BDK, then refuse send until this asset is sealed on a colorable UTXO. */
export async function prepareRgbOnchainSend(
	wallet: PrepareWallet,
	assetId: string,
	knownSpendable?: number,
	outputSpent: OutputSpendProbe = esploraOutputSpent
): Promise<void> {
	if (wallet.goOnline && wallet.isOnline?.() !== true) {
		await wallet.goOnline(UTEXO_INDEXER);
	}
	if (wallet.syncWallet) await wallet.syncWallet();
	await releaseStuckSends(wallet);
	await releasePhantomSends(wallet);
	if (wallet.syncWallet) await wallet.syncWallet();

	if (!wallet.listAssets || !wallet.listUnspents) {
		throw new Error('Refusing onchainSend: wallet cannot list seals');
	}
	const unspents = await readUnspents(wallet);
	const chain = await chainAllocation(unspents, assetId, outputSpent);
	const spentMessage = spentSealMessage(chain.spent);
	if (spentMessage) throw new Error(spentMessage);
	const listed = await wallet.listAssets();
	const assets = [...(listed.nia ?? []), ...(listed.ifa ?? [])];
	if (import.meta.env.VITE_E2E_TEST === 'true') logSealState(assets, unspents);

	const listedSpendable =
		assets.find((asset) => asset.assetId === assetId)?.balance?.spendable ?? 0;
	const spendable =
		typeof knownSpendable === 'number' && Number.isSafeInteger(knownSpendable)
			? knownSpendable
			: listedSpendable;
	const blocker = sealSendBlocker(unspents, assetId, spendable);
	if (blocker) throw new Error(blocker);
}
