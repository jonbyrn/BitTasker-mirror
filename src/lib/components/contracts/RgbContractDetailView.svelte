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
	import { t } from 'svelte-i18n';
	import { formatInteger, formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { appStore } from '$lib/stores/app.store';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import {
		acceptIncomingPayment,
		IncomingPaymentPending
	} from '$lib/stores/wallet/wallet-balances';

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
	let isAccepting = $state(false);
	let acceptError = $state('');

	const snapshot = $derived(rune?.snapshot ?? null);
	const FUNDED_STATUSES = new Set([
		'funded',
		'work_in_progress',
		'work_submitted',
		'approved',
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
			(snapshot?.status === 'funded' || snapshot?.status === 'work_in_progress') &&
			!isSubmitting
	);
	const canApprove = $derived(
		role === 'tasker' && snapshot?.status === 'work_submitted' && !isReleasing
	);
	const canRelease = $derived(
		role === 'tasker' &&
			(snapshot?.status === 'work_submitted' || snapshot?.status === 'approved') &&
			!isReleasing
	);
	const statusLabel = $derived(snapshot?.status ?? 'loading');
	const statusClass = $derived.by(() => {
		if (statusLabel === 'funded') return 'badge-warning';
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
	const fundIsPaid = $derived(
		statusLabel === 'funded' ||
			statusLabel === 'work_in_progress' ||
			statusLabel === 'work_submitted' ||
			statusLabel === 'approved' ||
			statusLabel === 'releasing' ||
			statusLabel === 'released'
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

	async function handleAcceptPayment(): Promise<void> {
		isAccepting = true;
		acceptError = '';
		try {
			await walletManager.initialize();
			await acceptIncomingPayment();
			appStore.showSuccessToast($t('bids.incoming_payment_accepted'));
		} catch (error) {
			acceptError =
				error instanceof IncomingPaymentPending
					? $t('bids.incoming_payment_waiting')
					: error instanceof Error
						? error.message
						: $t('bids.escrow_invoice_failed');
		} finally {
			await walletManager.releaseRgbLock();
			isAccepting = false;
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

	async function handleRelease(): Promise<void> {
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
		void initWasm()
			.catch((error) => {
				console.warn('[contract] initWasm failed:', error);
			})
			.finally(() => {
				void loadContract();
			});
	});
</script>

<div
	class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6"
	data-testid="contract-detail-view"
>
	<header class="card bg-base-100 border-base-300 border shadow-sm">
		<div class="card-body gap-3 p-5">
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
				<p class="text-base-content/80 text-sm">
					{fundIsPaid ? 'Paid on fund. Release confirms the work.' : 'Waiting for the fund send.'}
				</p>
				{#if role === 'taskee'}
					{#if acceptError}
						<div
							class="alert alert-outline alert-error mt-2 py-2 text-sm"
							data-testid="accept-payment-error"
						>
							{acceptError}
						</div>
					{/if}
					<button
						type="button"
						class="btn btn-outline btn-sm mt-2"
						onclick={handleAcceptPayment}
						disabled={isAccepting}
						data-testid="accept-incoming-payment"
					>
						{#if isAccepting}<span class="loading loading-spinner loading-xs"></span>{/if}
						{$t('bids.accept_incoming_payment')}
					</button>
				{/if}
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
					<p class="text-base-content/70 text-sm">Paid on fund. Release confirms the work.</p>
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

		{#if canRelease}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="release-funds-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">Release</h2>
					<p class="text-base-content/70 text-sm">Paid on fund. Release confirms the work.</p>
					<button
						class="btn btn-success"
						onclick={handleRelease}
						disabled={isReleasing}
						data-testid="approve-release-funds-button"
					>
						{#if isReleasing}<span class="loading loading-spinner loading-xs"></span>{/if}
						Release
					</button>
				</div>
			</section>
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
