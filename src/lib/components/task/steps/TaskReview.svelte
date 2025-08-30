<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import TaskReviewLocation from '../TaskReviewLocation.svelte';
	import {
		satsFromUsd
	} from '$lib/utils/helpers/crypto';
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';

	let { direction } = $props();

	// TODO: Refactor by adding to app store global state
	/**
	 * Fetch current BTC price
	 */
	let btcPrice = $state<number>(0); // Default fallback price

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {}
	}

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
	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-4">
			<h4 class="mb-2 font-medium">{$t('task.basic_information')}</h4>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div>
					<span class="font-medium">{$t('task.title')}</span>
					<span>{$store.task.title}</span>
				</div>

				<div>
					<span class="font-medium">{$t('task.task_type')}</span>
					<span class="text-xs"
						>{$store.task.taskType === TaskTypeEnum.IN_PERSON
							? $t('task.in_person')
							: $t('task.remote')}</span
					>
				</div>

				<div>
					<span class="font-medium">{$t('task.timeline')}</span>
					<span>
						{#if $store.task.dateRange}
							{$t('task.from')}
							{new Date($store.task.dateRange.start).toLocaleDateString()}
							{$t('task.to')}
							{new Date($store.task.dateRange.end).toLocaleDateString()}
						{:else if $store.task.deadline}
							{$t('task.deadline_review')} {new Date($store.task.deadline).toLocaleDateString()}
						{/if}
					</span>
				</div>
			</div>

			<h4 class="mt-3 font-medium">{$t('task.categories')}</h4>
			<div class="flex flex-wrap gap-2">
				{#each $store.task.categories as category}
					<div class="badge badge-primary pb-[4px]">{category}</div>
				{/each}
			</div>

			<h4 class="mt-3 font-medium">{$t('task.skills')}</h4>
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
			<h4 class="mb-2 font-medium">{$t('task.budget_details')}</h4>

			<!-- Budget Type and Amount in first row -->
			<div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div class="flex flex-col">
					<span class="text-base-content/60 font-medium">{$t('task.budget_type')}</span>
					<span>
						{$store.task.budget.type === BudgetTypeEnum.FIXED
							? $t('task.budget_fixed')
							: $t('task.budget_hourly')}
					</span>
					<!-- Estimated Hours in second row (only for hourly) -->
					{#if $store.task.budget.type === BudgetTypeEnum.HOURLY}
						<div class="mt-3 mb-2">
							<div class="flex flex-col">
								<span class="text-base-content/60 font-medium"
									>{$t('task.estimated_hours_review')}</span
								>
								<span>{$store.task.budget.estimatedHours}</span>
							</div>
						</div>
					{/if}
				</div>

				<div>
					<span class="text-base-content/60 font-medium">{$t('task.budget_amount')}</span>

					<div class="text-lg font-bold">
						${formatNumberWithTwoDecimals($store.task.budget.amount)}

						<div class="text-base-content/60 text-sm">
							{satsFromUsd($store.task.budget.amount, btcPrice)}
						</div>
					</div>
				</div>
			</div>

			<!-- Description with fixed height and scroll -->
			<div class="mb-4">
				<h4 class="mb-2 font-medium">{$t('task.description_label')}</h4>
				<div class="bg-base-100 rounded-md p-3">
					<div class="max-h-[7rem] overflow-y-auto">
						<p>{$store.task.description}</p>
					</div>
				</div>
			</div>

			<!-- Attachments -->
			{#if $store.task.attachments && $store.task.attachments.length > 0}
				<div>
					<h4 class="mb-2 font-medium">{$t('task.attachments_review')}</h4>
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
				<h3 class="font-bold">{$t('task.recurring_title')}</h3>
				<div class="text-sm">{$t('task.recurring_message')}</div>
			</div>
		</div>
	{/if}
</div>
