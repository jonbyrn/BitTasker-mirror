<script lang="ts">
	import { MeStore } from '$houdini';
	import { onMount } from 'svelte';

	const userStore = new MeStore();

	onMount(async () => {
		await userStore.fetch();
		console.log($userStore.data);
	});

	let { isEditMode, toggleEditMode, saveProfile, logout } = $props<{
		isEditMode: boolean;
		toggleEditMode: () => void;
		saveProfile: () => void;
		logout: () => void;
	}>();

	// Local state for edit mode, initialized from user data
	let currentEditName = $state('');
	let currentEditBio = $state('');
	let currentEditLocation = $state('');

	// Sync local state when edit mode is toggled off (resetting changes)
	$effect(() => {
		if (!isEditMode && $userStore.data?.me) {
			currentEditName = $userStore.data.me.name || '';
			currentEditBio = $userStore.data.me.billingAddress?.city || '';
			currentEditLocation = $userStore.data.me.billingAddress?.country || '';
		}
	});

	// Update callbacks - might need to notify parent
	function updateName(event: Event) {
		const target = event.target as HTMLInputElement;
		currentEditName = target.value;
	}
	function updateBio(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		currentEditBio = target.value;
	}
	function updateLocation(event: Event) {
		const target = event.target as HTMLInputElement;
		currentEditLocation = target.value;
	}
</script>

<!-- Profile Header -->
<div class="mb-6 flex flex-col items-start justify-between md:flex-row md:items-center">
	{#if $userStore.fetching && !$userStore.data?.me}
		<!-- Loading State -->
		<div class="mb-4 flex items-center gap-4 md:mb-0">
			<div class="avatar placeholder animate-pulse">
				<div class="bg-base-300 w-20 rounded-full"></div>
			</div>
			<div class="space-y-2">
				<div class="bg-base-300 h-8 w-48 animate-pulse rounded"></div>
				<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<div class="bg-base-300 h-10 w-24 animate-pulse rounded"></div>
			<div class="bg-base-300 h-10 w-24 animate-pulse rounded"></div>
		</div>
	{:else if $userStore.data?.me && !$userStore.fetching}
		<div class="flex flex-col gap-4">
			<!-- Verification Banner -->
			{#if !$userStore.data.me.isEmailVerified}
				<div class="alert alert-warning mb-4 shadow-lg">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/></svg
					>
					<div>
						<h3 class="font-bold">Action Required!</h3>
						<div class="text-sm">Please verify your email address to unlock all features.</div>
					</div>
					<button class="btn btn-sm">Verify Now</button>
				</div>
			{/if}

			<!-- User Profile -->
			<div class="mb-4 flex items-center gap-4 md:mb-0">
				<div class="avatar placeholder">
					<div class="bg-primary text-primary-content w-20 rounded-full">
						<span class="text-2xl">{$userStore.data.me.name?.charAt(0) ?? 'U'}</span>
					</div>
				</div>
				<div>
					{#if isEditMode}
						<div class="form-control mb-1">
							<label for="name" class="label hidden">
								<span class="label-text">Name</span>
							</label>
							<input
								type="text"
								id="name"
								bind:value={currentEditName}
								oninput={updateName}
								class="input input-bordered input-sm w-full max-w-xs text-xl font-bold"
							/>
						</div>
						<div class="form-control mb-1">
							<label for="location" class="label hidden">
								<span class="label-text">Location</span>
							</label>
							<input
								type="text"
								id="location"
								bind:value={currentEditLocation}
								oninput={updateLocation}
								class="input input-bordered input-sm text-base-content/70 w-full max-w-xs"
							/>
						</div>
						<div class="form-control">
							<label for="bio" class="label hidden">
								<span class="label-text">Bio</span>
							</label>
							<textarea
								id="bio"
								bind:value={currentEditBio}
								oninput={updateBio}
								class="textarea textarea-bordered textarea-sm h-20 w-full max-w-xs"
								placeholder="Tell clients about yourself..."
							></textarea>
						</div>
					{:else}
						<div class="flex items-center gap-2">
							<h2 class="text-2xl font-bold">{$userStore.data.me.name}</h2>
							{#if $userStore.data.me.userRole === 'FREELANCER'}
								<div class="badge badge-primary">Freelancer</div>
							{:else if $userStore.data.me.userRole === 'CLIENT'}
								<div class="badge badge-secondary">Client</div>
							{:else if $userStore.data.me.userRole === 'BOTH'}
								<div class="badge badge-accent">Freelancer & Client</div>
							{/if}
						</div>
						<p class="text-base-content/70 flex items-center gap-2">
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
									d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							{$userStore.data.me.billingAddress?.city}, {$userStore.data.me.billingAddress
								?.country}
						</p>
					{/if}
				</div>
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="btn btn-primary" onclick={toggleEditMode}>
				{isEditMode ? 'Cancel' : 'Edit Profile'}
			</button>
			{#if isEditMode}
				<button class="btn btn-primary" onclick={saveProfile}> Save Changes </button>
			{/if}
			<button class="btn btn-primary" onclick={logout}>Logout</button>
		</div>
	{:else if $userStore.errors}
		<!-- Error State -->
		<div class="alert alert-error">
			<span>Failed to load user data. Please try again later.</span>
		</div>
	{/if}
</div>
