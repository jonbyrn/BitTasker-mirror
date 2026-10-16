<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		ContractRune,
		leadingContractStatus,
		type ContractRuneSnapshot,
		type ContractRuneStatus
	} from '$lib/runes/contract.svelte';
	import { CONTRACT_PAYMENT_ASSETS, type PaymentSplitConfig } from '$lib/types/rgb-contract';
	import type { RgbSeal } from '$lib/services/rgb/types';
	import { getTaskRelay, ndk, setNDKSigner } from '$lib/nostr/ndk';
	import { subscribeContract } from '$lib/services/contracts/contract-sync';
	import KINDS from '$lib/utils/constants/kinds';
	import { initWasm } from '$lib/wasm/init-wasm';
	import { t } from 'svelte-i18n';
	import { formatInteger, formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';

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
		workMessage?: string;
		payoutInvoice?: string;
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
	let reviewingPay = $state(false);
	let refundInvoice = $state('');
	let stopSubscription: (() => void) | undefined;

	const snapshot = $derived(rune?.snapshot ?? null);
	const FUNDED_STATUSES = new Set([
		'locked',
		'funded',
		'work_in_progress',
		'work_submitted',
		'approved',
		'settlement_requested',
		'releasing',
		'released',
		'settled'
	]);
	const contractIsFunded = $derived(snapshot ? FUNDED_STATUSES.has(snapshot.status) : false);
	const lockedAmountLabel = $derived.by(() => {
		if (!snapshot) return '';
		if (snapshot.lockedCurrency === 'SATS') {
			return `${formatInteger(snapshot.lockedAmount)} sats`;
		}
		return `$${formatNumberWithTwoDecimals(snapshot.lockedAmount)}`;
	});
	const settlementUnit = $derived(
		snapshot ? CONTRACT_PAYMENT_ASSETS[snapshot.split.primaryAsset] : 'Bitcoin'
	);
	const canSubmitDeliverable = $derived(
		role === 'taskee' &&
			(snapshot?.status === 'locked' ||
				snapshot?.status === 'funded' ||
				snapshot?.status === 'work_in_progress') &&
			!isSubmitting
	);
	const canApprove = $derived(
		role === 'tasker' && snapshot?.status === 'work_submitted' && !isReleasing
	);
	const canRequestPayment = $derived(
		role === 'taskee' && snapshot?.status === 'approved' && !isReleasing
	);
	const canRelease = $derived(
		role === 'tasker' && snapshot?.status === 'settlement_requested' && !isReleasing
	);
	const canCancel = $derived(
		snapshot != null &&
			[
				'draft',
				'funding',
				'locking',
				'locked',
				'work_in_progress',
				'work_submitted',
				'approved',
				'settlement_requested'
			].includes(snapshot.status) &&
			!isReleasing
	);
	const canRefund = $derived(role === 'tasker' && snapshot?.status === 'released' && !isReleasing);
	const stepIndex = $derived.by(() => {
		const status = snapshot?.status;
		if (status === 'released' || status === 'released_pending' || status === 'settled') return 3;
		if (status === 'approved' || status === 'settlement_requested' || status === 'releasing')
			return 2;
		if (status === 'work_in_progress' || status === 'work_submitted') return 1;
		return 0;
	});
	const nextAction = $derived.by(() => {
		const status = snapshot?.status;
		if (status === 'released' || status === 'settled') return $t('bids.escrow_next_done');
		if (status === 'settlement_requested') return $t('bids.escrow_next_pay');
		if (status === 'approved') return $t('bids.escrow_next_request');
		if (status === 'work_submitted') return $t('bids.escrow_next_review');
		if (status === 'locked' || status === 'funded' || status === 'work_in_progress') {
			return $t('bids.escrow_next_work');
		}
		return $t('bids.contract_waiting');
	});
	const statusLabel = $derived(snapshot?.status ?? 'loading');
	const statusClass = $derived.by(() => {
		if (statusLabel === 'funded' || statusLabel === 'locked') return 'badge-warning';
		if (
			statusLabel === 'work_submitted' ||
			statusLabel === 'work_in_progress' ||
			statusLabel === 'approved'
		) {
			return 'badge-info';
		}
		if (statusLabel === 'released') return 'badge-success';
		return 'badge-outline';
	});
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

	async function loadContract(quiet = false): Promise<void> {
		if (!quiet) loading = true;
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
			if (parsedEntries.length === 0) {
				errorMessage = 'Contract status has not propagated yet.';
				return;
			}

			const entryStatus = (entry: (typeof parsedEntries)[number]): string =>
				entry.content.status ?? entry.event.tags.find((tag) => tag[0] === 's')?.[1] ?? 'funded';
			const leading = leadingContractStatus(parsedEntries.map(entryStatus));
			const latest =
				[...parsedEntries].reverse().find((entry) => entryStatus(entry) === leading) ??
				parsedEntries.at(-1);
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
					lockedAmount: content.lockedAmount ?? content.totalAmountUsd ?? 1,
					lockedCurrency: content.lockedCurrency ?? 'USD',
					split,
					partyPubkeys: latest.event.tags
						.filter((tag) => tag[0] === 'p')
						.map((tag) => tag[1])
						.filter(Boolean)
				});
			nextRune.status = (content.status ??
				latest.event.tags.find((tag) => tag[0] === 's')?.[1] ??
				'funded') as ContractRuneStatus;
			if (content.fundingState) nextRune.fundingState = content.fundingState;
			nextRune.seals = normalizeSeals(content, contractId);
			nextRune.workMessage = content.workMessage ?? content.message;
			nextRune.proofUrl = content.proofUrl;
			nextRune.payoutInvoice = content.payoutInvoice;
			nextRune.settlementInvoice = content.settlementInvoice ?? content.payoutInvoice;
			nextRune.settlementAmount = content.settlementAmount ?? 0;
			nextRune.proofs = content.proofs ?? [];
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

	async function handleApprove(): Promise<void> {
		if (!rune) return;
		isReleasing = true;
		errorMessage = '';
		try {
			await rune.approveWork();
			await loadContract();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to approve work.';
		} finally {
			isReleasing = false;
		}
	}

	async function handleRequestPayment(): Promise<void> {
		if (!rune) return;
		isReleasing = true;
		errorMessage = '';
		try {
			await walletManager.initialize();
			await rune.createPayoutInvoice();
			await loadContract(true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to request payment.';
		} finally {
			await walletManager.releaseRgbLock();
			isReleasing = false;
		}
	}

	async function handleCancel(): Promise<void> {
		if (!rune) return;
		isReleasing = true;
		errorMessage = '';
		try {
			await rune.cancel();
			await loadContract(true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to cancel the contract.';
		} finally {
			isReleasing = false;
		}
	}

	async function handleRefund(): Promise<void> {
		if (!rune) return;
		isReleasing = true;
		errorMessage = '';
		try {
			await walletManager.initialize();
			await rune.refund(refundInvoice);
			await loadContract(true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to refund the contract.';
		} finally {
			await walletManager.releaseRgbLock();
			isReleasing = false;
		}
	}

	function handleRelease(): void {
		reviewingPay = true;
	}

	async function confirmRelease(): Promise<void> {
		if (!rune) return;
		isReleasing = true;
		errorMessage = '';
		try {
			await initWasm();
			await rune.releaseEscrow();
			await loadContract();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to release funds.';
		} finally {
			isReleasing = false;
			reviewingPay = false;
		}
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		const e2e =
			(window as Window & { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true ||
			import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
		if (!e2e) return;
		const probe = window as Window & {
			__e2eContractSnapshot?: ContractRuneSnapshot | null;
			__e2eReleaseEscrow?: () => Promise<ContractRuneSnapshot>;
		};
		probe.__e2eContractSnapshot = snapshot;
		probe.__e2eReleaseEscrow = rune ? () => rune.releaseEscrow() : undefined;
	});

	onMount(() => {
		stopSubscription = subscribeContract(contractId, () => {
			void loadContract(true);
		});
		void initWasm()
			.catch((error) => {
				console.warn('[contract] initWasm failed:', error);
			})
			.finally(() => {
				void loadContract();
			});
	});

	onDestroy(() => {
		stopSubscription?.();
	});
</script>

<div
	class="mx-auto flex w-full max-w-md flex-col gap-4 p-3 sm:p-6"
	data-testid="contract-detail-view"
>
	<header class="card bg-base-100 border-base-300 border shadow-sm">
		<div class="card-body gap-3 p-5">
			<ul class="steps steps-horizontal w-full text-xs" data-testid="contract-steps">
				<li class="step" class:step-primary={stepIndex >= 0}>{$t('bids.escrow_step_agreed')}</li>
				<li class="step" class:step-primary={stepIndex >= 1}>{$t('bids.escrow_step_work')}</li>
				<li class="step" class:step-primary={stepIndex >= 2}>{$t('bids.escrow_step_approved')}</li>
				<li class="step" class:step-primary={stepIndex >= 3}>{$t('bids.escrow_step_paid')}</li>
			</ul>
			<div class="flex items-center justify-between gap-3">
				<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
					{role === 'tasker' ? 'Tasker' : 'Taskee'}
				</p>
				<span class="badge badge-lg {statusClass}" data-testid="contract-status">{statusLabel}</span
				>
			</div>
			<h1 class="text-2xl font-bold sm:text-3xl" data-testid="contract-title">
				{snapshot?.contractTitle ?? 'Contract'}
			</h1>
			<div class="flex flex-wrap items-center gap-2">
				<span class="badge badge-primary" data-testid="contract-settlement-unit"
					>{settlementUnit}</span
				>
			</div>
		</div>
	</header>

	{#if loading}
		<div class="card bg-base-100 border-base-300 border shadow-sm" role="status">
			<div class="card-body items-center p-6">
				<span class="loading loading-spinner loading-md text-primary"></span>
			</div>
		</div>
	{:else if errorMessage}
		<div class="alert alert-outline alert-error" data-testid="contract-error">{errorMessage}</div>
	{:else if snapshot}
		<section
			class="card bg-base-100 border-base-300 border shadow-sm"
			data-testid="contract-fund-panel"
		>
			<div class="card-body gap-1 p-5">
				<h2 class="text-base font-semibold">Payment</h2>
				<p class="text-base-content/60 text-sm">
					{contractIsFunded ? $t('bids.contract_funded_label') : $t('bids.contract_waiting')}
				</p>
				<p class="text-2xl font-bold" data-testid="contract-locked-amount">{lockedAmountLabel}</p>
				<p class="text-base-content/80 text-sm" data-testid="contract-next-action">{nextAction}</p>
			</div>
		</section>

		{#if canSubmitDeliverable}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="submit-deliverable-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">Deliverable</h2>
					<textarea
						class="textarea textarea-bordered w-full"
						bind:value={workMessage}
						data-testid="deliverable-message-input"
					></textarea>
					<input
						class="input input-bordered w-full"
						bind:value={proofUrl}
						placeholder="Proof URL"
						data-testid="deliverable-proof-url-input"
					/>
					<button
						class="btn btn-primary"
						onclick={handleSubmitDeliverable}
						disabled={isSubmitting}
						data-testid="submit-deliverable-button"
					>
						{#if isSubmitting}<span class="loading loading-spinner loading-xs"></span>{/if}
						Submit deliverable
					</button>
				</div>
			</section>
		{/if}

		{#if canApprove}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="approve-work-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">Review</h2>
					{#if snapshot.workMessage}
						<p class="text-sm whitespace-pre-line" data-testid="submitted-work-message">
							{snapshot.workMessage}
						</p>
					{/if}
					{#if snapshot.proofUrl}
						<button
							class="link link-primary text-sm"
							type="button"
							onclick={() => openProof(snapshot.proofUrl ?? '')}
						>
							Proof
						</button>
					{/if}
					<p class="text-base-content/70 text-sm">{$t('bids.escrow_next_review')}</p>
					<button
						class="btn btn-outline"
						onclick={handleApprove}
						disabled={isReleasing}
						data-testid="approve-work-button"
					>
						{#if isReleasing}<span class="loading loading-spinner loading-xs"></span>{/if}
						Approve work
					</button>
				</div>
			</section>
		{/if}

		{#if canRequestPayment}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="request-payment-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">{$t('bids.request_payment')}</h2>
					<p class="text-base-content/70 text-sm">{$t('bids.escrow_next_request')}</p>
					<button
						class="btn btn-primary w-full"
						onclick={handleRequestPayment}
						disabled={isReleasing}
						data-testid="request-payment-button"
					>
						{#if isReleasing}<span class="loading loading-spinner loading-xs"></span>{/if}
						{$t('bids.request_payment')}
					</button>
				</div>
			</section>
		{/if}

		{#if canRelease}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="release-funds-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">{$t('bids.pay_on_approval')}</h2>
					<p class="text-base-content/70 text-sm">{$t('bids.release_pays')}</p>
					{#if reviewingPay}
						<p class="text-sm" data-testid="escrow-pay-review">
							{lockedAmountLabel}
							{settlementUnit}
						</p>
						<button
							class="btn btn-success glow-soft w-full"
							onclick={confirmRelease}
							disabled={isReleasing}
							data-testid="approve-release-funds-button"
						>
							{#if isReleasing}<span class="loading loading-spinner loading-xs"></span>{/if}
							{$t('bids.confirm_pay')}
						</button>
					{:else}
						<button
							class="btn btn-primary w-full"
							onclick={handleRelease}
							disabled={isReleasing}
							data-testid="review-release-funds-button"
						>
							{$t('bids.pay_on_approval')}
						</button>
					{/if}
				</div>
			</section>
		{/if}

		{#if canRefund}
			<section class="card bg-base-100 border-base-300 border shadow-sm" data-testid="refund-panel">
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">{$t('bids.refund_contract')}</h2>
					<input
						class="input input-bordered w-full font-mono text-xs"
						bind:value={refundInvoice}
						data-testid="refund-invoice-input"
					/>
					<button
						class="btn btn-outline w-full"
						onclick={handleRefund}
						disabled={isReleasing || !refundInvoice.trim()}
						data-testid="refund-button"
					>
						{$t('bids.refund_contract')}
					</button>
				</div>
			</section>
		{/if}

		{#if canCancel}
			<button
				class="btn btn-ghost btn-sm"
				onclick={handleCancel}
				disabled={isReleasing}
				data-testid="cancel-contract-button"
			>
				{$t('bids.cancel_contract')}
			</button>
		{/if}

		<section class="card bg-base-200 border-base-300 border shadow-sm">
			<div class="card-body gap-2 p-5">
				<h2 class="text-base font-semibold">Bid</h2>
				<p
					class="text-base-content/80 text-sm whitespace-pre-line"
					data-testid="contract-bidder-comments"
				>
					{snapshot.bidderComments || 'No bidder comments provided.'}
				</p>
			</div>
		</section>

		<section class="card bg-base-100 border-base-300 border shadow-sm">
			<div class="card-body gap-3 p-5">
				<h2 class="text-base font-semibold">History</h2>
				<ol class="flex flex-col gap-3" data-testid="contract-status-timeline">
					{#each timeline as entry (entry.id)}
						<li class="border-base-300 border-l-2 pl-3">
							<div class="text-sm font-medium">{entry.status}</div>
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
						</li>
					{/each}
				</ol>
			</div>
		</section>

		<p class="text-base-content/40 px-1 font-mono text-xs break-all">{contractId}</p>
	{/if}
</div>
