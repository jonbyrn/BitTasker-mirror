<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import TaskReviewLocation from '../TaskReviewLocation.svelte';
	import { formatNumberForInput, usdFromSats } from '$lib/utils/helpers/crypto';

	let { direction } = $props();

	// TODO: Refactor by adding to app store global state
	/**
	 * Fetch current BTC price
	 */
	let btcPrice = $state<number>(120000); // Default fallback price

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {}
	}

	// Fetch BTC price on mount
	onMount(fetchBtcPrice);
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<h2 class="text-xl font-semibold">Review Your Task</h2>

	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<h3 class="mb-2 text-lg font-medium">Basic Information</h3>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div>
					<span class="font-medium">Title:</span>
					<span>{$store.task.title}</span>
				</div>

				<div>
					<span class="font-medium">Task Type:</span>
					<span>{$store.task.taskType === TaskTypeEnum.IN_PERSON ? 'In Person' : 'Remote'}</span>
				</div>

				<div>
					<span class="font-medium">Timeline:</span>
					<span>
						{#if $store.task.dateRange}
							From {new Date($store.task.dateRange.start).toLocaleDateString()} to {new Date(
								$store.task.dateRange.end
							).toLocaleDateString()}
						{:else if $store.task.deadline}
							Deadline: {new Date($store.task.deadline).toLocaleDateString()}
						{/if}
					</span>
				</div>
			</div>

			<h4 class="mt-3 font-medium">Categories</h4>
			<div class="flex flex-wrap gap-2">
				{#each $store.task.categories as category}
					<div class="badge badge-primary pb-[4px]">{category}</div>
				{/each}
			</div>

			<h4 class="mt-3 font-medium">Skills</h4>
			<div class="flex flex-wrap gap-2">
				{#each $store.task.skills as skill}
					<div class="badge badge-primary pb-[4px]">{skill}</div>
				{/each}
			</div>
		</div>
	</div>

	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<TaskReviewLocation task={$store.task} isRemovals={$store.isRemovals} />
		</div>
	</div>

	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<h3 class="mb-2 text-lg font-medium">Budget & Details</h3>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div>
					<span class="font-medium">Budget Type:</span>
					<span>
						{$store.task.budget.type === BudgetTypeEnum.FIXED ? 'Fixed Price' : 'Hourly Rate'}
					</span>
				</div>
				<div class="flex flex-col items-center gap-2">
					<span class="font-medium">Budget Amount:</span>

					<div class="flex flex-col items-start">
						<span class="font-semibold">{formatNumberForInput($store.task.budget.amount)} Sats</span
						>
						<span class="text-info text-xs"
							>≈ {usdFromSats($store.task.budget.amount, btcPrice)} USDT</span
						>
					</div>
				</div>

				{#if $store.task.budget.type === BudgetTypeEnum.HOURLY}
					<div>
						<span class="font-medium">Estimated Hours:</span>
						<span>{$store.task.budget.amount}</span>
					</div>
				{/if}
			</div>

			<h4 class="mt-3 font-medium">Description</h4>
			<div class="bg-base-100 mt-1 rounded-md p-3">
				<p>{$store.task.description}</p>
			</div>

			{#if $store.task.attachments && $store.task.attachments.length > 0}
				<h4 class="mt-3 font-medium">Attachments</h4>
				<div class="grid grid-cols-2 gap-2 md:grid-cols-3">
					{#each $store.task.attachments as attachment}
						<div class="relative overflow-hidden rounded-lg">
							{#if attachment.type?.startsWith('video/')}
								<video
									src={attachment.url}
									class="h-32 w-full object-cover"
									controls
									muted={false}
									autoplay={false}
									loop={false}
								>
									<track kind="captions" />
								</video>
							{:else}
								<img
									src={attachment.url}
									alt={attachment.alt}
									class="h-32 w-full object-cover"
									loading="lazy"
								/>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if $store.recurringTask.isRecurring}
		<div class="alert alert-info alert-outline">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>
			<div>
				<h3 class="font-bold">This is a recurring task!</h3>
				<div class="text-sm">After review, you'll be asked to set up the recurring schedule.</div>
			</div>
		</div>
	{/if}
</div>
