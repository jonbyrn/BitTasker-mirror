<script lang="ts">
	import type { Component } from 'svelte';

	type IconComponent = Component<{ class?: string; 'aria-hidden'?: string }>;

	let {
		icon,
		title,
		description,
		actionLabel = null,
		actionHref = null,
		actionIcon = null,
		onAction,
		testId = null
	}: {
		icon?: IconComponent | null;
		title: string;
		description?: string | null;
		actionLabel?: string | null;
		actionHref?: string | null;
		actionIcon?: IconComponent | null;
		onAction?: (() => void) | undefined;
		testId?: string | null;
	} = $props();

	const ctaIcon = $derived(actionIcon ?? icon ?? null);
</script>

<div class="py-8 text-center" data-testid={testId ?? undefined}>
	{#if icon}
		{@const Icon = icon}
		<Icon class="text-primary mx-auto mb-3 h-12 w-12" aria-hidden="true" />
	{/if}

	<p class="text-lg font-medium">{title}</p>

	{#if description}
		<p class="text-base-content/60 mx-auto mb-4 max-w-md">{description}</p>
	{/if}

	{#if actionLabel}
		{#if actionHref}
			<a href={actionHref} class="btn btn-primary gap-2">
				{#if ctaIcon}
					{@const ActionIcon = ctaIcon}
					<ActionIcon class="h-5 w-5" aria-hidden="true" />
				{/if}
				{actionLabel}
			</a>
		{:else if onAction}
			<button type="button" class="btn btn-primary gap-2" onclick={onAction}>
				{#if ctaIcon}
					{@const ActionIcon = ctaIcon}
					<ActionIcon class="h-5 w-5" aria-hidden="true" />
				{/if}
				{actionLabel}
			</button>
		{/if}
	{/if}
</div>
