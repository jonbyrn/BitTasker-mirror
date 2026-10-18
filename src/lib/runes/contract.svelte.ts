import type { NostrEvent } from 'nostr-tools';
import { SvelteMap } from 'svelte/reactivity';
import { state } from '$lib/stores/wallet/wallet-state';
import { enqueueSend } from '$lib/stores/wallet/prepare-rgb-send';
import { blankLockInvoice } from '$lib/stores/wallet/decode-rgb-invoice';
import { assertInvoiceRail, isEscrowBolt11, isRgbInvoice } from '$lib/services/rgb/escrow-rail';
import { payLnBtc } from '$lib/services/rgb/escrow-rails/ln-btc';
import { payLnUsdt, payLnUsdtBolt11 } from '$lib/services/rgb/escrow-rails/ln-usdt';
import { onchainUsdtId, payOnchainUsdt } from '$lib/services/rgb/escrow-rails/rgb-onchain';
import type { EscrowProof } from '$lib/services/rgb/escrow-rails/types';
import { proofReady } from '$lib/services/rgb/escrow-rails/types';
import { ESCROW_LNUSDT, lnUsdtOpen } from '$lib/services/rgb/escrow-rail';
import { recordEscrowHistory } from '$lib/stores/wallet/escrow-history';
import { getBrowserRgbCommandQueue } from '$lib/services/rgb/command-queue';
import type { RgbSeal, SealId } from '$lib/services/rgb/types';
import {
	type ContractPaymentAsset,
	type PaymentSplitConfig,
	escrowSendAmount,
	getConfiguredRgbUsdtAssetId,
	selectEscrowAsset,
	spendableRgbAssets,
	usdtPrecision,
	type SpendableNia
} from '$lib/types/rgb-contract';
import type { ConsignmentExchangeMessage } from '$lib/services/rgb/consignment-exchange';
import { contractTaskId } from '$lib/utils/contract/contract-tabs';
import { completeTask } from '$lib/nostr/task';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';
import type { LockedBidCurrency } from '$lib/types/bid';

export type ContractRuneStatus =
	| 'draft'
	| 'funding'
	| 'locking'
	| 'locked'
	| 'funded'
	| 'work_in_progress'
	| 'work_submitted'
	| 'approved'
	| 'settlement_requested'
	| 'releasing'
	| 'released_pending'
	| 'released'
	| 'settled'
	| 'cancelling'
	| 'cancelled'
	| 'refunded'
	| 'disputed'
	| 'failed';

const CONTRACT_STATUS_ORDER = [
	'draft',
	'funding',
	'locking',
	'locked',
	'funded',
	'work_in_progress',
	'work_submitted',
	'approved',
	'settlement_requested',
	'releasing',
	'released_pending',
	'released',
	'cancelled',
	'refunded',
	'settled'
] as const;

const CONTRACT_STATUS_RANK = new Map<string, number>(
	CONTRACT_STATUS_ORDER.map((status, index) => [status, index])
);

/** Furthest lifecycle status. A later funding attestation must not hide submitted work. */
export function leadingContractStatus(statuses: readonly string[]): string {
	let leading = '';
	let rank = -1;
	for (const status of statuses) {
		const next = CONTRACT_STATUS_RANK.get(status);
		if (next === undefined || next < rank) continue;
		leading = status;
		rank = next;
	}
	return leading;
}

export type ContractFundingState =
	| 'idle'
	| 'checking_wallet'
	| 'creating_request'
	| 'awaiting_payment'
	| 'verifying_transfer'
	| 'funded'
	| 'failed';

export interface ContractRuneInput {
	contractId: string;
	contractTitle?: string;
	bidderComments?: string;
	totalAmountUsd: number;
	amountSats?: number;
	lockedAmount?: number;
	lockedCurrency?: LockedBidCurrency;
	split: PaymentSplitConfig;
	partyPubkeys?: string[];
}

export interface ContractRuneSnapshot {
	contractId: string;
	contractTitle?: string;
	bidderComments?: string;
	totalAmountUsd: number;
	lockedAmount: number;
	lockedCurrency: LockedBidCurrency;
	status: ContractRuneStatus;
	fundingState: ContractFundingState;
	fundingInvoice?: string;
	workMessage?: string;
	proofUrl?: string;
	payoutInvoice?: string;
	settlementInvoice?: string;
	settlementAmount?: number;
	proofs: readonly EscrowProof[];
	seals: readonly RgbSeal[];
	split: PaymentSplitConfig;
	lastAttestationId?: string;
	error?: string;
}

const RELAYS = resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);

function assertPercentage(value: number, name: string): void {
	if (!Number.isFinite(value) || value < 0 || value > 100) {
		throw new Error(`${name} must be between 0 and 100`);
	}
}

function validateSplit(split: PaymentSplitConfig): void {
	assertPercentage(split.primaryPercentage, 'Primary split percentage');
	assertPercentage(split.secondaryPercentage, 'Secondary split percentage');
	if (split.primaryPercentage + split.secondaryPercentage !== 100) {
		throw new Error('Payment split percentages must total 100');
	}
}

function assetAmount(
	totalAmountUsd: number,
	percentage: number,
	asset: ContractPaymentAsset,
	amountSats?: number
): number {
	const amountUsd = totalAmountUsd * (percentage / 100);
	if (asset === 'usdt_rgb' || asset === 'usdt_ln') return Math.round(amountUsd * 1_000_000);
	if (amountSats && amountSats > 0) {
		return Math.max(1, Math.round(amountSats * (percentage / 100)));
	}
	return Math.max(1, Math.round(amountUsd * 100));
}

function isE2ERun(): boolean {
	return import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
}

function e2eMintedAssetId(): string | undefined {
	if (typeof window === 'undefined') return undefined;
	const minted = (window as Window & { __E2E_MINTED_ASSET_ID?: string }).__E2E_MINTED_ASSET_ID;
	return minted || undefined;
}

export class TaskeeInvoiceRequired extends Error {
	constructor() {
		super('Taskee escrow invoice is not ready');
		this.name = 'TaskeeInvoiceRequired';
	}
}

function unitsForAsset(
	assets: readonly SpendableNia[],
	assetId: string,
	totalAmountUsd: number
): number {
	const row = assets.find((item) => item.assetId === assetId);
	const spendable = Number(row?.balance?.spendable ?? 0);
	return escrowSendAmount({
		spendable,
		totalAmountUsd,
		precision: usdtPrecision(row?.ticker, row?.precision),
		fullSpendable: e2eMintedAssetId() === assetId
	});
}

function readTaskeeInvoice(): string | undefined {
	if (typeof window === 'undefined') return undefined;
	const invoice = (
		window as Window & { __E2E_TASKEE_INVOICE?: string }
	).__E2E_TASKEE_INVOICE?.trim();
	if (!invoice) return undefined;
	if (isRgbInvoice(invoice) || isEscrowBolt11(invoice)) return invoice;
	return undefined;
}

function escrowAssetId(nia: readonly SpendableNia[]): string | undefined {
	return selectEscrowAsset(nia, [
		e2eMintedAssetId(),
		getConfiguredRgbUsdtAssetId(),
		import.meta.env.VITE_RGB_ESCROW_ASSET_ID as string | undefined
	]);
}

function resolveAssetId(asset: ContractPaymentAsset): string {
	const minted = e2eMintedAssetId();
	if (minted) return minted;
	if (asset === 'btc_onchain' || asset === 'btc_lightning') return 'BTC';
	if (isE2ERun()) {
		return getConfiguredRgbUsdtAssetId() ?? 'rgb:mock_e2e_usdt_asset_id';
	}
	const configured = getConfiguredRgbUsdtAssetId();
	if (!configured) throw new Error('USDT asset not configured');
	return configured;
}

async function publishAttestation(
	contractId: string,
	status: ContractRuneStatus,
	seals: readonly RgbSeal[],
	partyPubkeys: readonly string[],
	snapshot: ContractRuneSnapshot,
	message?: string,
	proofUrl?: string
): Promise<NostrEvent> {
	const event = await getSignedEvent({
		kind: KINDS.CONTRACT_STATUS,
		content: JSON.stringify({
			type: 'contract-status',
			contractId,
			status,
			contractTitle: snapshot.contractTitle,
			bidderComments: snapshot.bidderComments,
			totalAmountUsd: snapshot.totalAmountUsd,
			lockedAmount: snapshot.lockedAmount,
			lockedCurrency: snapshot.lockedCurrency,
			split: snapshot.split,
			seals: seals.map((seal) => ({
				id: seal.id,
				contractId: seal.contractId,
				assetId: seal.assetId,
				amount: seal.amount,
				state: seal.state,
				utxo: seal.utxo,
				contractTitle: seal.contractTitle,
				bidderComments: seal.bidderComments,
				createdAt: seal.createdAt,
				updatedAt: seal.updatedAt
			})),
			message,
			proofUrl,
			workMessage: snapshot.workMessage,
			payoutInvoice: snapshot.payoutInvoice,
			settlementInvoice: snapshot.settlementInvoice,
			settlementAmount: snapshot.settlementAmount,
			proofs: snapshot.proofs
		}),
		tags: [
			['m', 'contract-status'],
			['r', contractId],
			['s', status],
			...(proofUrl ? [['proof_url', proofUrl]] : []),
			...partyPubkeys.map((pubkey) => ['p', pubkey])
		]
	});
	const results = await publishToMultipleRelays(event, RELAYS);
	if (!results.some((result) => result.success)) {
		throw new Error('Contract status could not be published to any Nostr relay');
	}
	return event;
}

export class ContractRune {
	private static readonly registry = new SvelteMap<string, ContractRune>();
	readonly contractId: string;
	readonly contractTitle?: string;
	readonly bidderComments?: string;
	readonly totalAmountUsd: number;
	readonly amountSats?: number;
	readonly lockedAmount: number;
	readonly lockedCurrency: LockedBidCurrency;
	readonly split: PaymentSplitConfig;
	readonly partyPubkeys: readonly string[];

	status = $state<ContractRuneStatus>('draft');
	fundingState = $state<ContractFundingState>('idle');
	seals = $state<RgbSeal[]>([]);
	isBusy = $state(false);
	error = $state<string | null>(null);
	lastAttestationId = $state<string | null>(null);
	workMessage = $state<string | undefined>(undefined);
	proofUrl = $state<string | undefined>(undefined);
	payoutInvoice = $state<string | undefined>(undefined);
	settlementInvoice = $state<string | undefined>(undefined);
	settlementAmount = $state(0);
	proofs = $state<EscrowProof[]>([]);

	constructor(input: ContractRuneInput) {
		if (!input.contractId.trim()) throw new Error('Contract id is required');
		if (!Number.isFinite(input.totalAmountUsd) || input.totalAmountUsd <= 0) {
			throw new Error('Contract amount must be positive');
		}
		validateSplit(input.split);
		this.contractId = input.contractId;
		this.contractTitle = input.contractTitle;
		this.bidderComments = input.bidderComments;
		this.totalAmountUsd = input.totalAmountUsd;
		this.amountSats = input.amountSats;
		this.lockedAmount = input.lockedAmount ?? input.totalAmountUsd;
		this.lockedCurrency = input.lockedCurrency ?? 'USD';
		this.split = input.split;
		this.partyPubkeys = input.partyPubkeys ?? [];
		ContractRune.registry.set(this.contractId, this);
	}

	static get(contractId: string): ContractRune | undefined {
		return ContractRune.registry.get(contractId);
	}

	static snapshots(): ContractRuneSnapshot[] {
		return Array.from(ContractRune.registry.values(), (rune) => rune.snapshot);
	}

	static clearRegistry(): void {
		ContractRune.registry.clear();
	}

	dispose(): void {
		if (ContractRune.registry.get(this.contractId) === this) {
			ContractRune.registry.delete(this.contractId);
		}
	}

	get snapshot(): ContractRuneSnapshot {
		return {
			contractId: this.contractId,
			contractTitle: this.contractTitle,
			bidderComments: this.bidderComments,
			totalAmountUsd: this.totalAmountUsd,
			lockedAmount: this.lockedAmount,
			lockedCurrency: this.lockedCurrency,
			status: this.status,
			fundingState: this.fundingState,
			fundingInvoice: this.seals.find((seal) => seal.invoice)?.invoice,
			workMessage: this.workMessage,
			proofUrl: this.proofUrl,
			payoutInvoice: this.payoutInvoice,
			settlementInvoice: this.settlementInvoice,
			settlementAmount: this.settlementAmount,
			proofs: this.proofs,
			seals: this.seals,
			split: this.split,
			lastAttestationId: this.lastAttestationId ?? undefined,
			error: this.error ?? undefined
		};
	}

	async fundForE2E(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'draft' && this.status !== 'failed') {
			throw new Error(`Cannot fund contract from ${this.status} state`);
		}
		const amount = Math.max(1, Math.round(this.totalAmountUsd * 100));
		this.status = 'funding';
		this.fundingState = 'creating_request';
		this.seals = [
			{
				id: `e2e-seal-${this.contractId}`,
				contractId: this.contractId,
				contractTitle: this.contractTitle,
				bidderComments: this.bidderComments,
				assetId: resolveAssetId(this.split.primaryAsset),
				amount
			}
		];
		this.status = 'funded';
		this.fundingState = 'funded';
		await this.attest('funded');
		return this.snapshot;
	}

	async prepareFunding(externalInvoice?: string): Promise<ContractRuneSnapshot> {
		if (this.status !== 'draft' && this.status !== 'failed') {
			throw new Error(`Cannot fund contract from ${this.status} state`);
		}
		return this.runTransition('funding', async () => {
			this.fundingState = 'checking_wallet';
			const wallet = state.utexoWallet;
			if (!wallet) throw new Error('RGB wallet is not initialized');
			this.fundingState = 'creating_request';
			const taskeeInvoice = externalInvoice?.trim() || readTaskeeInvoice();
			const canSendRgb =
				typeof wallet.onchainReceive === 'function' && typeof wallet.listAssets === 'function';
			if (taskeeInvoice || canSendRgb) {
				if (!taskeeInvoice) throw new TaskeeInvoiceRequired();
				assertInvoiceRail(this.split.primaryAsset, taskeeInvoice);
				// The blank invoice is the contract lock. Spendable USDT is checked on Pay.
				const listed =
					typeof wallet.listAssets === 'function'
						? await wallet.listAssets().catch(() => undefined)
						: undefined;
				const assets = spendableRgbAssets(listed);
				const selected = escrowAssetId(assets);
				let assetId = '';
				let amount = 0;
				if (selected) {
					try {
						assetId = selected;
						amount = unitsForAsset(assets, selected, this.totalAmountUsd);
					} catch {
						assetId = '';
						amount = 0;
					}
				}
				const invoice = taskeeInvoice;
				const recipientId = `funding-${this.contractId}`;
				const now = Date.now();
				this.seals = [
					{
						id: recipientId as RgbSeal['id'],
						contractId: this.contractId as RgbSeal['contractId'],
						invoice,
						contractTitle: this.contractTitle,
						bidderComments: this.bidderComments,
						state: 'INITIATED',
						assetId,
						amount,
						createdAt: now,
						updatedAt: now
					}
				];
				this.fundingState = 'awaiting_payment';
				await this.attest('funding', 'Funding request created');
				return this.snapshot;
			}
			const queue = await getBrowserRgbCommandQueue(wallet);
			const splitEntries = [
				{ asset: this.split.primaryAsset, percentage: this.split.primaryPercentage },
				{ asset: this.split.secondaryAsset, percentage: this.split.secondaryPercentage }
			].filter((entry) => entry.percentage > 0);
			const fundedSeals: RgbSeal[] = [];
			for (const entry of splitEntries) {
				const assetId = resolveAssetId(entry.asset);
				let amount = assetAmount(
					this.totalAmountUsd,
					entry.percentage,
					entry.asset,
					this.amountSats
				);
				const minted = e2eMintedAssetId();
				if (minted && assetId === minted) {
					const listed = await wallet.listAssets();
					const spendable = spendableRgbAssets(listed).find((row) => row.assetId === minted)
						?.balance?.spendable;
					if (typeof spendable === 'number' && spendable > 0) amount = spendable;
				}
				const result = await queue.commit({
					contractId: this.contractId as RgbSeal['contractId'],
					contractTitle: this.contractTitle,
					bidderComments: this.bidderComments,
					assetId,
					amount
				});
				if (!result.ok || !result.value) throw new Error(result.error ?? 'Escrow funding failed');
				fundedSeals.push(result.value);
			}
			this.seals = fundedSeals;
			this.fundingState = 'awaiting_payment';
			await this.attest('funding', 'Funding request created');
			return this.snapshot;
		});
	}

	async fund(): Promise<ContractRuneSnapshot> {
		const prepared = await this.prepareFunding();
		return this.confirmFundingFromPrepared(prepared);
	}

	async confirmFunding(): Promise<ContractRuneSnapshot> {
		// Pay already attests funded and does not notify the taskee. Check must
		// still succeed from that state so the contract can be published to both parties.
		if (this.status === 'funded' || this.status === 'locked') return this.snapshot;
		if (this.status !== 'funding') {
			throw new Error(`Cannot verify funding from ${this.status} state`);
		}
		return this.confirmFundingFromPrepared(this.snapshot);
	}

	async sendPaymentOnly(): Promise<void> {
		if (this.status !== 'funding') {
			throw new Error(`Cannot pay funding invoice from ${this.status} state`);
		}
		const invoice = this.snapshot.fundingInvoice;
		if (!invoice) throw new Error('Funding invoice is not available');
		this.fundingState = 'awaiting_payment';
		assertInvoiceRail(this.split.primaryAsset, invoice);
		this.status = 'locked';
		this.fundingState = 'awaiting_payment';
		this.error = null;
		recordEscrowHistory({
			contractId: this.contractId,
			title: this.contractTitle ?? this.contractId,
			kind: 'lock'
		});
		await this.attest('locked');
		this.error = null;
	}

	async payFundingFromWallet(): Promise<ContractRuneSnapshot> {
		await this.sendPaymentOnly();
		return this.snapshot;
	}

	private async confirmFundingFromPrepared(
		prepared: ContractRuneSnapshot
	): Promise<ContractRuneSnapshot> {
		if (this.status !== 'funding') return prepared;
		if (this.isBusy) throw new Error('Contract transition already in progress');
		this.isBusy = true;
		this.error = null;
		try {
			this.fundingState = 'verifying_transfer';
			const wallet = state.utexoWallet;
			if (!wallet) throw new Error('RGB wallet is not initialized');
			const queue = await getBrowserRgbCommandQueue(wallet);
			const witnessedSeals: RgbSeal[] = [];
			for (const seal of this.seals) {
				const result = await queue.witness({
					recipientId: seal.id,
					contractId: this.contractId as RgbSeal['contractId'],
					assetId: seal.assetId
				});
				if (!result.ok || !result.value) {
					this.fundingState = 'awaiting_payment';
					throw new Error(result.error ?? 'Payment has not been detected yet');
				}
				witnessedSeals.push({ ...seal, ...result.value });
			}
			this.seals = witnessedSeals;
			this.status = 'funded';
			this.fundingState = 'funded';
			await this.attest('funded', 'Escrow payment verified');
			return this.snapshot;
		} catch (error) {
			this.fundingState = 'awaiting_payment';
			this.error = error instanceof Error ? error.message : String(error);
			throw error;
		} finally {
			this.isBusy = false;
		}
	}

	async startWork(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'funded' && this.status !== 'locked') {
			throw new Error(`Cannot start contract from ${this.status} state`);
		}
		await this.commitStatus('work_in_progress');
		return this.snapshot;
	}

	async submitWork(message: string, proofUrl?: string): Promise<ContractRuneSnapshot> {
		if (
			this.status !== 'funded' &&
			this.status !== 'locked' &&
			this.status !== 'work_in_progress'
		) {
			throw new Error(`Cannot submit work from ${this.status} state`);
		}
		const deliverable = message.trim();
		if (!deliverable && !proofUrl?.trim()) {
			throw new Error('Deliverable proof is required');
		}
		this.workMessage = deliverable || undefined;
		this.proofUrl = proofUrl?.trim() || undefined;
		await this.commitStatus('work_submitted', this.workMessage, this.proofUrl);
		return this.snapshot;
	}

	async approveWork(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'work_submitted') {
			throw new Error(`Cannot approve work from ${this.status} state`);
		}
		await this.commitStatus('approved', 'Work approved');
		return this.snapshot;
	}

	async createPayoutInvoice(): Promise<string> {
		if (this.status !== 'approved') {
			throw new Error(`Cannot create a payout invoice from ${this.status} state`);
		}
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized');
		const asset = this.split.primaryAsset;
		const invoice = await this.payoutInvoiceFor(wallet, asset);
		const amount = asset === 'btc_lightning' ? this.lockedSats() : this.agreedUnits();
		if (!invoice) throw new Error('Taskee payout invoice was empty');
		await this.requestSettlement(invoice, amount);
		return invoice;
	}

	private async payoutInvoiceFor(
		wallet: NonNullable<typeof state.utexoWallet>,
		asset: PaymentSplitConfig['primaryAsset']
	): Promise<string> {
		if (asset === 'btc_lightning') return this.lightningPayout(wallet);
		if (asset === 'usdt_ln') return this.lnUsdtPayout(wallet);
		return this.rgbPayout(wallet, onchainUsdtId(undefined));
	}

	private async lightningPayout(wallet: NonNullable<typeof state.utexoWallet>): Promise<string> {
		if (typeof wallet.createLightningInvoice !== 'function') {
			throw new Error('Lightning not ready');
		}
		try {
			const created = await wallet.createLightningInvoice({
				amountSats: this.lockedSats(),
				expirySeconds: 3600
			});
			return created.lnInvoice?.trim() ?? '';
		} catch (error) {
			if (error instanceof TypeError) throw new Error('Lightning not ready');
			throw error;
		}
	}

	private async lnUsdtPayout(wallet: NonNullable<typeof state.utexoWallet>): Promise<string> {
		const channels = typeof wallet.listChannels === 'function' ? await wallet.listChannels() : [];
		if (!lnUsdtOpen(channels)) throw new Error('Lightning not ready');
		if (typeof wallet.createLightningInvoice !== 'function') {
			throw new Error('Lightning not ready');
		}
		const created = await wallet.createLightningInvoice({
			expirySeconds: 3600,
			asset: { assetId: ESCROW_LNUSDT, amount: this.agreedUnits() }
		});
		return created.lnInvoice?.trim() ?? '';
	}

	private async rgbPayout(
		wallet: NonNullable<typeof state.utexoWallet>,
		assetId: string
	): Promise<string> {
		if (typeof wallet.onchainReceive !== 'function') {
			throw new Error('RGB wallet cannot create an invoice');
		}
		const received = await wallet.onchainReceive({
			witness: false,
			minConfirmations: 1,
			durationSeconds: 3600,
			assetId,
			amount: this.agreedUnits()
		});
		return received.invoice?.trim() ?? '';
	}

	async requestSettlement(invoice: string, amount: number): Promise<ContractRuneSnapshot> {
		if (this.status !== 'approved') {
			throw new Error(`Cannot request settlement from ${this.status} state`);
		}
		const next = invoice.trim();
		assertInvoiceRail(this.split.primaryAsset, next);
		if (isRgbInvoice(next) && blankLockInvoice(next)) {
			throw new Error('Settlement invoice must include an amount');
		}
		if (!Number.isSafeInteger(amount) || amount <= 0) {
			throw new Error('Settlement amount must be a positive whole number');
		}
		this.settlementInvoice = next;
		this.settlementAmount = amount;
		this.payoutInvoice = next;
		await this.commitStatus('settlement_requested');
		return this.snapshot;
	}

	async askReissue(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'settlement_requested') {
			throw new Error(`Cannot ask for a new invoice from ${this.status} state`);
		}
		await this.attest(this.status, 'reissue-requested');
		return this.snapshot;
	}

	async reissueSettlement(invoice: string, amount: number): Promise<ContractRuneSnapshot> {
		if (this.status !== 'settlement_requested' && this.status !== 'approved') {
			throw new Error(`Cannot reissue settlement from ${this.status} state`);
		}
		if (this.settlementAmount > 0 && amount > this.settlementAmount) {
			throw new Error('Reissued amount cannot exceed the agreed amount');
		}
		const previous = this.status;
		this.status = 'approved';
		const next = await this.requestSettlement(invoice, amount);
		if (next.status !== 'settlement_requested') this.status = previous;
		return this.snapshot;
	}

	async releaseEscrow(invoice?: string): Promise<ContractRuneSnapshot> {
		if (this.status !== 'settlement_requested' && this.status !== 'approved') {
			throw new Error(`Cannot release escrow from ${this.status} state`);
		}
		const payout = (invoice ?? this.settlementInvoice ?? this.payoutInvoice)?.trim() ?? '';
		if (!payout) throw new Error('Settlement invoice is required');
		assertInvoiceRail(this.split.primaryAsset, payout);
		if (isRgbInvoice(payout) && blankLockInvoice(payout)) {
			throw new Error('Settlement invoice must include an amount');
		}
		const previous = this.status;
		this.payoutInvoice = payout;
		this.settlementInvoice = payout;
		this.status = 'releasing';
		this.error = null;
		try {
			const proof = await this.paySettlement(payout);
			if (!proofReady(proof)) throw new Error('Settlement proof is missing');
			this.proofs = [...this.proofs, proof];
			this.status = 'released';
			recordEscrowHistory({
				contractId: this.contractId,
				title: this.contractTitle ?? this.contractId,
				kind: 'released',
				proof: proof.value
			});
			await this.attest('released', 'Escrow released');
			const taskId = contractTaskId(this.contractId);
			if (taskId) {
				try {
					await completeTask(taskId);
				} catch (error) {
					console.warn('[contract] task close failed', error);
				}
			}
			return this.snapshot;
		} catch (error) {
			this.status = previous;
			this.error = error instanceof Error ? error.message : String(error);
			throw error;
		}
	}

	async confirmSettled(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'released') {
			throw new Error(`Cannot settle contract from ${this.status} state`);
		}
		if (!this.proofs.some((proof) => proofReady(proof))) {
			throw new Error('Settlement proof is missing');
		}
		this.status = 'settled';
		await this.attest('settled');
		return this.snapshot;
	}

	async refund(invoice: string): Promise<ContractRuneSnapshot> {
		if (this.status !== 'released' && this.status !== 'released_pending') {
			throw new Error(`Cannot refund contract from ${this.status} state`);
		}
		const destination = invoice.trim();
		assertInvoiceRail(this.split.primaryAsset, destination);
		const proof = await this.paySettlement(destination);
		if (!proofReady(proof)) throw new Error('Settlement proof is missing');
		this.proofs = [...this.proofs, proof];
		this.status = 'refunded';
		recordEscrowHistory({
			contractId: this.contractId,
			title: this.contractTitle ?? this.contractId,
			kind: 'refund',
			proof: proof.value
		});
		await this.attest('refunded');
		return this.snapshot;
	}

	private async paySettlement(invoice: string): Promise<EscrowProof> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized');
		const asset = this.split.primaryAsset;
		if (asset === 'btc_lightning') return payLnBtc(wallet, invoice, this.lockedSats());
		if (asset === 'usdt_ln') {
			const amount = this.settlementAmount || this.agreedUnits();
			if (isEscrowBolt11(invoice)) return payLnUsdtBolt11(wallet, invoice, amount);
			const channels = typeof wallet.listChannels === 'function' ? await wallet.listChannels() : [];
			return payLnUsdt(channels, invoice, amount);
		}
		return enqueueSend(async () => {
			const listed =
				typeof wallet.listAssets === 'function' ? await wallet.listAssets() : undefined;
			const held = selectEscrowAsset(spendableRgbAssets(listed), [
				e2eMintedAssetId(),
				getConfiguredRgbUsdtAssetId()
			]);
			const assetId = onchainUsdtId(held === ESCROW_LNUSDT ? undefined : held);
			const amount = this.settlementAmount || this.agreedUnits();
			return payOnchainUsdt(wallet, invoice, assetId, amount);
		});
	}

	private agreedUnits(): number {
		if (this.lockedCurrency === 'SATS' && this.lockedAmount > 0) return this.lockedAmount;
		return Math.max(1, Math.round(this.totalAmountUsd * 1_000_000));
	}

	private lockedSats(): number {
		if (this.lockedCurrency === 'SATS' && this.lockedAmount > 0) return this.lockedAmount;
		if (this.amountSats && this.amountSats > 0) return this.amountSats;
		throw new Error('Lightning invoice amount does not match the locked sats');
	}

	async cancel(): Promise<ContractRuneSnapshot> {
		const open = [
			'draft',
			'funding',
			'locking',
			'locked',
			'work_in_progress',
			'work_submitted',
			'approved',
			'settlement_requested'
		];
		if (!open.includes(this.status)) {
			throw new Error(`Cannot cancel contract from ${this.status} state`);
		}
		this.status = 'cancelled';
		this.error = null;
		recordEscrowHistory({
			contractId: this.contractId,
			title: this.contractTitle ?? this.contractId,
			kind: 'cancelled'
		});
		await this.attest('cancelled');
		return this.snapshot;
	}

	async dispute(reason: string): Promise<ContractRuneSnapshot> {
		if (!reason.trim()) throw new Error('A dispute reason is required');
		if (this.status !== 'funded') {
			throw new Error(`Cannot dispute contract from ${this.status} state`);
		}
		this.status = 'disputed';
		this.error = null;
		await this.attest('disputed', reason);
		return this.snapshot;
	}

	async applyIncomingConsignment(
		message: ConsignmentExchangeMessage
	): Promise<ContractRuneSnapshot> {
		if (message.contractId !== this.contractId) {
			throw new Error('Consignment contract does not match this rune');
		}
		if (!message.consignment && !message.transferId) {
			throw new Error('Consignment proof or transfer id is required');
		}
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized');
		const queue = await getBrowserRgbCommandQueue(wallet);
		if (message.consignment) {
			const validation = await queue.validateConsignment({
				consignment: message.consignment,
				expectedContractId: message.assetId as RgbSeal['contractId']
			});
			if (!validation.ok || !validation.value?.valid) {
				throw new Error(validation.value?.reason ?? validation.error ?? 'Invalid RGB consignment');
			}
		}
		if (!message.transferId) return this.snapshot;
		const result = await queue.witness({
			recipientId: message.transferId as SealId,
			contractId: this.contractId as RgbSeal['contractId'],
			assetId: message.assetId
		});
		if (!result.ok || !result.value) {
			throw new Error(result.error ?? 'Incoming RGB transfer is not confirmed');
		}
		this.seals = [...this.seals, result.value];
		this.status = 'funded';
		this.error = null;
		return this.snapshot;
	}

	/** Publish first. The shared history is the only status the other party can see. */
	private async commitStatus(
		status: ContractRuneStatus,
		reason?: string,
		proofUrl?: string
	): Promise<void> {
		const previous = this.status;
		this.status = status;
		try {
			await this.attest(status, reason, proofUrl);
			this.error = null;
		} catch (error) {
			this.status = previous;
			throw error;
		}
	}

	private async attest(
		status: ContractRuneStatus,
		reason?: string,
		proofUrl?: string
	): Promise<void> {
		const event = await publishAttestation(
			this.contractId,
			status,
			this.seals,
			this.partyPubkeys,
			this.snapshot,
			reason,
			proofUrl
		);
		this.lastAttestationId = event.id;
		if (reason) this.error = reason;
	}

	private async runTransition<T>(
		pendingStatus: ContractRuneStatus,
		operation: () => Promise<T>
	): Promise<T> {
		if (this.isBusy) throw new Error('Contract transition already in progress');
		this.isBusy = true;
		this.error = null;
		this.status = pendingStatus;
		try {
			return await operation();
		} catch (error) {
			this.status = 'failed';
			if (pendingStatus === 'funding') this.fundingState = 'failed';
			this.error = error instanceof Error ? error.message : String(error);
			const wallet = state.utexoWallet;
			if (wallet) {
				try {
					await wallet.refreshWallet();
				} catch {
					// SDK mutex may still be held; the form retries after this.
				}
			}
			throw error;
		} finally {
			this.isBusy = false;
		}
	}
}
