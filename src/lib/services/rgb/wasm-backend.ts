/**
 * Native WASM Backend — binds `RgbSealBackend` to the real `@utexo/rgb-sdk-web`
 * `UTEXOWallet` API (verified against its .d.ts; see mapping notes below).
 *
 * `@utexo/rgb-sdk-web`'s actual lifecycle is a per-*transfer* status machine
 * (`TransferStatus` in `@utexo/rgb-sdk-core`), driven by polling
 * `refreshWallet()`/`listTransfers()` rather than imperative per-seal calls.
 * `types.ts`'s `RgbSealState` mirrors that status machine directly:
 *
 * - `commit()`  -> `onchainReceive()` with a blinded invoice (omits `assetId`
 *                  for native BTC). A witness/`wvout` invoice makes the payer
 *                  add a foreign UTXO that BDK does not have. Falls back to
 *                  `witnessReceive()`.
 * - `witness()` -> `refreshWallet()` + `listTransfers()`, fail-closed: rejects
 *                  unless the matching transfer has reached at least
 *                  `WAITING_CONFIRMATIONS`.
 * - `spend()`   -> same fail-closed refresh-and-check, requiring `SETTLED`.
 * - `validateConsignment()` -> `decodeRGBInvoice()`, checked against
 *                  `expectedContractId` via `assetId`.
 */

import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import { isNativeBitcoinAsset } from '$lib/types/rgb-contract';
import { withWasm } from '$lib/stores/wallet/wasm-lock';
import type { RgbSealBackend } from './command-queue';
import type {
	CommitCommandInput,
	RgbSeal,
	RgbSealState,
	SealId,
	SpendCommandInput,
	ValidateConsignmentInput,
	ValidateConsignmentResult,
	WitnessCommandInput
} from './types';

// `Transfer`/`TransferStatus` are declared (without `export`) inside
// `@utexo/rgb-sdk-core`'s own .d.ts — neither that package nor
// `@utexo/rgb-sdk-web` re-exports them as named types. Derived instead from
// the one method that's actually public: `UTEXOWallet.listTransfers()`.
type Transfer = Awaited<ReturnType<UTEXOWallet['listTransfers']>>[number];
type TransferStatus = Transfer['status'];

function nowMs(): number {
	return Date.now();
}

/** Maps the SDK's real transfer status onto our `RgbSealState` (see file header).
 * Exported for the live-SDK smoke test (src/lib/tests/integration/services/rgb/) —
 * not otherwise used outside this module. */
export function toRgbSealState(status: TransferStatus): RgbSealState {
	switch (status) {
		case 'Initiated':
			return 'INITIATED';
		case 'WaitingCounterparty':
			return 'WAITING_COUNTERPARTY';
		case 'WaitingSafeHeight':
		case 'WaitingConfirmations':
			return 'WAITING_CONFIRMATIONS';
		case 'Settled':
			return 'SETTLED';
		case 'Failed':
			return 'FAILED';
	}
}

type ReceiveInvoiceParams = {
	amount: number;
	assetId?: string;
	witness?: boolean;
};

function receiveInvoiceParams(input: CommitCommandInput): ReceiveInvoiceParams {
	const params: ReceiveInvoiceParams = { amount: input.amount, witness: false };
	if (!isNativeBitcoinAsset(input.assetId)) {
		params.assetId = input.assetId;
	}
	return params;
}

async function receiveInvoice(
	wallet: UTEXOWallet,
	params: ReceiveInvoiceParams
): Promise<{ invoice: string; recipientId: string }> {
	if (typeof wallet.onchainReceive === 'function') {
		return wallet.onchainReceive(params);
	}
	return wallet.witnessReceive(params);
}

async function assertUncoloredReceive(wallet: UTEXOWallet, invoice: string): Promise<void> {
	if (!invoice.startsWith('rgb1')) return;
	const decoded = await wallet.decodeRGBInvoice({ invoice }).catch(() => null);
	if (decoded?.assetId && !isNativeBitcoinAsset(decoded.assetId)) {
		throw new Error(`Native BTC receive encoded a colored asset ${decoded.assetId}`);
	}
}

const WALLET_BUSY = /busy with another operation/i;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * There is no JS mutex to release. `refreshWallet()` here only adds another
 * overlapping wasm borrow, so a failed seal call is not followed by one.
 */
export async function releaseWalletMutex(_wallet: UTEXOWallet): Promise<void> {
	// No JS mutex exists. Refreshing here would borrow the wasm wallet again.
}

async function withWalletMutex<T>(_wallet: UTEXOWallet, work: () => Promise<T>): Promise<T> {
	return withWasm('rgb-seal', async () => {
		let last: unknown;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				return await work();
			} catch (error) {
				last = error;
				const message = error instanceof Error ? error.message : String(error);
				if (!WALLET_BUSY.test(message) || attempt === 2) throw error;
				await sleep(200 * 2 ** attempt);
			}
		}
		throw last instanceof Error ? last : new Error('RGB wallet is busy with another operation');
	});
}

/** Refreshes wallet state and finds the transfer matching `recipientId`. Fail-closed: throws if absent. */
async function findTransfer(
	wallet: UTEXOWallet,
	recipientId: SealId,
	assetId: string
): Promise<Transfer> {
	await wallet.refreshWallet();
	const transfers = isNativeBitcoinAsset(assetId)
		? await wallet.listTransfers()
		: await wallet.listTransfers(assetId);
	const match = transfers.find((t) => t.recipientId === recipientId);
	if (!match) {
		throw new Error(`No transfer found for recipientId ${recipientId}`);
	}
	return match;
}

function toRgbSeal(
	transfer: Transfer,
	recipientId: SealId,
	contractId: CommitCommandInput['contractId'],
	assetId: string,
	contractTitle?: string,
	bidderComments?: string
): RgbSeal {
	return {
		id: recipientId,
		contractId,
		contractTitle,
		bidderComments,
		state: toRgbSealState(transfer.status),
		utxo: transfer.receiveUtxo
			? { txid: transfer.receiveUtxo.txid, vout: transfer.receiveUtxo.vout }
			: undefined,
		assetId,
		amount: transfer.requestedAssignment?.amount ?? 0,
		createdAt: transfer.createdAt * 1000,
		updatedAt: nowMs()
	};
}

export class WasmRgbSealBackend implements RgbSealBackend {
	constructor(private readonly wallet: UTEXOWallet) {
		// Expose wallet for E2E USDT verification
		if (import.meta.env.VITE_E2E_TEST) {
			(window as Window & { __utexoWallet?: UTEXOWallet }).__utexoWallet = wallet;
		}
	}

	async commit(input: CommitCommandInput): Promise<RgbSeal> {
		return withWalletMutex(this.wallet, async () => {
			const invoice = await receiveInvoice(this.wallet, receiveInvoiceParams(input));
			if (isNativeBitcoinAsset(input.assetId)) {
				await assertUncoloredReceive(this.wallet, invoice.invoice);
			}
			return {
				id: invoice.recipientId as SealId,
				contractId: input.contractId,
				invoice: invoice.invoice,
				contractTitle: input.contractTitle,
				bidderComments: input.bidderComments,
				state: 'INITIATED',
				assetId: input.assetId,
				amount: input.amount,
				createdAt: nowMs(),
				updatedAt: nowMs()
			};
		});
	}

	/** Fail-closed: rejects unless the SDK confirms the transfer has reached WAITING_CONFIRMATIONS or SETTLED. */
	async witness(input: WitnessCommandInput): Promise<RgbSeal> {
		const transfer = await withWalletMutex(this.wallet, () =>
			findTransfer(this.wallet, input.recipientId, input.assetId)
		);
		const state = toRgbSealState(transfer.status);
		if (state !== 'WAITING_CONFIRMATIONS' && state !== 'SETTLED') {
			throw new Error(
				`Seal ${input.recipientId} is not yet witnessed on-chain (status: ${transfer.status})`
			);
		}
		return toRgbSeal(transfer, input.recipientId, input.contractId, input.assetId);
	}

	/** Fail-closed: rejects unless the SDK confirms the transfer has reached SETTLED. */
	async spend(input: SpendCommandInput): Promise<RgbSeal> {
		const transfer = await withWalletMutex(this.wallet, () =>
			findTransfer(this.wallet, input.recipientId, input.assetId)
		);
		if (toRgbSealState(transfer.status) !== 'SETTLED') {
			throw new Error(`Seal ${input.recipientId} is not yet settled (status: ${transfer.status})`);
		}
		return toRgbSeal(transfer, input.recipientId, input.contractId, input.assetId);
	}

	async validateConsignment(input: ValidateConsignmentInput): Promise<ValidateConsignmentResult> {
		try {
			const decoded = await this.wallet.decodeRGBInvoice({ invoice: input.consignment });
			if (decoded.assetId !== input.expectedContractId) {
				return {
					valid: false,
					reason: `Consignment assetId ${decoded.assetId} does not match expected contract ${input.expectedContractId}`
				};
			}
			return { valid: true };
		} catch (err) {
			// Fail closed: any decode/validation error rejects the consignment,
			// it never falls through to "valid" by default.
			return {
				valid: false,
				reason: err instanceof Error ? err.message : String(err)
			};
		}
	}
}
