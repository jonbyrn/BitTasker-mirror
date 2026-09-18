<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ContractRune,
		type ContractRuneSnapshot,
		type ContractRuneStatus
	} from '$lib/runes/contract.svelte';
	import { CONTRACT_PAYMENT_ASSETS, type PaymentSplitConfig } from '$lib/types/rgb-contract';
	import type { RgbSeal } from '$lib/services/rgb/types';
	import { getTaskRelay, ndk, setNDKSigner } from '$lib/nostr/ndk';
	import KINDS from '$lib/utils/constants/kinds';
	import { initWasm } from '$lib/wasm/init-wasm';

	const BTC_SETTLEMENT: PaymentSplitConfig = {
		primaryAsset: 'btc_onchain',
		primaryPercentage: 100,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 0
	};

	type ContractDetailRole = 'tasker' | 'taskee';
	type ContractStatusContent = Partial<ContractRuneSnapshot> & {
		type?: string;
		message?: string;
		proofUrl?: string;
		seals?: Partial<RgbSeal>[];
	};
	type TimelineEntry = {
		id: string;
		status: string;
		message: string;
		createdAt: number;
		proofUrl?: string;
	};

	let { contractId, role }: { contractId: string; role: ContractDetailRole } = $props();

	let loading = $state(true);
	let errorMessage = $state('');
	let rune = $state<ContractRune | null>(null);
	let timeline = $state<TimelineEntry[]>([]);
	let workMessage = $state('Work completed and ready for review.');
	let proofUrl = $state('');
	let isSubmitting = $state(false);
	let isReleasing = $state(false);

	const snapshot = $derived(rune?.snapshot ?? null);
	const settlementUnit = $derived(
		snapshot ? CONTRACT_PAYMENT_ASSETS[snapshot.split.primaryAsset] : 'Bitcoin'
	);
	const canSubmitDeliverable = $derived(
		role === 'taskee' &&
			(snapshot?.status === 'funded' || snapshot?.status === 'work_in_progress') &&
			!isSubmitting
	);
	const canRelease = $derived(
		role === 'tasker' && snapshot?.status === 'work_submitted' && !isReleasing
	);

	function parseStatusContent(content: string): ContractStatusContent | null {
		try {
			const parsed = JSON.parse(content) as ContractStatusContent;
			return parsed && typeof parsed === 'object' ? parsed : null;
		} catch {
			return null;
		}
	}

	function normalizeSplit(value: unknown): PaymentSplitConfig {
		if (!value || typeof value !== 'object') return BTC_SETTLEMENT;
		const split = value as Partial<PaymentSplitConfig>;
		if (
			split.primaryAsset &&
			typeof split.primaryPercentage === 'number' &&
			split.secondaryAsset &&
			typeof split.secondaryPercentage === 'number'
		) {
			return split as PaymentSplitConfig;
		}
		return BTC_SETTLEMENT;
	}

	function normalizeSeals(content: ContractStatusContent, nextContractId: string): RgbSeal[] {
		return (content.seals ?? []).map((seal, index) => ({
			id: (seal.id ?? `seal-${nextContractId}-${index}`) as RgbSeal['id'],
			contractId: nextContractId as RgbSeal['contractId'],
			contractTitle: seal.contractTitle ?? content.contractTitle,
			bidderComments: seal.bidderComments ?? content.bidderComments,
			state: seal.state ?? 'INITIATED',
			utxo: seal.utxo,
			assetId: seal.assetId ?? 'btc_onchain',
			amount: seal.amount ?? 0,
			createdAt: seal.createdAt ?? Date.now(),
			updatedAt: seal.updatedAt ?? Date.now()
		}));
	}

	function openProof(href: string): void {
		window.open(href, '_blank', 'noopener,noreferrer');
	}

	async function loadContract(): Promise<void> {
		loading = true;
		errorMessage = '';
		try {
			await setNDKSigner();
			const events = await ndk.fetchEvents(
				{ kinds: [KINDS.CONTRACT_STATUS], '#r': [contractId], limit: 100 },
				{ closeOnEose: true },
				getTaskRelay()
			);
			const ordered = [...events].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
			const parsedEntries = ordered
				.map((event) => ({ event, content: parseStatusContent(event.content) }))
				.filter(
					(entry): entry is { event: (typeof ordered)[number]; content: ContractStatusContent } =>
						Boolean(entry.content)
				);
			const latest = parsedEntries.at(-1);
			if (!latest) {
				errorMessage = 'Contract status has not propagated yet.';
				return;
			}

			const content = latest.content;
			const split = normalizeSplit(content.split);
			const nextRune =
				ContractRune.get(contractId) ??
				new ContractRune({
					contractId,
					contractTitle: content.contractTitle,
					bidderComments: content.bidderComments,
					totalAmountUsd: content.totalAmountUsd ?? 1,
					split,
					partyPubkeys: latest.event.tags
						.filter((tag) => tag[0] === 'p')
						.map((tag) => tag[1])
						.filter(Boolean)
				});
			nextRune.status = (content.status ??
				latest.event.tags.find((tag) => tag[0] === 's')?.[1] ??
				'funded') as ContractRuneStatus;
			nextRune.seals = normalizeSeals(content, contractId);
			rune = nextRune;
			timeline = parsedEntries.map(({ event, content: item }) => ({
				id: event.id ?? `${event.created_at}-${item.status}`,
				status: String(item.status ?? event.tags.find((tag) => tag[0] === 's')?.[1] ?? 'unknown'),
				message: item.message ?? '',
				createdAt: (event.created_at ?? 0) * 1000,
				proofUrl: item.proofUrl
			}));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load contract.';
		} finally {
			loading = false;
		}
	}

	async function handleSubmitDeliverable(): Promise<void> {
		if (!rune) return;
		isSubmitting = true;
		errorMessage = '';
		try {
			await rune.submitWork(workMessage, proofUrl.trim() || undefined);
			await loadContract();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to submit deliverable.';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleRelease(): Promise<void> {
		if (!rune) return;
		isReleasing = true;
		errorMessage = '';
		try {
			await initWasm();
			await rune.releaseRgbEscrow();
			await loadContract();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to release funds.';
		} finally {
			isReleasing = false;
		}
	}

	onMount(() => {
		void initWasm()
			.catch((error) => {
				console.warn('[contract] initWasm failed:', error);
			})
			.finally(() => {
				void loadContract();
			});
	});
</script>

<div class="mx-auto max-w-4xl space-y-4 p-4" data-testid="contract-detail-view">
	<div class="rounded-box bg-base-100 border-base-300 border p-5 shadow-sm">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0">
				<p class="text-base-content/60 text-sm">RGB Contract</p>
				<h1 class="text-2xl font-bold" data-testid="contract-title">
					{snapshot?.contractTitle ?? contractId}
				</h1>
				<p class="text-base-content/70 mt-1 text-sm break-all">{contractId}</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<span class="badge badge-primary badge-lg" data-testid="contract-settlement-unit"
					>{settlementUnit}</span
				>
				<span class="badge badge-outline badge-lg" data-testid="contract-status"
					>{snapshot?.status ?? 'loading'}</span
				>
			</div>
		</div>
	</div>

	{#if loading}
		<div class="rounded-box bg-base-100 border-base-300 border p-6 text-center" role="status">
			<span class="loading loading-spinner loading-md"></span>
		</div>
	{:else if errorMessage}
		<div class="alert alert-error" data-testid="contract-error">{errorMessage}</div>
	{:else if snapshot}
		<div class="rounded-box bg-base-100 border-base-300 border p-5 shadow-sm">
			<h2 class="font-semibold">Bid details</h2>
			<p
				class="text-base-content/70 mt-2 whitespace-pre-line"
				data-testid="contract-bidder-comments"
			>
				{snapshot.bidderComments || 'No bidder comments provided.'}
			</p>
		</div>

		<div class="rounded-box bg-base-100 border-base-300 border p-5 shadow-sm">
			<h2 class="font-semibold">Status timeline</h2>
			<div class="mt-3 space-y-3" data-testid="contract-status-timeline">
				{#each timeline as entry (entry.id)}
					<div class="border-base-200 border-l-2 pl-3">
						<div class="font-medium">{entry.status}</div>
						{#if entry.message}
							<div class="text-base-content/70 text-sm">{entry.message}</div>
						{/if}
						{#if entry.proofUrl}
							<button
								class="link link-primary text-sm"
								type="button"
								onclick={() => openProof(entry.proofUrl ?? '')}>Proof</button
							>
						{/if}
						<div class="text-base-content/50 text-xs">
							{new Date(entry.createdAt).toLocaleString()}
						</div>
					</div>
				{/each}
			</div>
		</div>

		{#if canSubmitDeliverable}
			<div
				class="rounded-box bg-base-100 border-base-300 border p-5 shadow-sm"
				data-testid="submit-deliverable-panel"
			>
				<h2 class="font-semibold">Submit Deliverable</h2>
				<textarea
					class="textarea textarea-bordered mt-3 w-full"
					bind:value={workMessage}
					data-testid="deliverable-message-input"
				></textarea>
				<input
					class="input input-bordered mt-3 w-full"
					bind:value={proofUrl}
					placeholder="Proof URL"
					data-testid="deliverable-proof-url-input"
				/>
				<button
					class="btn btn-primary mt-3"
					onclick={handleSubmitDeliverable}
					disabled={isSubmitting}
					data-testid="submit-deliverable-button"
				>
					{#if isSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
					Submit Deliverable
				</button>
			</div>
		{/if}

		{#if canRelease}
			<div
				class="rounded-box bg-base-100 border-base-300 border p-5 shadow-sm"
				data-testid="release-funds-panel"
			>
				<h2 class="font-semibold">Approve & Release Funds</h2>
				<p class="text-base-content/70 mt-2 text-sm">
					Review the Taskee deliverable, then release the RGB escrow.
				</p>
				<button
					class="btn btn-success mt-3"
					onclick={handleRelease}
					disabled={isReleasing}
					data-testid="approve-release-funds-button"
				>
					{#if isReleasing}<span class="loading loading-spinner loading-xs"></span>{/if}
					Approve & Release Funds
				</button>
			</div>
		{/if}
	{/if}
</div>
