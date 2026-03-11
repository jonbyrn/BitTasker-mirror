<script lang="ts">
	import { t } from 'svelte-i18n';
	import DashboardSavedTaskSearchesPanel from '$lib/components/task/DashboardSavedTaskSearchesPanel.svelte';
	import DashboardSavedServiceSearchesPanel from '$lib/components/service/DashboardSavedServiceSearchesPanel.svelte';

	type FilterType = 'tasks' | 'services';
	let filter = $state<FilterType>('tasks');
</script>

<div class="mb-4">
	<div class="flex gap-2" role="tablist" aria-label={$t('dashboard.saved_searches.filter_label')}>
		<button
			type="button"
			class="btn btn-sm {filter === 'tasks' ? 'btn-primary' : 'btn-ghost'}"
			role="tab"
			aria-selected={filter === 'tasks'}
			aria-controls="panel-saved-tasks"
			id="tab-saved-tasks"
			onclick={() => (filter = 'tasks')}
		>
			{$t('dashboard.saved_searches.tasks')}
		</button>
		<button
			type="button"
			class="btn btn-sm {filter === 'services' ? 'btn-primary' : 'btn-ghost'}"
			role="tab"
			aria-selected={filter === 'services'}
			aria-controls="panel-saved-services"
			id="tab-saved-services"
			onclick={() => (filter = 'services')}
		>
			{$t('dashboard.saved_searches.services')}
		</button>
	</div>
</div>

{#if filter === 'tasks'}
	<div
		id="panel-saved-tasks"
		role="tabpanel"
		aria-labelledby="tab-saved-tasks"
		tabindex="0"
	>
		<DashboardSavedTaskSearchesPanel />
	</div>
{:else}
	<div
		id="panel-saved-services"
		role="tabpanel"
		aria-labelledby="tab-saved-services"
		tabindex="0"
	>
		<DashboardSavedServiceSearchesPanel />
	</div>
{/if}
