<script lang="ts">
	const {
		start = undefined,
		end = undefined,
		deadlineDate = undefined,
		filterMode = 'deadline'
	} = $props<{
		start?: string | undefined;
		end?: string | undefined;
		deadlineDate?: string | undefined;
		filterMode?: 'date_range' | 'deadline';
	}>();
</script>

<div data-testid="availability-filter">
	{filterMode}:{start || end || deadlineDate || ''}
</div>
