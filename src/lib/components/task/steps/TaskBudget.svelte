<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { BudgetTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store } from '$lib/stores/task.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	let { errors, direction } = $props();

	// BTC to USDT estimate
	let usdtEstimate = $state<string>('0');
	let btcPrice = $state<number>(63000); // Default fallback price

	/**
	 * Fetch current BTC price and update the state
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');

			// Update estimate if we have a budget value
			if ($store.task.budget.amount) {
				usdtEstimate = calculateUsdtEstimate($store.task.budget.amount);
			}
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}

	/**
	 * Calculate estimated USDT value based on BTC amount
	 * Uses real-time BTC price from API
	 */
	function calculateUsdtEstimate(btcAmount: number): string {
		// Calculate the estimated value and format it
		const estimatedValue = btcAmount * btcPrice;
		return estimatedValue.toLocaleString('en-US', {
			maximumFractionDigits: 2,
			minimumFractionDigits: 2
		});
	}

	onMount(() => {
		fetchBtcPrice();
	});
</script>

<div
	class="space-y-4"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<h3 class="text-lg font-semibold">What's your budget?</h3>

	<div class="flex gap-4">
		<button
			class="btn {$store.task.budget.type === BudgetTypeEnum.FIXED ? 'btn-primary' : 'btn-outline'}"
			onclick={() =>
				store.updateTask({ budget: { ...$store.task.budget, type: BudgetTypeEnum.FIXED } })}
		>
			Fixed price
		</button>
		<button
			class="btn {$store.task.budget.type === BudgetTypeEnum.HOURLY
				? 'btn-primary'
				: 'btn-outline'}"
			onclick={() =>
				store.updateTask({ budget: { ...$store.task.budget, type: BudgetTypeEnum.HOURLY } })}
		>
			Hourly rate
		</button>
	</div>

	<div class="w-full">
		<label for="budget" class="label">
			<span class="label-text">Budget (in BTC)</span>
		</label>
		<input
			type="number"
			id="budget"
			bind:value={$store.task.budget.amount}
			oninput={() => (usdtEstimate = calculateUsdtEstimate($store.task.budget.amount))}
			class="input input-bordered w-full {errors.budget ? 'input-error' : ''}"
			placeholder="Enter your budget"
			min="0"
			step="0.00000001"
		/>
		{#if $store.task.budget.amount > 0}
			<span class="label-text-alt text-info mt-1 block">≈ {usdtEstimate} USDT</span>
		{/if}
		{#if errors.budget}
			<span class="label-text-alt text-error">{errors.budget}</span>
		{/if}
	</div>

	{#if $store.task.budget.type === BudgetTypeEnum.HOURLY}
		<div class="w-full">
			<label for="estimatedHours" class="label">
				<span class="label-text">Estimated Hours</span>
			</label>
			<input
				type="number"
				id="estimatedHours"
				value={$store.task.budget.estimatedHours}
				onchange={(e) => {
					store.updateTask({
						budget: {
							...$store.task.budget,
							estimatedHours: parseInt((e.target as HTMLInputElement).value)
						}
					});
				}}
				class="input input-bordered w-full"
				placeholder="Estimated hours needed"
				min="1"
			/>
			{#if errors.estimatedHours}
				<span class="label-text-alt text-error">{errors.estimatedHours}</span>
			{/if}
		</div>
	{/if}

	<div class="w-full">
		<label for="description">
			<span class="label">Task Details</span>
			<textarea
				id="description"
				value={$store.task.description}
				onchange={(e) => {
					store.updateTask({ description: (e.target as HTMLTextAreaElement).value });
				}}
				class="textarea textarea-bordered h-32 w-full {errors.description ? 'textarea-error' : ''}"
				placeholder="Describe your task in detail"
			></textarea>
		</label>
		{#if errors.description}
			<span class="label-text-alt text-error">{errors.description}</span>
		{/if}
	</div>
</div>
