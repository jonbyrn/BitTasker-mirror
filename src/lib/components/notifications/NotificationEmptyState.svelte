<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconBellCheck from '~icons/mdi/bell-check-outline';

	let { compact = false }: { compact?: boolean } = $props();
</script>

<div class="flex flex-col items-center justify-center {compact ? 'px-4 py-8' : 'py-16'}">
	<IconBellCheck class="text-base-content/20 mb-3 {compact ? 'h-8 w-8' : 'h-12 w-12'}" />
	<p class="text-base-content/60 text-sm font-medium">
		{$t('notifications.all_caught_up')}
	</p>
</div>
