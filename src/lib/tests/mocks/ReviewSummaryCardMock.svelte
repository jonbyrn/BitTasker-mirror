<script lang="ts">
	let { stats, revieweeRole = null } = $props<{
		stats: { totalReviews: number };
		revieweeRole?: 'tasker' | 'taskee' | null;
	}>();
</script>

<div data-testid="review-summary">summary:{stats.totalReviews} role:{revieweeRole ?? 'none'}</div>
