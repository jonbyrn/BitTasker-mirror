<script lang="ts">
	import { onMount } from 'svelte';

	// Mock alerts data
	let alerts = [
		{
			id: 1,
			type: 'contract',
			title: 'New Contract Offer',
			message: 'You have received a new contract offer for "Landing Page Design"',
			time: '10 minutes ago',
			isRead: false,
			actionUrl: '/dashboard/contracts'
		},
		{
			id: 2,
			type: 'payment',
			title: 'Payment Received',
			message: 'You have received a payment of $350 for "Logo Design for NexaTech"',
			time: '2 hours ago',
			isRead: false,
			actionUrl: '/dashboard/contracts'
		},
		{
			id: 3,
			type: 'message',
			title: 'New Message',
			message: 'Sarah Johnson sent you a message about the E-commerce project',
			time: '4 hours ago',
			isRead: true,
			actionUrl: '/dashboard/messages'
		},
		{
			id: 4,
			type: 'deadline',
			title: 'Approaching Deadline',
			message: 'The "Mobile App UI/UX Design" project deadline is in 2 days',
			time: 'Yesterday',
			isRead: true,
			actionUrl: '/dashboard/contracts'
		},
		{
			id: 5,
			type: 'review',
			title: 'New Review',
			message: 'Carlos Rodriguez left a 5-star review for your work',
			time: '2 days ago',
			isRead: true,
			actionUrl: '/dashboard/profile'
		},
		{
			id: 6,
			type: 'task',
			title: 'Task Recommendation',
			message: 'We found 3 new tasks that match your skills',
			time: '3 days ago',
			isRead: true,
			actionUrl: '/dashboard'
		},
		{
			id: 7,
			type: 'system',
			title: 'Account Security',
			message: 'We noticed a login from a new device. Please verify it was you.',
			time: '5 days ago',
			isRead: true,
			actionUrl: '/dashboard/settings'
		}
	];

	// Filter options
	const types = ['All', 'Contract', 'Payment', 'Message', 'Deadline', 'Review', 'Task', 'System'];
	let selectedType = 'All';
	let showUnreadOnly = false;

	// Filtered alerts based on selected filters
	$: filteredAlerts = alerts.filter((alert) => {
		// Type filter
		if (selectedType !== 'All' && alert.type.toLowerCase() !== selectedType.toLowerCase()) {
			return false;
		}

		// Unread filter
		if (showUnreadOnly && alert.isRead) {
			return false;
		}

		return true;
	});

	// Mark all as read
	function markAllAsRead() {
		alerts.forEach((alert) => {
			alert.isRead = true;
		});
		// Force reactivity update
		alerts = [...alerts];
	}

	// Mark single alert as read
	function markAsRead(id: number) {
		const alert = alerts.find((a) => a.id === id);
		if (alert) {
			alert.isRead = true;
			// Force reactivity update
			alerts = [...alerts];
		}
	}

	// Delete alert
	function deleteAlert(id: number) {
		alerts = alerts.filter((alert) => alert.id !== id);
	}

	// Get appropriate icon for alert type
	function getAlertIcon(type: string): string {
		switch (type.toLowerCase()) {
			case 'contract':
				return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
			case 'payment':
				return 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'message':
				return 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z';
			case 'deadline':
				return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'review':
				return 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z';
			case 'task':
				return 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4';
			case 'system':
				return 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z';
			default:
				return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
		}
	}

	// Get appropriate color for alert type
	function getAlertColor(type: string): string {
		switch (type.toLowerCase()) {
			case 'contract':
				return 'alert-primary';
			case 'payment':
				return 'alert-success';
			case 'message':
				return 'alert-info';
			case 'deadline':
				return 'alert-warning';
			case 'review':
				return 'alert-success';
			case 'task':
				return 'alert-info';
			case 'system':
				return 'alert-error';
			default:
				return '';
		}
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Page header -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold">Alerts & Notifications</h1>
			<p class="text-base-content/70">Stay updated with important information</p>
		</div>
		<div class="flex gap-2">
			<button class="btn btn-outline btn-sm" on:click={markAllAsRead}> Mark all as read </button>
		</div>
	</div>

	<!-- Filters section -->
	<div class="rounded-box bg-base-200 grid gap-4 p-4 sm:grid-cols-2">
		<!-- Type filter -->
		<div class="form-control">
			<label class="label">
				<span class="label-text">Filter by type</span>
			</label>
			<select class="select select-bordered w-full" bind:value={selectedType}>
				{#each types as type}
					<option value={type}>{type}</option>
				{/each}
			</select>
		</div>

		<!-- Unread filter -->
		<div class="form-control h-full items-end justify-end pt-4">
			<label class="label cursor-pointer gap-2">
				<span class="label-text">Show unread only</span>
				<input type="checkbox" class="toggle toggle-primary" bind:checked={showUnreadOnly} />
			</label>
		</div>
	</div>

	<!-- Alerts count -->
	<div class="stats shadow">
		<div class="stat">
			<div class="stat-title">Total Alerts</div>
			<div class="stat-value">{alerts.length}</div>
		</div>
		<div class="stat">
			<div class="stat-title">Unread Alerts</div>
			<div class="stat-value text-primary">{alerts.filter((a) => !a.isRead).length}</div>
		</div>
	</div>

	<!-- Alerts list -->
	<div class="flex flex-col gap-4">
		{#if filteredAlerts.length === 0}
			<div
				class="rounded-box bg-base-200 flex flex-col items-center justify-center p-8 text-center"
			>
				<div class="mb-4 text-5xl">🔔</div>
				<h3 class="text-lg font-bold">No Alerts Found</h3>
				<p class="text-base-content/70 mt-2">
					{showUnreadOnly
						? 'You have no unread alerts at the moment.'
						: 'Try adjusting your filters.'}
				</p>
			</div>
		{:else}
			{#each filteredAlerts as alert}
				<div class={`alert ${getAlertColor(alert.type)} ${alert.isRead ? 'opacity-80' : ''}`}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						class="h-6 w-6 shrink-0 stroke-current"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d={getAlertIcon(alert.type)}
						/>
					</svg>
					<div class="flex flex-1 flex-col items-start">
						<h3 class="font-bold">
							{alert.title}
							{#if !alert.isRead}
								<span class="badge badge-sm ml-2">NEW</span>
							{/if}
						</h3>
						<div class="text-sm">{alert.message}</div>
						<div class="mt-1 text-xs opacity-70">{alert.time}</div>
					</div>
					<div class="flex gap-2">
						{#if !alert.isRead}
							<button class="btn btn-circle btn-ghost btn-xs" on:click={() => markAsRead(alert.id)}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							</button>
						{/if}
						<a href={alert.actionUrl} class="btn btn-ghost btn-xs">View</a>
						<button class="btn btn-ghost btn-xs text-error" on:click={() => deleteAlert(alert.id)}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
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
			{/each}
		{/if}
	</div>
</div>
