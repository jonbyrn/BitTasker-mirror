<script lang="ts">
	import type { Task } from '$lib/types/task';
	import type { TaskBid } from '$lib/types/bid';
	import { t, locale } from 'svelte-i18n';
	import { getNpub } from '$lib/utils/nostrKeys';
	import Tabs from '$lib/components/Tabs.svelte';
	import BidsTab from './details/BidsTab.svelte';
	import TaskTab from './details/TaskTab.svelte';
	import nostrEventsService from '$lib/api/services/nostr/events';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		task: Task | null;
		isOpen: boolean;
		activeTab: string;
		onClose: () => void;
	}>();

	// Define tabs
	const tabs = [
		{ id: 'details', label: $t('task.drawer.details') },
		{ id: 'bids', label: $t('task.drawer.bids') }
	];

	// State
	let task = $state<Task | null>(null);
	let bids = $state<TaskBid[]>([]);
	let loading = $state(false);
	let errorMessage = $state('');
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

	async function loadTaskDetails(id: string) {
		if (!id) return;
		try {
			loading = true;
			errorMessage = '';

			const { data: event } = await nostrEventsService.findEventById(id);

			if (!event) {
				errorMessage = $t('task.drawer.error.load');
				return;
			}

			// Parse task data from nostr event
			const taskData = JSON.parse(event.content) as Task;
			task = {
				...taskData,
				id: event.id
			};

			if (task) {
				bids = task.bids || [];
			}
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('task.drawer.error.load');
		} finally {
			loading = false;
		}
	}

	// Handle drawer state changes
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when drawer is open
			disableBodyScroll();

			// Set active tab from props if provided
			if (props.activeTab) {
				currentTab = props.activeTab;
			}

			// Load task details if task id is available
			if (props.task) {
				loadTaskDetails(props.task.id);
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
				<h3 class="font-bold">
					{loading ? 'Loading...' : task ? task.title : 'Task Details'}
				</h3>
				<button class="btn btn-ghost btn-circle" onclick={handleClose} aria-label="Close dialog">
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

		<!-- Loading state -->
		{#if loading}
			<div class="flex h-[calc(100vh-4rem)] items-center justify-center p-4">
				<span class="loading loading-spinner loading-lg"></span>
			</div>

			<!-- Error state -->
		{:else if errorMessage}
			<div class="p-4">
				<div class="alert alert-outline alert-error">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{errorMessage}</span>
				</div>
				<div class="mt-4 flex justify-center">
					<button
						class="btn btn-primary"
						onclick={() => props.taskId && loadTaskDetails(props.taskId)}
					>
						Try Again
					</button>
				</div>
			</div>

			<!-- Task found state -->
		{:else if task}
			<!-- Tabs -->
			<div class="px-4 pt-4">
				<Tabs {tabs} activeTab={currentTab} onTabChange={handleTabChange} />
			</div>

			<!-- Tab content -->
			<div class="p-4">
				<!-- Task Details Tab -->
				{#if currentTab === 'details'}
					<TaskTab {task} {isOwner} onClose={handleClose} />
				{:else if currentTab === 'bids'}
					<!-- Bids Tab -->
					<BidsTab {bids} {isOwner} bind:showCounterOfferForm />
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
				<h3 class="mt-4 text-lg font-semibold">Task Not Found</h3>
				<p class="text-base-content/60 mt-1">The task you're looking for could not be found.</p>
			</div>
		{/if}
	</div>
</div>
