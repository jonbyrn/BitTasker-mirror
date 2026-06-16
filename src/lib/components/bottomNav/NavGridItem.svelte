<script lang="ts">
	import { onMount } from 'svelte';
	import { animatePress, animatePressRelease } from '$lib/utils/animations';
	import type { IconComponent } from '$lib/utils/constants/menu.constants';

	let {
		Icon,
		label,
		variant,
		onclick
	}: {
		Icon: IconComponent;
		label: string;
		variant?: 'danger';
		onclick: () => void;
	} = $props();

	let el = $state<HTMLElement | null>(null);

	onMount(() => {
		if (!el) return;
		const handleDown = () => animatePress(el!);
		const handleUp = () => animatePressRelease(el!);
		el.addEventListener('pointerdown', handleDown);
		el.addEventListener('pointerup', handleUp);
		el.addEventListener('pointerleave', handleUp);
		return () => {
			el?.removeEventListener('pointerdown', handleDown);
			el?.removeEventListener('pointerup', handleUp);
			el?.removeEventListener('pointerleave', handleUp);
		};
	});
</script>

<button
	bind:this={el}
	class="nav-grid-item"
	class:nav-grid-item-danger={variant === 'danger'}
	{onclick}
	type="button"
>
	<Icon class="nav-grid-icon text-primary" />
	<span class="nav-grid-label">{label}</span>
</button>

<style>
	.nav-grid-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.75rem 0.5rem;
		border-radius: 0.75rem;
		background: hsl(var(--b2) / 0.5);
		border: 1px solid hsl(var(--b3) / 0.3);
		min-height: 72px;
		cursor: pointer;
		transition: background 150ms ease;
		-webkit-tap-highlight-color: transparent;
		will-change: transform;
	}

	.nav-grid-item:hover {
		background: hsl(var(--b2));
	}

	.nav-grid-item-danger {
		background: hsl(var(--er) / 0.06);
		border-color: hsl(var(--er) / 0.15);
	}

	.nav-grid-item-danger:hover {
		background: hsl(var(--er) / 0.1);
	}

	:global(.nav-grid-icon) {
		width: 24px;
		height: 24px;
	}

	.nav-grid-item-danger :global(.nav-grid-icon) {
		color: hsl(var(--er)) !important;
	}

	.nav-grid-label {
		font-size: 0.6875rem;
		font-weight: 500;
		text-align: center;
		line-height: 1.2;
		color: hsl(var(--bc));
	}

	.nav-grid-item-danger .nav-grid-label {
		color: hsl(var(--er));
	}

	@media (prefers-reduced-motion: reduce) {
		.nav-grid-item {
			transition: none;
		}
	}
</style>
