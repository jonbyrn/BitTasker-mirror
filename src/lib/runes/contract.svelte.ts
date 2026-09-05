import type { NostrEvent } from 'nostr-tools';
import { SvelteMap } from 'svelte/reactivity';
import { state } from '$lib/stores/wallet/wallet-state';
import { getBrowserRgbCommandQueue } from '$lib/services/rgb/command-queue';
import type { RgbSeal, SealId } from '$lib/services/rgb/types';
import type { ContractPaymentAsset, PaymentSplitConfig } from '$lib/types/rgb-contract';
import type { ConsignmentExchangeMessage } from '$lib/services/rgb/consignment-exchange';
import { getSignedEvent, publishToMultipleRelays } from '$lib/utils/nostr';
import KINDS from '$lib/utils/constants/kinds';

export type ContractRuneStatus =
	| 'draft'
	| 'funding'
	| 'funded'
	| 'releasing'
	| 'released'
	| 'disputed'
	| 'failed';

export interface ContractRuneInput {
	contractId: string;
	totalAmountUsd: number;
	split: PaymentSplitConfig;
	partyPubkeys?: string[];
}

export interface ContractRuneSnapshot {
	contractId: string;
	status: ContractRuneStatus;
	seals: readonly RgbSeal[];
	split: PaymentSplitConfig;
	lastAttestationId?: string;
	error?: string;
}

const RELAYS = (import.meta.env.VITE_NOSTR_RELAY_URL ?? '')
	.split(',')
	.map((relay: string) => relay.trim())
	.filter(Boolean)
	.map((relay: string) =>
		relay.startsWith('ws://') || relay.startsWith('wss://') ? relay : `wss://${relay}`
	);

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
	asset: ContractPaymentAsset
): number {
	const amountUsd = totalAmountUsd * (percentage / 100);
	if (asset === 'usdt_rgb') return Math.round(amountUsd * 1_000_000);
	return Math.round(amountUsd * 100_000_000);
}

async function publishAttestation(
	contractId: string,
	status: ContractRuneStatus,
	seals: readonly RgbSeal[],
	partyPubkeys: readonly string[]
): Promise<NostrEvent> {
	const event = await getSignedEvent({
		kind: KINDS.CONTRACT_STATUS,
		content: JSON.stringify({
			type: 'contract-status',
			contractId,
			status,
			seals: seals.map((seal) => ({ id: seal.id, assetId: seal.assetId, amount: seal.amount }))
		}),
		tags: [
			['m', 'contract-status'],
			['r', contractId],
			['s', status],
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
	readonly totalAmountUsd: number;
	readonly split: PaymentSplitConfig;
	readonly partyPubkeys: readonly string[];

	status = $state<ContractRuneStatus>('draft');
	seals = $state<RgbSeal[]>([]);
	isBusy = $state(false);
	error = $state<string | null>(null);
	lastAttestationId = $state<string | null>(null);

	constructor(input: ContractRuneInput) {
		if (!input.contractId.trim()) throw new Error('Contract id is required');
		if (!Number.isFinite(input.totalAmountUsd) || input.totalAmountUsd <= 0) {
			throw new Error('Contract amount must be positive');
		}
		validateSplit(input.split);
		this.contractId = input.contractId;
		this.totalAmountUsd = input.totalAmountUsd;
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
			status: this.status,
			seals: this.seals,
			split: this.split,
			lastAttestationId: this.lastAttestationId ?? undefined,
			error: this.error ?? undefined
		};
	}

	async fund(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'draft' && this.status !== 'failed') {
			throw new Error(`Cannot fund contract from ${this.status} state`);
		}
		return this.runTransition('funding', async () => {
			const wallet = state.utexoWallet;
			if (!wallet) throw new Error('RGB wallet is not initialized');
			const queue = await getBrowserRgbCommandQueue(wallet);
			const splitEntries = [
				{ asset: this.split.primaryAsset, percentage: this.split.primaryPercentage },
				{ asset: this.split.secondaryAsset, percentage: this.split.secondaryPercentage }
			].filter((entry) => entry.percentage > 0);
			const fundedSeals: RgbSeal[] = [];
			for (const entry of splitEntries) {
				const result = await queue.commit({
					contractId: this.contractId as RgbSeal['contractId'],
					assetId: entry.asset,
					amount: assetAmount(this.totalAmountUsd, entry.percentage, entry.asset)
				});
				if (!result.ok || !result.value) throw new Error(result.error ?? 'Escrow funding failed');
				fundedSeals.push(result.value);
			}
			this.seals = fundedSeals;
			this.status = 'funded';
			await this.attest('funded');
			return this.snapshot;
		});
	}

	async release(): Promise<ContractRuneSnapshot> {
		if (this.status !== 'funded')
			throw new Error(`Cannot release contract from ${this.status} state`);
		return this.runTransition('releasing', async () => {
			const wallet = state.utexoWallet;
			if (!wallet) throw new Error('RGB wallet is not initialized');
			const queue = await getBrowserRgbCommandQueue(wallet);
			for (const seal of this.seals) {
				const result = await queue.spend({
					recipientId: seal.id as SealId,
					contractId: this.contractId as RgbSeal['contractId'],
					assetId: seal.assetId
				});
				if (!result.ok) throw new Error(result.error ?? 'Escrow release failed');
			}
			this.status = 'released';
			await this.attest('released');
			return this.snapshot;
		});
	}

	async dispute(reason: string): Promise<ContractRuneSnapshot> {
		if (!reason.trim()) throw new Error('A dispute reason is required');
		if (this.status !== 'funded')
			throw new Error(`Cannot dispute contract from ${this.status} state`);
		this.status = 'disputed';
		this.error = null;
		await this.attest('disputed', reason);
		return this.snapshot;
	}

	/**
	 * Applies an incoming RGB proof only after the serialized queue confirms the
	 * matching transfer. A message without a transfer id is retained as a
	 * transport-level notification but cannot change balances.
	 */
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

	private async attest(status: ContractRuneStatus, reason?: string): Promise<void> {
		const event = await publishAttestation(this.contractId, status, this.seals, this.partyPubkeys);
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
			this.error = error instanceof Error ? error.message : String(error);
			throw error;
		} finally {
			this.isBusy = false;
		}
	}
}
