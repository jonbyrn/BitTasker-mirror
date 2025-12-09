<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { Task } from '$lib/types/task';
	import type { UserData } from '$lib/types/auth.d';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import BidCreationForm from './BidCreationForm.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { user } from '$lib/stores/user.store';
	import { getUserDisplayName } from '$lib/utils/helpers/userDisplayName';
	import KINDS from '$lib/utils/constants/kinds';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		taskId: string | null;
		isOpen: boolean;
		onClose: () => void;
	}>();

	// State
	let task = $state<Task | null>(null);
	let loading = $state(false);
	let errorMessage = $state('');
	let bidSubmitted = $state(false);
	let taskCreatorPubkey = $state<string>('');
	let taskCreatorUsername = $state<string | undefined>(undefined);
	let taskCreatorAvatar = $state<string | undefined>(undefined);

	// Logged-in user information
	let loggedInUser = $state({
		id: '',
		name: '',
		avatar: ''
	});

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	// Handle drawer state changes, including scroll locking
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when drawer is open
			disableBodyScroll();

			// Load logged-in user data
			loadLoggedInUserData();

			// Load task details if taskId is available
			if (props.taskId) {
				loadTaskDetails(props.taskId);
			}
		} else {
			// Reset state when drawer closes
			bidSubmitted = false;

			// Restore scrolling when drawer is closed
			enableBodyScroll();
		}

		// Handle cleanup when component is unmounted
		return enableBodyScroll;
	});

	let btcPrice = $state<number>(0);

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			throw new Error('Unable to fetch Bitcoin price. Please try again later.');
		}
	}

	async function loadLoggedInUserData(): Promise<void> {
		try {
			// First, fetch the latest user data including profile images
			await user.getUserData();

			// Then get current user data from the store
			let userData: UserData | undefined;
			const unsubscribe = user.subscribe((data) => {
				userData = data;
			});
			unsubscribe(); // Immediately unsubscribe after getting the current value

			if (userData) {
				// Prioritize username over name for display
				const displayName = getUserDisplayName(
					{ username: userData.username, name: userData.name || userData.displayName },
					''
				);

				loggedInUser = {
					id: userData.npub || userData.id?.toString() || '',
					name: displayName,
					avatar: userData.picture || ''
				};
			}
		} catch (error) {
			console.error('Error loading logged-in user data:', error);
		}
	}

	async function loadTaskDetails(taskId: string) {
		if (!taskId) return;

		try {
			loading = true;
			errorMessage = '';

			// Check if taskId is an event ID (64 hex chars) or UUID (uniqueId)
			const isEventId = /^[0-9a-fA-F]{64}$/.test(taskId);
			const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId);
			let event: any = null;

			if (isEventId) {
				// It's an event ID, use it directly
				const result = await nostrEventsService.findEventById(taskId);
				event = result.data;
			} else if (isUuid) {
				// It's a uniqueId (UUID), query by d-tag
				const dTagValue = `task-${taskId}`;
				const filter = {
					kinds: [KINDS.TASK_CREATION],
					'#d': [dTagValue],
					limit: 1
				};

				const response = await nostrEventsService.requestEvents({
					filters: [filter]
				});

				if (response.data && response.data.length > 0) {
					event = response.data[0];
				}
			} else {
				// Try as event ID anyway (fallback for edge cases)
				try {
					const result = await nostrEventsService.findEventById(taskId);
					event = result.data;
				} catch {
					errorMessage = $t('bids.task_details.error.failed_to_load');
					return;
				}
			}

			if (!event) {
				errorMessage = $t('bids.task_details.error.failed_to_load');
				return;
			}

			// Parse task data from nostr event
			const taskData = JSON.parse(event.content) as Task;

			// Ensure we have a valid ID
			if (!event.id) {
				errorMessage = $t('bids.task_details.error.task_id_missing');
				return;
			}

			// Get the task creator's pubkey from the event
			taskCreatorPubkey = event.pubkey;

			taskCreatorUsername = taskData.creator?.username;
			taskCreatorAvatar = taskData.creator?.avatar;
			task = {
				...taskData,
				...loggedInUser,
				id: event.id
			};
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = $t('bids.task_details.error.failed_to_load_details');
		} finally {
			loading = false;
		}
	}

	const handleClose = () => props.onClose();

	onMount(() => {
		if (browser) {
			fetchBtcPrice();
		}
	});
</script>

<!-- Drawer Overlay -->
<div
	class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out"
	class:opacity-0={!props.isOpen}
	class:invisible={!props.isOpen}
	onclick={props.onClose}
	onkeydown={(e) => e.key === 'Escape' && props.onClose()}
	role="dialog"
	tabindex="-1"
></div>

<div
	class="bg-base-100 fixed top-0 right-0 z-50 h-full w-full transform overflow-auto shadow-xl transition-transform duration-300 sm:w-[70%] {props.isOpen
		? 'translate-x-0'
		: 'translate-x-full'}"
>
	<!-- Header -->
	<div class="bg-base-200 sticky top-0 z-10 flex items-center justify-between p-4">
		<div class="flex items-center gap-3">
			<h3 id="drawer-title" class="text-lg font-semibold">{$t('bid_form.title')}</h3>
		</div>
		<button
			class="btn btn-ghost btn-circle"
			onclick={handleClose}
			aria-label={$t('common.components.bidding.task_details.close_dialog')}
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

	<!-- Loading state -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<span class="loading loading-spinner loading-lg"></span>
				<p class="mt-4 text-lg">{$t('bids.task_details.loading')}</p>
			</div>
		</div>
	{:else if bidSubmitted}
		<!-- Bid submitted success state -->
		<div class="flex flex-col items-center justify-center py-12">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-success h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h3 class="mt-4 text-xl font-semibold">{$t('bids.task_details.bid_submitted')}</h3>
			<p class="text-base-content/60 mt-2 text-center">
				{$t('bids.task_details.success.message')}
			</p>
			<button class="btn btn-primary mt-6" onclick={handleClose}>
				{$t('bids.task_details.success.close')}
			</button>
		</div>
	{:else if task}
		<div class="p-6">
			<!-- Bid Form Section -->
			{#if task.id && task.status === TaskStatusEnum.OPEN}
				<BidCreationForm
					taskId={task.id}
					onClose={() => handleClose()}
					{taskCreatorPubkey}
					taskCreatorUsername={taskCreatorUsername!}
					taskCreatorAvatar={taskCreatorAvatar!}
					taskTitle={task.title}
					taskDescription={task.description}
					taskTranslations={task.translations}
					taskDateRange={task.dateRange}
					taskDeadline={task.deadline}
					loggedInUserId={loggedInUser.id}
					loggedInUserName={loggedInUser.name}
					loggedInUserAvatar={loggedInUser.avatar}
				/>
			{:else if !task.id}
				<div class="alert alert-outline alert-error">
					<span>{$t('bids.task_details.task_id_missing')}</span>
				</div>
			{:else if task.status === TaskStatusEnum.CANCELLED || task.status === TaskStatusEnum.DISPUTED || task.status === TaskStatusEnum.COMPLETED || task.status === TaskStatusEnum.IN_PROGRESS}
				<div class="alert alert-warning alert-outline">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L73.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					<span>{$t('bids.task_details.task_not_open_for_bidding')}</span>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Task not found state -->
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
			<h3 class="mt-4 text-lg font-semibold">{$t('bids.task_details.task_not_found')}</h3>
			<p class="text-base-content/60 mt-1">
				{$t('bids.task_details.error.failed_to_load')}
			</p>
		</div>
	{/if}
</div>
