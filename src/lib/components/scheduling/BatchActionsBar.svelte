<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';

	const props = $props<{
		selectedCount: number;
		onAcceptAll?: () => void;
		onRejectAll?: () => void;
		onRescheduleAll?: () => void;
		onClearSelection?: () => void;
	}>();

	let showActions = $state(false);

	$effect(() => {
		showActions = props.selectedCount > 0;
	});
</script>

{#if showActions}
	<div
		class="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-base-100 shadow-2xl border border-base-300 rounded-box p-4 pb-safe min-h-[44px]"
		transition:fly={{ y: 100, duration: 300 }}
	>
		<div class="flex items-center gap-4">
			<!-- Selection count -->
			<div class="badge badge-primary badge-lg">
				{$t('scheduling.selected_count', { count: props.selectedCount })}
			</div>

			<!-- Actions -->
			<div class="flex gap-2">
				{#if props.onAcceptAll}
					<button class="btn btn-success btn-sm min-h-[44px] min-w-[44px]" onclick={props.onAcceptAll} aria-label={$t('scheduling.accept_all')}>
						{$t('scheduling.accept_all')}
					</button>
				{/if}
				{#if props.onRescheduleAll}
					<button class="btn btn-info btn-sm min-h-[44px] min-w-[44px]" onclick={props.onRescheduleAll} aria-label={$t('scheduling.reschedule_all')}>
						{$t('scheduling.reschedule_all')}
					</button>
				{/if}
				{#if props.onRejectAll}
					<button class="btn btn-error btn-sm min-h-[44px] min-w-[44px]" onclick={props.onRejectAll} aria-label={$t('scheduling.reject_all')}>
						{$t('scheduling.reject_all')}
					</button>
				{/if}
				{#if props.onClearSelection}
					<button class="btn btn-ghost btn-sm min-h-[44px] min-w-[44px]" onclick={props.onClearSelection} aria-label={$t('common.buttons.clear')}>
						{$t('common.buttons.clear')}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

