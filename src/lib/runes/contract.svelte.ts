import type { NostrEvent } from 'nostr-tools';
import { SvelteMap } from 'svelte/reactivity';
import { state } from '$lib/stores/wallet/wallet-state';
import { prepareRgbOnchainSend } from '$lib/stores/wallet/prepare-rgb-send';
import { getBrowserRgbCommandQueue } from '$lib/services/rgb/command-queue';
import type { RgbSeal, SealId } from '$lib/services/rgb/types';
import {
	type ContractPaymentAsset,
	type PaymentSplitConfig,
	getConfiguredRgbUsdtAssetId
} from '$lib/types/rgb-contract';
import type { ConsignmentExchangeMessage } from '$lib/services/rgb/consignment-exchange';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';

export type ContractRuneStatus =
	| 'draft'
	| 'funding'
	| 'funded'
	| 'work_in_progress'
	| 'work_submitted'
	| 'approved'
	| 'releasing'
	| 'released'
	| 'settled'
	| 'cancelling'
	| 'cancelled'
	| 'disputed'
	| 'failed';

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
	split: PaymentSplitConfig;
	partyPubkeys?: string[];
}

export interface ContractRuneSnapshot {
	contractId: string;
	contractTitle?: string;
	bidderComments?: string;
	totalAmountUsd: number;
	status: ContractRuneStatus;
	fundingState: ContractFundingState;
	fundingInvoice?: string;
	workMessage?: string;
	proofUrl?: string;
	payoutInvoice?: string;
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
	if (asset === 'usdt_rgb') return Math.round(amountUsd * 1_000_000);
	if (amountSats && amountSats > 0) {
		return Math.max(1, Math.round(amountSats * (percentage / 100)));
	}
	return Math.max(1, Math.round(amountUsd * 100));
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

const E2E_CONFIRM_MS = 5 * 60_000;
const LIVE_CONFIRM_MS = 10 * 60_000;

async function pollUntil<T>(
	work: () => Promise<T>,
	timeoutMs: number,
	intervalMs: number
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let lastError = new Error('Timed out');
	while (Date.now() < deadline) {
		try {
			return await work();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			await sleep(intervalMs);
		}
	}
	throw lastError;
}

function isE2ERun(): boolean {
	return import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
}

function e2eMintedAssetId(): string | undefined {
	if (typeof window === 'undefined') return undefined;
	const minted = (window as Window & { __E2E_MINTED_ASSET_ID?: string }).__E2E_MINTED_ASSET_ID;
	return minted || undefined;
}

function readTaskeeInvoice(): string | undefined {
	if (typeof window === 'undefined') return undefined;
	const invoice = (
		window as Window & { __E2E_TASKEE_INVOICE?: string }
	).__E2E_TASKEE_INVOICE?.trim();
	if (!invoice || (!invoice.startsWith('rgb:') && !invoice.startsWith('rgb1'))) return undefined;
	return invoice;
}

function escrowAssetId(
	nia: ReadonlyArray<{ ticker?: string; assetId?: string }>
): string | undefined {
	return (
		e2eMintedAssetId() ||
		import.meta.env.VITE_RGB_ESCROW_ASSET_ID ||
		nia.find((asset) => asset.ticker === 'USDT')?.assetId ||
		nia[0]?.assetId
	);
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
			payoutInvoice: snapshot.payoutInvoice
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
			status: this.status,
			fundingState: this.fundingState,
			fundingInvoice: this.seals.find((seal) => seal.invoice)?.invoice,
			workMessage: this.workMessage,
			proofUrl: this.proofUrl,
			payoutInvoice: this.payoutInvoice,
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

	async prepareFunding(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'draft' && this.status !== 'failed') {
			throw new Error(`Cannot fund contract from ${this.status} state`);
		}
		return this.runTransition('funding', async () => {
			this.fundingState = 'checking_wallet';
			const wallet = state.utexoWallet;
			if (!wallet) throw new Error('RGB wallet is not initialized');
			const queue = await getBrowserRgbCommandQueue(wallet);
			this.fundingState = 'creating_request';
			const taskeeInvoice = readTaskeeInvoice();
			const canBlankReceive =
				typeof wallet.onchainReceive === 'function' && typeof wallet.listAssets === 'function';
			if (taskeeInvoice || canBlankReceive) {
				const { nia } = await wallet.listAssets();
				const assetId = escrowAssetId(nia ?? []);
				const spendable = nia?.find((row) => row.assetId === assetId)?.balance?.spendable ?? 0;
				if (!assetId || spendable <= 0) {
					throw new Error('No spendable RGB balance to fund escrow');
				}
				let invoice = taskeeInvoice;
				let recipientId = `funding-${this.contractId}`;
				if (!invoice) {
					const received = await wallet.onchainReceive({
						witness: false,
						minConfirmations: 1,
						durationSeconds: 3600
					});
					invoice = received.invoice;
					if (received.recipientId) recipientId = received.recipientId;
				}
				if (!invoice) throw new Error('Funding invoice is not available');
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
						amount: spendable,
						createdAt: now,
						updatedAt: now
					}
				];
				this.fundingState = 'awaiting_payment';
				await this.attest('funding', 'Funding request created');
				return this.snapshot;
			}
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
					const { nia } = await wallet.listAssets();
					const spendable = nia?.find((row) => row.assetId === minted)?.balance?.spendable;
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
		await this.sendToInvoice(invoice);
		this.status = 'funded';
		this.fundingState = 'funded';
		this.error = null;
		await this.attest('funded');
		this.error = null;
	}

	// Model B: full RGB payout. releaseEscrow attests released and does not send.
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
		if (this.status !== 'funded') {
			throw new Error(`Cannot start contract from ${this.status} state`);
		}
		this.status = 'work_in_progress';
		await this.attest('work_in_progress');
		return this.snapshot;
	}

	async submitWork(message: string, proofUrl?: string): Promise<ContractRuneSnapshot> {
		if (this.status !== 'funded' && this.status !== 'work_in_progress') {
			throw new Error(`Cannot submit work from ${this.status} state`);
		}
		const deliverable = message.trim();
		if (!deliverable && !proofUrl?.trim()) {
			throw new Error('Deliverable proof is required');
		}
		this.workMessage = deliverable || undefined;
		this.proofUrl = proofUrl?.trim() || undefined;
		this.status = 'work_submitted';
		this.error = null;
		await this.attest('work_submitted', this.workMessage, this.proofUrl);
		this.error = null;
		return this.snapshot;
	}

	async approveWork(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'work_submitted') {
			throw new Error(`Cannot approve work from ${this.status} state`);
		}
		this.status = 'approved';
		this.error = null;
		await this.attest('approved', 'Work approved');
		this.error = null;
		return this.snapshot;
	}

	async createPayoutInvoice(): Promise<string> {
		if (this.status !== 'approved') {
			throw new Error(`Cannot create a payout invoice from ${this.status} state`);
		}
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized');
		const received = await wallet.onchainReceive({
			witness: false,
			minConfirmations: 1,
			durationSeconds: 3600
		});
		const invoice = received.invoice?.trim() ?? '';
		if (!invoice) throw new Error('Taskee payout invoice was empty');
		this.payoutInvoice = invoice;
		await this.attest('approved', 'Payout invoice created');
		this.error = null;
		return invoice;
	}

	// Model B: fund already sent the asset. Release attests released and does not send.
	async releaseEscrow(invoice?: string): Promise<ContractRuneSnapshot> {
		if (this.status !== 'work_submitted' && this.status !== 'approved') {
			throw new Error(`Cannot release escrow from ${this.status} state`);
		}
		const payout = (invoice ?? this.payoutInvoice)?.trim() ?? '';
		if (payout && !payout.startsWith('rgb:') && !payout.startsWith('rgb1')) {
			throw new Error('Payout destination must be an rgb: invoice.');
		}
		if (payout) this.payoutInvoice = payout;
		this.status = 'released';
		this.error = null;
		console.info('[contract-rune] releaseEscrow', { attested: 'released' });
		await this.attest('released', 'Escrow released');
		this.error = null;
		return this.snapshot;
	}

	private async sendToInvoice(invoice: string): Promise<void> {
		const normalizedInvoice = invoice.trim();
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized');

		// Enforce RGB invoices only
		if (!normalizedInvoice.startsWith('rgb1') && !normalizedInvoice.startsWith('rgb:')) {
			throw new Error('Funding destination must be an rgb: invoice for RGB-native escrow.');
		}

		const { nia } = await wallet.listAssets();
		const mintedAssetId =
			typeof window !== 'undefined'
				? (window as Window & { __E2E_MINTED_ASSET_ID?: string }).__E2E_MINTED_ASSET_ID
				: undefined;
		const expectedAssetId =
			mintedAssetId ||
			import.meta.env.VITE_RGB_ESCROW_ASSET_ID ||
			nia.find((a: { ticker?: string; assetId?: string }) => a.ticker === 'USDT')?.assetId ||
			nia[0]?.assetId;

		if (!expectedAssetId) {
			throw new Error('Tasker wallet has no escrow RGB asset. Fund the wallet with RGB tokens.');
		}

		const asset = nia.find((row) => row.assetId === expectedAssetId);
		if (!asset) {
			throw new Error(`Escrow asset ${expectedAssetId} not found in wallet.`);
		}

		const spendable = asset.balance?.spendable ?? 0;
		if (spendable <= 0) {
			throw new Error('No spendable RGB balance to fund escrow');
		}
		const baseUnits = spendable;

		console.info('[contract-rune] sendToInvoice', {
			assetId: expectedAssetId,
			amount: baseUnits,
			invoicePrefix: normalizedInvoice.slice(0, 40)
		});
		try {
			await prepareRgbOnchainSend(wallet, expectedAssetId);
			const sent = await wallet.onchainSend({
				invoice: normalizedInvoice,
				assetId: expectedAssetId,
				amount: baseUnits,
				feeRate: 2,
				minConfirmations: 1
			});
			console.info('[contract-rune] sendToInvoice completed', {
				assetId: expectedAssetId,
				amount: baseUnits,
				tx: sent.txid ? `https://esplora-api.utexo.com/tx/${sent.txid}` : ''
			});
			await wallet.refreshWallet();
		} catch (error) {
			console.error('[E2E-wallet-payment-failure]', {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			throw error;
		}
	}

	async release(invoice: string): Promise<ContractRuneSnapshot> {
		if (this.status !== 'funded' && this.status !== 'work_submitted') {
			throw new Error(`Cannot release contract from ${this.status} state`);
		}
		return this.runTransition('releasing', async () => {
			await this.sendToInvoice(invoice);
			this.status = 'released';
			await this.attest('released');
			return this.snapshot;
		});
	}

	async releaseRgbEscrow(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'work_submitted') {
			throw new Error(`Cannot release contract from ${this.status} state`);
		}
		return this.runTransition('releasing', async () => {
			const wallet = state.utexoWallet;
			if (!wallet) throw new Error('RGB wallet is not initialized');
			const queue = await getBrowserRgbCommandQueue(wallet);
			const timeoutMs = isE2ERun() ? E2E_CONFIRM_MS : LIVE_CONFIRM_MS;
			for (const seal of this.seals) {
				await pollUntil(
					async () => {
						const result = await queue.spend({
							recipientId: seal.id as SealId,
							contractId: this.contractId as RgbSeal['contractId'],
							assetId: seal.assetId
						});
						if (!result.ok) throw new Error(result.error ?? 'RGB escrow release failed');
						return result;
					},
					timeoutMs,
					10_000
				);
			}
			this.status = 'released';
			await this.attest('released', 'Funds released');
			return this.snapshot;
		});
	}

	async cancel(invoice: string): Promise<ContractRuneSnapshot> {
		if (this.status !== 'funded') {
			throw new Error(`Cannot cancel contract from ${this.status} state`);
		}
		return this.runTransition('cancelling', async () => {
			await this.sendToInvoice(invoice);
			this.status = 'cancelled';
			await this.attest('cancelled');
			return this.snapshot;
		});
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
