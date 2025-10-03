<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import TaskTab from './details/TaskTab.svelte';
	import TranslatableTask from './TranslatableTask.svelte';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		task: Task | null;
		isOpen: boolean;
		activeTab: string;
		onClose: () => void;
	}>();

	// Define tabs
	const tabs = [{ id: 'details', label: $t('dashboard.task_details_by_task.details') }];

	let currentTab = $state('details'); // 'details' or 'bids'
	let showCounterOfferForm = $state(false);
	let isOwner = $state(false); // Track if current user is the task owner

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	// Handle drawer state changes
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when drawer is open
			disableBodyScroll();

			// Set active tab from props if provided
			if (props.activeTab) {
				currentTab = props.activeTab;
			}

			// Check if current user is the task owner
			if (props.task) {
				getNpub().then((npub) => {
					isOwner = props.task.author === npub;
				});
			}
		} else {
			// Restore scrolling when drawer is closed
			enableBodyScroll();
		}

		// Handle cleanup when component is unmounted
		return enableBodyScroll;
	});

	function handleTabChange(tabId: string) {
		currentTab = tabId;
	}

	const handleClose = () => props.onClose();
</script>

<!-- Drawer Overlay -->
<div
	class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out"
	class:opacity-0={!props.isOpen}
	class:invisible={!props.isOpen}
	onclick={handleClose}
	onkeydown={(e) => e.key === 'Escape' && handleClose()}
	role="dialog"
	tabindex="-1"
></div>

<!-- Drawer -->
<div
	class="bg-base-100 fixed inset-y-0 right-0 z-50 w-full overflow-y-auto shadow-xl transition-transform duration-300 ease-in-out sm:w-[70%]"
	class:translate-x-0={props.isOpen}
	class:translate-x-full={!props.isOpen}
	class:overflow-hidden={showCounterOfferForm}
>
	<div class="relative">
		<!-- Header -->
		<div class="bg-base-200 sticky top-0 z-10 p-4">
			<div class="flex items-center justify-between">
				<div class="line-clamp-2 font-bold">
					{#if props.task}
						<TranslatableTask task={props.task} showDescription={false} showToggle={false} titleClass="font-bold" />
					{:else}
						{$t('dashboard.task_details_by_task.title')}
					{/if}
				</div>
				<button
					class="btn btn-ghost btn-circle"
					onclick={handleClose}
					aria-label={$t('dashboard.task_details_by_task.close')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>
		</div>

		<!-- Task found state -->
		{#if props.task}
			<!-- Tab content -->
			<div class="p-4">
				<!-- Task Details Tab -->
				{#if currentTab === 'details'}
					<TaskTab task={props.task} {isOwner} onClose={handleClose} />
				{/if}
			</div>

			<!-- Task not found state -->
		{:else}
			<div class="p-8 text-center">
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
	</div>
</div>
