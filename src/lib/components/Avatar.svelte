<script lang="ts">
	/**
	 * Avatar Component
	 *
	 * Displays a user's avatar, with fallback to initials in a colored badge if no image is available
	 */

	// Define the component props
	const props = $props<{
		user: {
			name: string;
			profileImage: string | null;
		};
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		onClick?: () => void;
	}>();

	// Set defaults
	const size = props.size || 'md';

	// Get user initials for badge
	function getUserInitials(name: string): string {
		if (!name) return '?';

		const nameParts = name.split(' ');
		if (nameParts.length === 1) return nameParts[0].charAt(0).toUpperCase();

		return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
	}

	// Generate random color based on name
	function getRandomColor(name: string): string {
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
			default:
				return 'w-10 h-10 text-base';
		}
	}
</script>

{#if props.user.profileImage}
	<!-- Show user image if available -->
	<button
		class="overflow-hidden rounded-full {getSizeClass(size)} cursor-pointer"
		onclick={props.onClick}
	>
		<img src={props.user.profileImage} alt={props.user.name} class="h-full w-full object-cover" />
	</button>
{:else}
	<!-- Show initials badge as fallback -->
	<button
		class="avatar placeholder text-neutral-content flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-full text-center {getSizeClass(
			size
		)} {getRandomColor(props.user.name)}"
		onclick={props.onClick}
	>
		<span>{getUserInitials(props.user.name)}</span>
	</button>
{/if}
