<script lang="ts">
	import type { IconComponent } from '$lib/utils/constants/menu.constants';

	let {
		href,
		Icon,
		label,
		isActive = false
	}: {
		href: string;
		Icon: IconComponent;
		label: string;
		isActive?: boolean;
	} = $props();
</script>

<a
	{href}
	class="dock-link hover:bg-primary-content/10 flex min-h-12 min-w-0 flex-1 flex-col items-center gap-1 rounded-lg transition-colors"
	class:dock-active={isActive}
	aria-current={isActive ? 'page' : undefined}
	data-sveltekit-reload="off"
>
	<Icon class="text-primary-content" />
	<span class="dock-label text-primary-content text-xs font-medium">{label}</span>
</a>

<style>
	.dock-link {
		position: relative;
		transition: opacity 160ms cubic-bezier(0.2, 0, 0, 1);
		-webkit-tap-highlight-color: transparent;
	}

	.dock-link:active {
		opacity: 0.7;
	}

	.dock-label {
		max-width: 100%;
		overflow-wrap: anywhere;
		text-align: center;
		line-height: 1.1;
	}

	.dock-active::before {
		content: '';
		position: absolute;
		top: 2px;
		left: 50%;
		transform: translateX(-50%);
		width: 20px;
		height: 3px;
		border-radius: 9999px;
		background: hsl(var(--pc));
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.dock-link:active {
			opacity: 1;
		}
	}
</style>
