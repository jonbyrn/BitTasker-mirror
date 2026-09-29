import { esploraHasTx } from '$lib/stores/wallet/signet-broadcast';

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

export function hasUncoloredFeeUtxo(unspents: RgbUnspentRef[]): boolean {
	return unspents.some((unspent) => unspent.utxo.exists && unspent.utxo.colorable === false);
}

/** Why onchainSend must not run. Null means the seal, fee coin, and spendable agree. */
export function sealSendBlocker(
	unspents: RgbUnspentRef[],
	assetId: string,
	spendable: number
): string | null {
	const stranded = unspents.find((unspent) => strandedSeal(unspent, assetId));
	if (stranded) {
		if ((stranded.pendingBlinded ?? 0) > 0) {
			return `Refusing onchainSend: ${assetId} is locked by a blank invoice. The payment arrives as a new UTXO.`;
		}
		const txid = stranded.utxo.outpoint?.txid ?? 'unknown';
		return `Refusing onchainSend: ${assetId} is sealed on ${txid}, which this BDK store does not own`;
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
export async function prepareRgbOnchainSend(wallet: PrepareWallet, assetId: string): Promise<void> {
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
	const listed = await wallet.listAssets();
	const assets = [...(listed.nia ?? []), ...(listed.ifa ?? [])];
	if (import.meta.env.VITE_E2E_TEST === 'true') logSealState(assets, unspents);

	const spendable = assets.find((asset) => asset.assetId === assetId)?.balance?.spendable ?? 0;
	const blocker = sealSendBlocker(unspents, assetId, spendable);
	if (blocker) throw new Error(blocker);
}
