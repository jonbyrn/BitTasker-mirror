<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-vars, no-empty */
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import TaskReviewLocation from '../TaskReviewLocation.svelte';
	import { isSatBid } from '$lib/utils/nostr-bid';
	import { locale, t } from 'svelte-i18n';
	import { reviewTimeline } from '$lib/utils/helpers/task-schedule';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import { categoryById } from '$lib/search/taxonomy.js';
	import {
		formatStandardDateShort,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import type { Attachment } from '$lib/types/task';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';

	let { direction } = $props();
	const timeline = $derived(reviewTimeline($store.task));

	// Helper function to translate a single category
	function translateCategory(category: string | { id: string }): string {
		try {
			// Extract ID from category (handle both string and object)
			const categoryId = typeof category === 'string' ? category : category.id;
			const categoryObj = TASK_CATEGORIES.find((cat) => cat.id === categoryId);
			if (categoryObj) {
				// Use slug for translation key (as defined in translation files)
				const translatedName = $t(`categories.${categoryObj.slug}.name`);
				// Fallback to category.name if translation key is returned (translation not loaded)
				return translatedName.startsWith('categories.') ? categoryObj.name : translatedName;
			}
			return categoryId;
		} catch (error) {
			console.error('Error translating category:', error);
			return typeof category === 'string' ? category : category.id || '';
		}
	}

	// Convert category IDs to translated names for display (reactive)
	let translatedCategories = $derived($store.task.categories.map(translateCategory));

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

	// Helper function to format date without year for start dates in date ranges
	function formatDateWithoutYear(date: Date): string {
		try {
			return new Intl.DateTimeFormat('en-US', {
				month: 'short',
				day: 'numeric'
			}).format(date);
		} catch (error) {
			return 'Invalid date';
		}
	}

	// Helper function to detect Cloudflare Stream videos
	function isStreamVideo(att: Attachment): boolean {
		return !!att.cloudflareId && (att.type || '').toLowerCase().startsWith('video/');
	}

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	// Helper function to prepare images for Gallery component
	const prepareGalleryImages = async (attachments: Attachment[]) => {
		const imagePromises = attachments
			.filter((attachment) => !isVideoFile(attachment.url))
			.map((attachment) => {
				return new Promise((resolve) => {
					const img = new Image();
					img.onload = () => {
						resolve({
							url: attachment.url,
							alt: attachment.alt || $t('dashboard.task_details_by_task.task_attachment'),
							width: img.naturalWidth,
							height: img.naturalHeight,
							size: attachment.size
						});
					};
					img.onerror = () => {
						resolve({
							url: attachment.url,
							alt: attachment.alt || $t('dashboard.task_details_by_task.task_attachment'),
							width: 0,
							height: 0,
							size: attachment.size
						});
					};
					img.src = attachment.url;
				});
			});

		return await Promise.all(imagePromises);
	};
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
		<div class="card-body p-6">
			<h4 class="text-base-content mb-6 text-lg font-semibold">{$t('task.basic_information')}</h4>

			<!-- Task Details Grid -->
			<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="space-y-1">
					<span class="text-base-content/70 text-sm font-medium">{$t('task.title')}</span>
					<p class="text-base-content text-base font-medium">{$store.task.title}</p>
				</div>

				<div class="space-y-1">
					<span class="text-base-content/70 text-sm font-medium">{$t('task.task_type')}</span>
					<div class="flex items-center gap-2">
						<span class="badge badge-primary badge-sm">
							{$store.task.taskType === TaskTypeEnum.IN_PERSON
								? $t('task.in_person')
								: $t('task.remote')}
						</span>
					</div>
				</div>

				<div class="space-y-1 sm:col-span-2">
					<span class="text-base-content/70 text-sm font-medium">{$t('task.timeline')}</span>
					<div class="flex flex-col gap-1">
						{#if timeline === 'flexible'}
							<span class="text-base-content text-base font-medium" data-testid="review-flexible">
								{$t('task.flexible')}
							</span>
						{:else if timeline === 'range' && $store.task.dateRange}
							<span class="text-base-content text-base font-medium">
								{$t('task.complete_between')}
								{formatDateWithoutYear(new Date($store.task.dateRange.start))}
								{$t('task.and')}
								{formatStandardDateShort(new Date($store.task.dateRange.end))}
							</span>
						{:else if $store.task.deadline}
							<span class="text-base-content text-base font-medium">
								{$t('task.complete_by')}
								{formatStandardDateShort(
									parseDateToLocalMidnight($store.task.deadline) || new Date($store.task.deadline)
								)}
							</span>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Budget Section -->
	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-6">
			<h5 class="text-base-content mb-4 text-base font-semibold">{$t('task.budget_details')}</h5>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="space-y-1">
					<span class="text-base-content/70 text-sm font-medium">{$t('task.budget_type')}</span>
					<div class="flex items-center gap-2">
						<span class="badge badge-outline badge-sm">
							{$store.task.budget.type === BudgetTypeEnum.FIXED
								? $t('task.budget_fixed')
								: $t('task.budget_hourly')}
						</span>
						{#if $store.task.budget.type === BudgetTypeEnum.HOURLY}
							<span class="text-base-content/70 text-sm">
								({$store.task.budget.estimatedHours}
								{$t('task.hours')})
							</span>
						{/if}
					</div>
				</div>

				<div class="space-y-1">
					<span class="text-base-content/70 text-sm font-medium">{$t('task.budget_amount')}</span>
					<div class="flex flex-col">
						<span class="text-primary text-2xl font-bold" data-testid="task-review-amount">
							{#if isSatBid($store.task.budget.currency)}
								{Math.round($store.task.budget.amount).toLocaleString()} sats
							{:else}
								${formatNumberWithTwoDecimals($store.task.budget.amount)} USDT
							{/if}
						</span>
						<span class="text-base-content/70 text-sm" data-testid="task-review-escrow">
							{$t(
								isSatBid($store.task.budget.currency)
									? 'task.pay_review_btc'
									: 'task.pay_review_usdt'
							)}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Description Section -->
	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-6">
			<h5 class="text-base-content mb-3 text-base font-semibold">{$t('task.description_label')}</h5>
			<div class="bg-base-100 border-base-300 rounded-lg border p-4">
				<div class="max-h-32 overflow-y-auto">
					<p class="text-base-content text-sm leading-relaxed whitespace-pre-wrap">
						{$store.task.description}
					</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Categories and Skills section -->
	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-6">
			<div class="mb-6">
				<h4 class="text-base-content mb-3 text-base font-semibold">{$t('task.categories')}</h4>
				<div class="flex flex-wrap gap-2" data-testid="task-review-category">
					{#if categoryById($store.task.searchCategory || '')}
						{@const chosen = categoryById($store.task.searchCategory || '')}
						{@const sub = chosen?.subcategories.find(
							(item) => item.id === $store.task.searchSubcategory
						)}
						<span class="badge badge-primary badge-sm">
							{String($locale || '').startsWith('es') ? chosen?.nameEs : chosen?.name}
						</span>
						{#if sub}
							<span class="badge badge-outline badge-sm">
								{String($locale || '').startsWith('es') ? sub.nameEs : sub.name}
							</span>
						{/if}
					{:else}
						{#each translatedCategories as category (category)}
							<span class="badge badge-primary badge-sm">{category}</span>
						{/each}
					{/if}
				</div>
			</div>

			<div>
				<h4 class="text-base-content mb-3 text-base font-semibold">{$t('task.skills')}</h4>
				<div class="flex flex-wrap gap-2">
					{#each $store.task.skills as skill (skill)}
						<span class="badge badge-primary badge-sm">{skill}</span>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<div class="card bg-base-200 shadow-sm">
		<div class="card-body p-6">
			<TaskReviewLocation task={$store.task} isRemovals={$store.isRemovals} />
		</div>
	</div>

	<!-- Attachments section -->
	{#if $store.task.attachments && $store.task.attachments.length > 0}
		<div class="mb-20 sm:mb-0">
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.attachments')}
			</small>

			<div class="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
				{#each $store.task.attachments as attachment, _i (attachment.key || _i)}
					{#if isStreamVideo(attachment)}
						<!-- Stream Video -->
						<div class="bg-base-200 overflow-hidden rounded-lg pb-4">
							<StreamPlayer videoUid={attachment.cloudflareId!} private={false} controls={true} />
							<div class="p-3">
								<p class="truncate text-sm font-medium">
									{attachment?.alt || $t('dashboard.task_details_by_task.attachment')}
								</p>
								<p class="text-base-content/60 text-xs">
									{(attachment.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
						</div>
					{:else if isVideoFile(attachment.url)}
						<!-- Legacy Video -->
						<div class="bg-base-200 overflow-hidden rounded-lg pb-4">
							<video class="h-32 w-full object-cover" controls preload="metadata">
								<source src={attachment.url} type={attachment.type} />

								{$t('dashboard.task_details_by_task.video_not_supported')}
							</video>
							<div class="p-3">
								<p class="truncate text-sm font-medium">
									{attachment?.alt || $t('dashboard.task_details_by_task.attachment')}
								</p>
								<p class="text-base-content/60 text-xs">
									{(attachment.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
						</div>
					{:else}
						<!-- Image -->
						<div class="bg-base-200 overflow-hidden rounded-lg pb-4">
							<img
								src={attachment.url}
								alt={attachment?.alt || 'Attachment'}
								class="h-32 w-full object-cover"
							/>
							<div class="p-3">
								<p class="truncate text-sm font-medium">
									{attachment?.alt || $t('dashboard.task_details_by_task.attachment')}
								</p>
								<p class="text-base-content/60 text-xs">
									{(attachment.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

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
