<script lang="ts">
	import type { Snippet } from 'svelte';
	import ActionButton from './ActionButton.svelte';
	import SurfaceCard from './SurfaceCard.svelte';

	let {
		status,
		title,
		message = '',
		actionLabel = '',
		pending = false,
		onAction,
		children
	}: {
		status: 'loading' | 'empty' | 'error' | 'ready';
		title: string;
		message?: string;
		actionLabel?: string;
		pending?: boolean;
		onAction?: () => void;
		children?: Snippet;
	} = $props();
</script>

{#if status === 'loading'}
	<div role="status" aria-busy="true">
		<SurfaceCard>
			<div class="ui-skeleton h-4 w-2/3"></div>
			<div class="ui-skeleton h-4 w-full"></div>
			<div class="ui-skeleton h-4 w-1/2"></div>
			<span class="sr-only">{title}</span>
		</SurfaceCard>
	</div>
{:else if status === 'empty'}
	<div role="status">
		<SurfaceCard>
			<p class="text-lg font-medium">{title}</p>
			{#if message}
				<p class="text-base-content/80 text-sm">{message}</p>
			{/if}
			{#if actionLabel && onAction}
				<ActionButton variant="outline" {pending} onclick={onAction}>{actionLabel}</ActionButton>
			{/if}
		</SurfaceCard>
	</div>
{:else if status === 'error'}
	<div class="alert alert-outline alert-error flex-col items-start gap-3" role="alert">
		<div>
			<p class="font-medium">{title}</p>
			{#if message}
				<p>{message}</p>
			{/if}
		</div>
		{#if actionLabel && onAction}
			<ActionButton variant="outline" {pending} pendingLabel="Retrying…" onclick={onAction}>
				{actionLabel}
			</ActionButton>
		{/if}
	</div>
{:else}
	{@render children?.()}
{/if}
