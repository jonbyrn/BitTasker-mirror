const STUCK_SEND_STATUS = new Set([
	'Failed',
	'WaitingCounterparty',
	'WaitingConfirmations',
	'Initiated'
]);

const FEE_VOUTS = new Set([0, 1]);
const UTEXO_INDEXER = 'https://esplora-api.utexo.com';
const UNSEALED_MINT_UNITS = 10_000;
const ORPHAN_TXID = 'f4148f9d02745498ace80993c3365f6745dddba80ff96cbac1976aaf54567ca8';

export interface RgbTransferRef {
	kind: string;
	status: string;
	batchTransferIdx: number;
}

export interface RgbAllocationRef {
	assetId?: string;
	assignment?: { type?: string; amount?: number };
}

export interface RgbUnspentRef {
	rgbAllocations: RgbAllocationRef[];
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

/** Colorable outputs that actually hold `assetId`. */
export function allocatedSealRows(unspents: RgbUnspentRef[], assetId: string): RgbUnspentRef[] {
	return unspents.filter(
		(unspent) =>
			unspent.utxo.exists &&
			unspent.utxo.colorable === true &&
			unspent.rgbAllocations.some((allocation) => allocation.assetId === assetId)
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
	const seals = allocatedSealRows(unspents, assetId);
	if (seals.some((unspent) => unspent.utxo.outpoint?.txid === ORPHAN_TXID)) {
		return `Refusing onchainSend: ${assetId} is sealed on ${ORPHAN_TXID}, which this BDK store does not own`;
	}
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
	listAssets?: () => Promise<{ nia?: RgbNiaRef[] }>;
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
	if (wallet.syncWallet) await wallet.syncWallet();

	if (!wallet.listAssets || !wallet.listUnspents) {
		throw new Error('Refusing onchainSend: wallet cannot list seals');
	}
	const unspents = await readUnspents(wallet);
	const listed = await wallet.listAssets();
	const nia = listed.nia ?? [];
	if (import.meta.env.VITE_E2E_TEST === 'true') logSealState(nia, unspents);

	const spendable = nia.find((asset) => asset.assetId === assetId)?.balance?.spendable ?? 0;
	const blocker = sealSendBlocker(unspents, assetId, spendable);
	if (blocker) throw new Error(blocker);
}
