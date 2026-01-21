<script lang="ts">
	import { appStore } from '$lib/stores/app.store';
	import { fade } from 'svelte/transition';
</script>

<!-- Ensure Toast has the highest z-index and is positioned at center bottom -->
<div
	class="toast toast-bottom fixed z-[200] left-1/2 transform -translate-x-1/2"
	style="bottom: calc(var(--app-footer-height, 0px) + 1rem);"
>
	{#each $appStore.toasts as toast (toast.id)}
		<div
			class="alert {toast.type === 'success'
				? 'alert-success'
				: toast.type === 'error'
					? 'alert-error'
					: 'alert-info'}"
			in:fade={{ duration: 150 }}
			out:fade={{ duration: 150 }}
		>
			<span>{toast.message}</span>
		</div>
	{/each}
</div>
