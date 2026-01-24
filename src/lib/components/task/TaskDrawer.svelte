<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import Drawer from '$lib/components/Drawer.svelte';
	import TaskTab from './details/TaskTab.svelte';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import { currentUserLanguage } from '$lib/stores/translation.store';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		task: Task | null;
		isOpen: boolean;
		activeTab: string;
		onClose: () => void;
		onRequestEditConfirm?: () => void;
		onRequestDeleteConfirm?: () => void;
		isDeleting?: boolean;
		onBid?: () => void;
	}>();

	// Define tabs
	const tabs = [{ id: 'details', label: $t('dashboard.task_details_by_task.details') }];

	let currentTab = $state('details'); // 'details' or 'bids'
	let showCounterOfferForm = $state(false);
	let isOwner = $state(false); // Track if current user is the task owner

	// Get translated title for drawer
	const drawerTitle = $derived.by(() => {
		if (!props.task) {
			return $t('dashboard.task_details_by_task.title');
		}

		const userLang = $currentUserLanguage;
		if (userLang && props.task) {
			// Check if translation exists and source language doesn't match user language
			if (props.task.translations?.sourceLanguage !== userLang) {
				const translation = taskTranslationService.getStoredTranslation(props.task, userLang);
				if (translation?.translatedTitle) {
					return translation.translatedTitle;
				}
			}
		}

		// Fallback to original title
		return props.task.title ?? $t('dashboard.task_details_by_task.title');
	});

	// Handle drawer state changes
	$effect(() => {
		if (props.isOpen) {
			// Set active tab from props if provided
			if (props.activeTab) {
				currentTab = props.activeTab;
			}

			// Check if current user is the task owner
			if (props.task) {
				getNpub().then((npub) => {
					isOwner = props.task.npub === npub;
				});
			}
		}
	});

	function handleTabChange(tabId: string) {
		currentTab = tabId;
	}

	const handleClose = () => props.onClose();
</script>

<Drawer
	isOpen={props.isOpen}
	title={drawerTitle}
	onClose={handleClose}
	position="right"
	isScrollable={!showCounterOfferForm}
>
	{#snippet children()}
		{#if props.task}
			<!-- Tab content -->
			<div class="p-4">
				<!-- Task Details Tab -->
				{#if currentTab === 'details'}
					<TaskTab
						task={props.task}
						{isOwner}
						onClose={handleClose}
						onRequestEditConfirm={props.onRequestEditConfirm}
						onRequestDeleteConfirm={props.onRequestDeleteConfirm}
						isDeleting={props.isDeleting}
						onBid={props.onBid}
					/>
				{/if}
			</div>

			<!-- Task not found state -->
		{:else}
			<div class="p-4 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/30 mx-auto h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<h3 class="mt-4 text-lg font-semibold">
					{$t('dashboard.task_details_by_task.task_not_found')}
				</h3>
				<p class="text-base-content/60 mt-1">
					{$t('dashboard.task_details_by_task.task_not_found_message')}
				</p>
			</div>
		{/if}
	{/snippet}
</Drawer>
