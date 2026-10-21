<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { animatePress, animatePressRelease } from '$lib/utils/animations';
	import type { IconComponent } from '$lib/utils/constants/menu.constants';

	let {
		Icon,
		label,
		variant,
		isGroup,
		onclick
	}: {
		Icon: IconComponent;
		label: string;
		variant?: 'danger';
		isGroup?: boolean;
		onclick: () => void;
	} = $props();

	const press: Attachment = (node) => {
		if (!(node instanceof HTMLElement)) return;
		const handleDown = () => animatePress(node);
		const handleUp = () => animatePressRelease(node);
		node.addEventListener('pointerdown', handleDown);
		node.addEventListener('pointerup', handleUp);
		node.addEventListener('pointerleave', handleUp);
		return () => {
			node.removeEventListener('pointerdown', handleDown);
			node.removeEventListener('pointerup', handleUp);
			node.removeEventListener('pointerleave', handleUp);
		};
	};
</script>

<button
	{@attach press}
	class="nav-grid-item"
	class:nav-grid-item-danger={variant === 'danger'}
	data-group={isGroup ? 'true' : undefined}
	{onclick}
	type="button"
>
	<div class="nav-grid-icon-wrap">
		<Icon class="nav-grid-icon text-primary" />
	</div>
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
		min-height: 72px;
		cursor: pointer;
		transition: background 150ms ease;
		-webkit-tap-highlight-color: transparent;
		will-change: transform;
	}

	.nav-grid-item:hover {
		background: color-mix(in srgb, var(--color-base-content), transparent 92%);
	}

	.nav-grid-item-danger {
		color: var(--color-error);
	}

	.nav-grid-item-danger:hover {
		background: hsl(var(--er) / 0.1);
	}

	:global(.nav-grid-icon) {
		width: 24px;
		height: 24px;
	}

	.nav-grid-item-danger :global(.nav-grid-icon) {
		color: var(--color-error) !important;
	}

	.nav-grid-label {
		font-size: 0.6875rem;
		font-weight: 500;
		text-align: center;
		line-height: 1.2;
		color: var(--color-base-content);
	}

	.nav-grid-icon-wrap {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
	}

	.nav-grid-item-danger .nav-grid-label {
		color: var(--color-error);
	}

	@media (prefers-reduced-motion: reduce) {
		.nav-grid-item {
			transition: none;
		}
	}
</style>
