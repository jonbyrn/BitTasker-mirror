<script lang="ts">
	import type { Task } from '$lib/types/task';

	const { task } = $props<{
		task: Task;
		btcPrice?: number;
		activeFilter?: string;
		getActionButtons?: unknown;
	}>();
</script>

<div data-testid="task-card">{task.title}</div>
