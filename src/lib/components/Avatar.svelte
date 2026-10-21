<script lang="ts">
	/**
	 * Avatar Component
	 *
	 * Displays a user's avatar, with fallback to initials in a colored badge if no image is available
	 * Lazy loads user data and Nostr libraries only when authenticated
	 */
	import { user } from '$lib/stores/user.store';
	import { isPlaceholderName } from '$lib/utils/helpers/account-username';

	// Define the component props
	let {
		size = 'md',
		picture,
		name
	}: {
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
		picture?: string | string[];
		name?: string;
	} = $props();

	// State for image loading and user data
	let imageError = $state(false);

	// Keep the fuller name. A one-word label and a two-word label would otherwise flip D and DR.
	let stableName = $state('');
	$effect(() => {
		const next = (name || $user.name || '').trim();
		if (!next) return;
		const words = (value: string) => value.split(/\s+/).filter(Boolean).length;
		if (!stableName || words(next) > words(stableName)) stableName = next;
	});
	let userName = $derived.by(() => {
		const next = (stableName || name || $user.name || '').trim();
		return isPlaceholderName(next) ? '' : next;
	});
	let userPicture = $derived(
		picture ? (Array.isArray(picture) ? (picture[0] ?? null) : picture) : null
	);

	// Get user initials for badge
	function getUserInitials(name: string): string {
		if (!name) return '-';

		const nameParts = name.split(' ');
		if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase();

		return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
	}

	// Generate random color based on name
	function getRandomColor(name: string): string {
		const colors = [
			'bg-primary text-primary-content',
			'bg-neutral text-neutral-content',
			'bg-info text-info-content',
			'bg-accent text-accent-content'
		];
		if (!name) return colors[0];

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
				return 'w-40 h-40 text-4xl';
			default:
				return 'w-10 h-10 text-base';
		}
	}
</script>

<!-- Loading state -->
<!-- <div class="overflow-hidden rounded-full {getSizeClass(size)} relative">
	<div class="bg-base-300 absolute inset-0 flex animate-pulse items-center justify-center">
		<div class="loading loading-spinner loading-xs"></div>
	</div>
</div> -->
{#if userPicture && !imageError}
	<!-- Show user image if available and no error -->
	<div class="bt-avatar relative overflow-hidden rounded-full {getSizeClass(size)}">
		<img
			src={userPicture}
			alt={userName}
			class="h-full w-full object-cover"
			onerror={() => (imageError = true)}
		/>
	</div>
{:else}
	<!-- Show initials badge as fallback -->
	<div
		class="avatar placeholder bt-avatar flex h-5 w-5 items-center justify-center overflow-hidden rounded-full text-center {getSizeClass(
			size
		)} {getRandomColor(userName || '')}"
	>
		{#if userName}
			<span>{getUserInitials(userName)}</span>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" width="50%" height="50%" viewBox="0 0 24 24">
				<g fill="none" stroke="currentColor" stroke-width="1.5">
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
