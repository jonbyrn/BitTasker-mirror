<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/stores/breezWallet.store';
	import { formatStandardDateTime, formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import TranslatableTask from './TranslatableTask.svelte';

	const { task, btcPrice, onclick } = $props<{
		task: Task;
		btcPrice: number;
		onclick: () => void;
	}>();

	function formatDateTimeReactive(date: Date) {
		return formatStandardDateTime(date, $locale || 'en');
	}

	function formatDateRangeReactive(startDate: Date, endDate: Date) {
		const start = formatStandardDateShort(startDate, $locale || 'en');
		const end = formatStandardDateShort(endDate, $locale || 'en');
		return `${start} - ${end}`;
	}
</script>

<div class="card bg-base-100 shadow-xl transition-shadow hover:shadow-lg" onclick={onclick} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick(); } }}>
	<div class="card-body">
		<!-- Task Title and Description -->
		<div class="flex flex-col justify-between gap-2">
			<div class="card-title line-clamp-1 text-lg">
				<button
					class="hover:text-primary cursor-pointer transition-colors text-left"
					onclick={(e) => {
						e.stopPropagation();
						goto(`/dashboard/task/${task.id}`);
					}}
				>
					<TranslatableTask 
						{task} 
						showTitle={true}
						showDescription={false}
						showToggle={false}
						titleClass="text-lg font-semibold"
					/>
				</button>
			</div>
			<div class="text-base-content/60">
				<TranslatableTask 
					{task} 
					showTitle={false}
					showDescription={true}
					showToggle={false}
					descriptionClass="text-sm text-base-content/60 line-clamp-2"
				/>
			</div>
		</div>

		<!-- Schedule and Budget -->
		<div class="flex w-full items-center justify-between">
			<!-- Left: Schedule -->
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/60 h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex flex-col">
					{#if task.deadline}
						<small class="text-base-content/60 text-xs">
							{$t('dashboard.task.deadline.label')}
						</small>
						<span class="text-sm font-medium">
							{formatDateTimeReactive(new Date(task.deadline))}
						</span>
					{:else if task.dateRange}
						<small class="text-base-content/60 text-xs">
							{$t('dashboard.task.dateRange.label')}
						</small>
						<span class="text-sm font-medium">
							{formatDateRangeReactive(new Date(task.dateRange.start), new Date(task.dateRange.end))}
						</span>
					{/if}
				</div>
			</div>

			<!-- Right: Budget -->
			<div class="">
				<div class="text-lg font-bold">
					${formatNumberWithTwoDecimals(task.budget.amount)}
					<div class="text-base-content/60 text-sm">
						{satsFromUsd(task.budget.amount, btcPrice)}
					</div>
				</div>
			</div>
		</div>

		<!-- Location -->
		<div class="flex w-full items-start gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/60 mt-1 h-4 w-4 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
				/>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
				/>
			</svg>
			<div class="flex min-w-0 flex-1 flex-col">
				<small class="text-base-content/60 text-xs">{$t('dashboard.task.location.details')}</small>
				<span class="line-clamp-2 text-sm font-medium">
					{#if task.dropOffLocation?.displayName}
						{task.dropOffLocation.displayName}
					{:else if task.pickupLocation?.displayName}
						{task.pickupLocation.displayName}
					{:else}
						{$t('dashboard.task.type.remote')}
					{/if}
				</span>
			</div>
		</div>
	</div>
</div>

