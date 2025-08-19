<script lang="ts">
	import { appStore } from '$lib/stores/app.store';
	import { fade } from 'svelte/transition';

	const toasts = $derived($appStore.toasts);
</script>

<!-- Ensure Toast has the highest z-index -->
<div class="toast toast-top fixed z-[99999]">
	{#each toasts as toast (toast.id)}
		<div
			class="alert alert-outline bg-base-100/80 border-2 backdrop-blur-md {toast.type === 'success'
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
