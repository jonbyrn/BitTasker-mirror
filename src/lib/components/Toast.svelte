<script lang="ts">
	import { appStore } from '$lib/stores/app.store';
	import { fade } from 'svelte/transition';

	const toasts = $appStore.toasts;
</script>

{#if toasts.length > 0}
	<div class="toast toast-end">
		{#each toasts as toast (toast.id)}
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
{/if}
