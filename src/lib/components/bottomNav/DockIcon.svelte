<script lang="ts">
	import { onMount } from 'svelte';
	import { animateIconTap } from '$lib/utils/animations';
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

	let el = $state<HTMLElement | null>(null);

	onMount(() => {
		if (!el) return;
		const handleClick = () => animateIconTap(el!);
		el.addEventListener('click', handleClick);
		return () => el?.removeEventListener('click', handleClick);
	});
</script>

<a
	bind:this={el}
	{href}
	class="dock-link hover:bg-primary-content/10 flex min-h-[48px] min-w-[48px] flex-col items-center gap-1 rounded-lg transition-colors"
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
		transition: transform 120ms cubic-bezier(0.2, 0, 0, 1);
		will-change: transform;
		-webkit-tap-highlight-color: transparent;
	}

	.dock-link:active {
		transform: scale(0.88);
	}

	.dock-label {
		white-space: nowrap;
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
		animation: activeIndicator 300ms cubic-bezier(0.2, 0, 0, 1) forwards;
	}

	@keyframes activeIndicator {
		from {
			width: 0;
			opacity: 0;
		}
		to {
			width: 20px;
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dock-link:active {
			transform: none;
		}
		.dock-active::before {
			animation: none;
			width: 20px;
			opacity: 1;
		}
	}
</style>
