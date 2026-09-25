<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { formatInteger, formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { resolveBidSats } from '$lib/utils/nostr-bid';

	interface BidSubmission {
		amount: number;
		days: number;
		proposal: string;
		taskId: string;
	}

	interface Props {
		task?: Task | null;
		onClose?: () => void;
		onSubmit?: (data: BidSubmission) => Promise<void> | void;
	}

	let { task = null, onClose = () => {}, onSubmit }: Props = $props();

	let formattedBudget = $derived.by(() => {
		if (!task?.budget) return null;
		if (typeof task.budget === 'object') {
			return task.budget.amount ?? task.budget.value ?? task.budget.usd ?? null;
		}
		return task.budget;
	});

	let bidAmount = $state<number | null>(null);
	const satsEstimate = $derived(
		bidAmount && bidAmount > 0 ? resolveBidSats(bidAmount, 'USD', btcPrice.price) : null
	);
	const budgetSats = $derived(
		typeof formattedBudget === 'number'
			? resolveBidSats(formattedBudget, 'USD', btcPrice.price)
			: null
	);
	let deliveryDays = $state(3);
	let proposal = $state('');
	let isSubmitting = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		isSubmitting = true;
		try {
			if (!onSubmit || !task?.id || !bidAmount) {
				throw new Error('Bid form is not ready');
			}
			await onSubmit({
				amount: bidAmount,
				days: deliveryDays,
				proposal,
				taskId: task.id
			});
			onClose();
		} catch (err) {
			console.error('Bid submission failed', err);
			appStore.showErrorToast($t('bid_creation.failed_to_submit_bid'));
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div
	class="bg-base-100 text-base-content rounded-box border-base-300 mx-auto max-w-2xl border p-6 shadow-xl"
	data-testid="bid-form"
>
	<div class="border-base-200 mb-6 flex items-center justify-between border-b pb-4">
		<div>
			<h2 class="font-sans text-2xl font-bold">
				{$t('bidding.place_bid', { default: 'Place Your Bid' })}
			</h2>
			{#if task?.title}
				<p class="text-opacity-70 text-base-content mt-1 text-sm">
					For: <span class="font-semibold">{task.title}</span>
				</p>
			{/if}
		</div>
		<button type="button" class="btn btn-sm btn-circle btn-ghost" onclick={onClose}>✕</button>
	</div>

	<form onsubmit={handleSubmit} class="space-y-6">
		<div class="form-control">
			<label class="label font-medium" for="bidAmount">
				<span class="label-text">{$t('bids.your_bid_amount_usd')}</span>
			</label>
			<input
				id="bidAmount"
				data-testid="bid-amount-input"
				type="number"
				bind:value={bidAmount}
				min="0.01"
				step="0.01"
				class="input input-bordered focus:input-primary w-full text-lg"
				placeholder={$t('bids.your_bid_amount_usd')}
				required
			/>
			{#if satsEstimate !== null}
				<p class="text-base-content/60 mt-1 text-sm" data-testid="bid-sats-estimate">
					{$t('bids.sats_estimate', { values: { amount: formatInteger(satsEstimate) } })}
				</p>
			{/if}
			{#if typeof formattedBudget === 'number'}
				<p class="mt-2 text-sm" data-testid="task-budget">
					<span class="text-base-content/70">{$t('bids.task_budget')}</span>
					<span class="font-semibold">${formatNumberWithTwoDecimals(formattedBudget)}</span>
					{#if budgetSats !== null}
						<span class="text-base-content/60">
							{$t('bids.sats_estimate', { values: { amount: formatInteger(budgetSats) } })}
						</span>
					{/if}
				</p>
			{/if}
		</div>

		<div class="form-control">
			<label class="label font-medium" for="deliveryDays">
				<span class="label-text">Delivery Time (Days)</span>
			</label>
			<input
				id="deliveryDays"
				data-testid="bid-delivery-days-input"
				type="number"
				bind:value={deliveryDays}
				min="1"
				class="input input-bordered focus:input-primary w-full"
				required
			/>
		</div>

		<div class="form-control">
			<label class="label font-medium" for="proposal">
				<span class="label-text">Proposal Details</span>
			</label>
			<textarea
				id="proposal"
				data-testid="bid-proposal-input"
				bind:value={proposal}
				class="textarea textarea-bordered focus:textarea-primary h-32 w-full"
				placeholder="Describe why you are the best fit for this task..."
				required
			></textarea>
		</div>

		<div class="border-base-200 flex justify-end gap-3 border-t pt-4">
			<button type="button" class="btn btn-ghost" onclick={onClose}> Cancel </button>
			<button
				type="submit"
				class="btn btn-primary px-8"
				disabled={isSubmitting}
				data-testid="submit-bid-btn"
			>
				{#if isSubmitting}
					<span class="loading loading-spinner loading-xs"></span>
					Submitting...
				{:else}
					Submit Bid
				{/if}
			</button>
		</div>
	</form>
</div>
