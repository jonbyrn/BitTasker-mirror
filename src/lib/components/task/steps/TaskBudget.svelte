<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { BudgetTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store } from '$lib/stores/task.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	let { errors, direction } = $props();

	// BTC to USD conversion state
	let usdAmount = $state<number>(0);
	let btcPrice = $state<number>(63000); // Default fallback price

	/**
	 * Fetch current BTC price and update the state
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');

			// Update USD amount if we have a BTC value
			if ($store.task.budget.amount) {
				usdAmount = $store.task.budget.amount * btcPrice;
			}
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}

	/**
	 * Handle USD input changes
	 */
	function handleUsdChange(event: Event) {
		const value = parseFloat((event.target as HTMLInputElement).value);
		if (!isNaN(value)) {
			usdAmount = value;
			// Convert to BTC
			const btcValue = value / btcPrice;
			store.updateTask({
				budget: {
					...$store.task.budget,
					amount: btcValue
				}
			});
		}
	}

	/**
	 * Handle BTC input changes
	 */
	function handleBtcChange(event: Event) {
		const value = parseFloat((event.target as HTMLInputElement).value);
		if (!isNaN(value)) {
			store.updateTask({
				budget: {
					...$store.task.budget,
					amount: value
				}
			});
			// Convert to USD
			usdAmount = value * btcPrice;
		}
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
			<span class="label-text">Budget</span>
		</label>
		<div class="flex gap-2">
			<div class="relative">
				<span class="text-base-content/70 absolute top-1/2 left-3 z-10 -translate-y-1/2"> $ </span>
				<input
					type="number"
					id="budget-usd"
					value={usdAmount}
					onchange={handleUsdChange}
					oninput={handleUsdChange}
					class="input input-bordered w-full pl-7 {errors.budget ? 'input-error' : ''}"
					placeholder="Enter USD amount"
					min="0"
					step="0.01"
				/>
			</div>
			<div class="relative">
				<span class="text-base-content/70 absolute top-1/2 right-3 z-10 -translate-y-1/2"> BTC </span>
				<input
					type="number"
					id="budget-btc"
					value={$store.task.budget.amount}
					onchange={handleBtcChange}
					oninput={handleBtcChange}
					class="input input-bordered w-full pr-12 {errors.budget ? 'input-error' : ''}"
					placeholder="Enter BTC amount"
					min="0"
					step="0.00000001"
				/>
			</div>
		</div>
		{#if errors.budget}
			<span class="label-text-alt text-error">{errors.budget}</span>
		{/if}
		{#if $store.task.budget.amount > 0}
			<span class="label-text-alt text-info mt-1 block"
				>Current BTC Price: ${btcPrice.toLocaleString()}</span
			>
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
				class="textarea textarea-bordered h-32 w-full rounded-xl {errors.description
					? 'textarea-error'
					: ''}"
				placeholder="Describe your task in detail"
			></textarea>
		</label>
		{#if errors.description}
			<span class="label-text-alt text-error">{errors.description}</span>
		{/if}
	</div>
</div>
