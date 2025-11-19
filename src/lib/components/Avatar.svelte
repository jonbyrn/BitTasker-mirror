<script lang="ts">
	/**
	 * Avatar Component
	 *
	 * Displays a user's avatar, with fallback to initials in a colored badge if no image is available
	 * Lazy loads user data and Nostr libraries only when authenticated
	 */
	import { profileStore } from '$lib/stores/profile.store';
	import { user } from '$lib/stores/user.store';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';

	// Define the component props
	const props = $props<{
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
		loading?: boolean;
		onClick?: () => void;
		pubkey?: string;
		picture?: string | string[];
		name?: string;
		professionalTitle?: string;
		website?: string;
	}>();

	// Set defaults
	const size = props.size || 'md';

	// State for image loading and user data
	let imageError = $state(false);
	let userData = $state<{ name: string; picture: string | null } | null>(null);
	let isLoading = $state(true);

	// Reactive derived values that update when stores change
	let userName = $derived(props.name || $profileStore.data?.name || $user.name || '');
	let userPicture = $derived(props.picture || null);

	// Update userData when derived values change
	$effect(() => {
		userData = {
			name: userName,
			picture: userPicture
		};
	});

	// Initialize userData immediately with props
	onMount(() => {
		userData = {
			name: userName,
			picture: userPicture
		};
		isLoading = false;
	});

	// Get user initials for badge
	function getUserInitials(name: string): string {
		if (!name) return '-';

		const nameParts = name.split(' ');
		if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase();

		return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
	}

	// Generate random color based on name
	function getRandomColor(name: string): string {
		if (!name) return 'bg-primary';

		const colors = [
			'bg-primary',
			'bg-secondary',
			'bg-accent',
			'bg-info',
			'bg-success',
			'bg-warning'
		];

		// Simple hash function to get consistent color for the same name
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = (hash + name.charCodeAt(i)) % colors.length;
		}

		return colors[hash];
	}

	// Get size class based on size prop
	function getSizeClass(size: string): string {
		switch (size) {
			case 'xs':
				return 'w-6 h-6 text-xs';
			case 'sm':
				return 'w-8 h-8 text-sm';
			case 'md':
				return 'w-10 h-10 text-base';
			case 'lg':
				return 'w-16 h-16 text-xl';
			case 'xl':
				return 'w-24 h-24 text-2xl';
			case '2xl':
				return 'w-32 h-32 text-3xl';
			default:
				return 'w-10 h-10 text-base';
		}
	}
</script>

{#if isLoading}
	<!-- Loading state -->
	<div
		class="overflow-hidden rounded-full {getSizeClass(size)} relative"
	>
		<div class="bg-base-300 absolute inset-0 flex animate-pulse items-center justify-center">
			<div class="loading loading-spinner loading-xs"></div>
		</div>
	</div>
{:else if userData?.picture && !imageError}
	<!-- Show user image if available and no error -->
	<div
		class="overflow-hidden rounded-full {getSizeClass(size)} relative"
	>
		<img
			src={userData.picture}
			alt={userData.name}
			class="h-full w-full object-cover"
			onerror={() => (imageError = true)}
		/>
	</div>
{:else}
	<!-- Show initials badge as fallback -->
	<div
		class="avatar placeholder text-neutral-content flex h-5 w-5 items-center justify-center overflow-hidden rounded-full text-center {getSizeClass(
			size
		)} {getRandomColor(userData?.name || '')}"
	>
		{#if userData?.name}
			<span>{getUserInitials(userData.name)}</span>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" width="50%" height="50%" viewBox="0 0 24 24">
				<g fill="none" stroke="black" stroke-width="1.5">
					<circle cx="12" cy="6" r="4" />
					<path
						stroke-linecap="round"
						d="M19.998 18q.002-.246.002-.5c0-2.485-3.582-4.5-8-4.5s-8 2.015-8 4.5S4 22 12 22c2.231 0 3.84-.157 5-.437"
					/>
				</g>
			</svg>
		{/if}
	</div>
{/if}
