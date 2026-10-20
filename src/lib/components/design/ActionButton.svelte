<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'success' | 'error';

	let {
		variant = 'primary',
		pending = false,
		pendingLabel = 'Working…',
		type = 'button',
		disabled = false,
		class: className = '',
		onclick,
		children,
		...rest
	}: {
		variant?: Variant;
		pending?: boolean;
		pendingLabel?: string;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		class?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
	} & Omit<HTMLButtonAttributes, 'class' | 'type' | 'disabled' | 'onclick'> = $props();

	const variantClass: Record<Variant, string> = {
		primary: 'btn-primary',
		secondary: 'btn-secondary',
		outline: 'btn-outline',
		ghost: 'btn-ghost',
		success: 'btn-success',
		error: 'btn-error'
	};

	function handleClick(event: MouseEvent) {
		if (pending || disabled) {
			event.preventDefault();
			return;
		}
		onclick?.(event);
	}
</script>

<button
	{...rest}
	{type}
	class="btn ui-action {variantClass[variant]} {className}"
	disabled={disabled || pending}
	aria-busy={pending}
	onclick={handleClick}
>
	{#if pending}
		<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
		<span>{pendingLabel}</span>
	{:else}
		{@render children?.()}
	{/if}
</button>
