<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';

	onMount(() => {
		goto(resolve('/(app)/(protected)/hiring/my-tasks'), { replaceState: true });
	});
</script>

<p class="text-base-content/70 p-6 text-sm">{$t('common.loading')}</p>
