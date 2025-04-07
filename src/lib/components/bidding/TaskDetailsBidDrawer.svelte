<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { fly } from 'svelte/transition';
	import { formatDistanceToNow, format } from 'date-fns';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import taskService from '$lib/api/services/task.service';
	import BidCreationForm from './BidCreationForm.svelte';

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
	let showBidForm = $state(false);

	// Bid form state
	let amount = $state('');
	let description = $state('');
	let estimatedDuration = $state('');
	let proposedApproach = $state('');
	let hourlyRate = $state('');
	let estimatedHours = $state('');
	let bidType = $state<'FIXED' | 'HOURLY'>('FIXED');
	let bidFormErrors = $state<Record<string, string>>({});

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

			// Load task details if taskId is available
			if (props.taskId) {
				loadTaskDetails(props.taskId);
			}
		} else {
			// Reset state when drawer closes
			bidSubmitted = false;
			showBidForm = false;
			resetBidForm();

			// Restore scrolling when drawer is closed
			enableBodyScroll();
		}

		// Handle cleanup when component is unmounted
		return enableBodyScroll;
	});

	async function loadTaskDetails(taskId: string) {
		try {
			loading = true;
			errorMessage = '';

			const taskData = await taskService.getTaskById(taskId);
			task = taskData;

			// Default to showing the bid form
			showBidForm = true;
		} catch (error) {
			console.error('Failed to load task details:', error);
			errorMessage = 'Failed to load task details. Please try again.';
		} finally {
			loading = false;
		}
	}

	function resetBidForm() {
		amount = '';
		description = '';
		estimatedDuration = '';
		proposedApproach = '';
		hourlyRate = '';
		estimatedHours = '';
		bidType = 'FIXED';
		bidFormErrors = {};
	}

	const handleClose = () => props.onClose();

	const formatTimeAgo = (date: string): string =>
		formatDistanceToNow(new Date(date), { addSuffix: true });
</script>

<div
	class="bg-base-100 fixed top-0 right-0 z-50 h-full w-[70%] transform overflow-auto shadow-xl transition-transform duration-300 {props.isOpen
		? 'translate-x-0'
		: 'translate-x-full'}"
>
	<!-- Drawer Overlay -->
	<div
		class="bg-opacity-50 fixed inset-0 z-40 bg-black transition-opacity duration-300 ease-in-out"
		class:opacity-0={!props.isOpen}
		class:invisible={!props.isOpen}
		onclick={handleClose}
		onkeydown={(e) => e.key === 'Escape' && handleClose()}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
	></div>

	<!-- Drawer -->
	<div
		class="bg-base-100 fixed inset-y-0 right-0 z-50 w-full overflow-y-auto shadow-xl transition-transform duration-300 ease-in-out"
		class:translate-x-0={props.isOpen}
		class:translate-x-full={!props.isOpen}
		aria-labelledby="drawer-title"
	>
		<!-- Header -->
		<div class="bg-base-200 sticky top-0 z-10 flex items-center justify-between border-b p-4">
			<h2 id="drawer-title" class="text-xl font-bold">
				{loading
					? 'Loading...'
					: bidSubmitted
						? 'Bid Submitted'
						: task
							? 'Task Details'
							: 'Task Not Found'}
			</h2>
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

		<!-- Loading state -->
		{#if loading}
			<div class="flex h-[calc(100vh-4rem)] items-center justify-center p-4">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
			<!-- Error state -->
		{:else if errorMessage}
			<div class="p-4">
				<div class="alert alert-error">
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
			<!-- Success state after bid submission -->
		{:else if bidSubmitted}
			<div class="p-8 text-center">
				<div class="mb-6">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-success mx-auto h-16 w-16"
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
				</div>
				<h3 class="mb-2 text-2xl font-bold">Bid Submitted Successfully!</h3>
				<p class="mb-6">
					Your bid has been submitted to the task owner. You'll be notified if they accept or send a
					counter-offer.
				</p>
				<div class="flex justify-center gap-4">
					<button class="btn btn-primary" onclick={handleClose}>Close</button>
				</div>
			</div>
			<!-- Task details and bid form -->
		{:else if task}
			<div class="p-4">
				<!-- Task details section -->
				<div class="mb-6">
					<h3 class="mb-3 text-lg font-semibold">{task.title}</h3>

					<div class="mb-4 grid grid-cols-2 gap-x-4 gap-y-2">
						<div>
							<span class="text-base-content/60 text-sm">Budget:</span>
							<div class="font-semibold">{task.budget} {task.budgetType}</div>
						</div>

						<div>
							<span class="text-base-content/60 text-sm">Type:</span>
							<div class="font-semibold">
								{task.taskType === TaskTypeEnum.REMOTE ? 'Remote' : 'In-Person'}
							</div>
						</div>

						{#if task.deadlineDate}
							<div>
								<span class="text-base-content/60 text-sm">Deadline:</span>
								<div class="font-semibold">{formatTimeAgo(task.deadlineDate)}</div>
							</div>
						{:else if task.dateRange}
							<div>
								<span class="text-base-content/60 text-sm">Date Range:</span>
								<div class="font-semibold">
									{format(new Date(task.dateRange.start), 'MMM d, yyyy')} -
									{format(new Date(task.dateRange.end), 'MMM d, yyyy')}
								</div>
							</div>
						{/if}

						<div>
							<span class="text-base-content/60 text-sm">Posted:</span>
							<div class="font-semibold">{formatTimeAgo(task.createdAt)}</div>
						</div>
					</div>

					<div class="mb-4">
						<span class="text-base-content/60 text-sm">Description:</span>
						<p class="mt-1 whitespace-pre-line">{task.description}</p>
					</div>

					{#if task.requiredSkills?.length > 0}
						<div class="mb-4">
							<span class="text-base-content/60 text-sm">Required Skills:</span>
							<div class="mt-1 flex flex-wrap gap-1">
								{#each task.requiredSkills as skillItem}
									<span class="badge badge-primary badge-outline">{skillItem.skill.name}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if task.categories?.length > 0}
						<div class="mb-4">
							<span class="text-base-content/60 text-sm">Categories:</span>
							<div class="mt-1 flex flex-wrap gap-1">
								{#each task.categories as category}
									<span class="badge badge-secondary badge-outline">{category.category.name}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<div class="divider"></div>

				<!-- Bid form -->
				{#if showBidForm && task.status === TaskStatusEnum.OPEN}
					<BidCreationForm taskId={task.id} onClose={() => handleClose()} />
				{:else}
					<p class="text-base-content/60 mt-4">Task is not open for bidding.</p>
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

<!-- Sliding Sidebar -->
{#if props.isOpen}
	<div
		class="fixed inset-0 z-40 bg-black/50"
		onclick={handleClose}
		onkeydown={(e) => e.key === 'Escape' && handleClose()}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		in:fly={{ duration: 300, x: '100%', opacity: 1 }}
		out:fly={{ duration: 300, x: '100%', opacity: 1 }}
	></div>
{/if}
