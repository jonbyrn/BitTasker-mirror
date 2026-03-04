<script lang="ts">
	import { t } from 'svelte-i18n';
	import StarRating from '$lib/components/reviews/StarRating.svelte';

	let { stats } = $props<{
		stats: {
			tasksCompleted: number;
			rating: number;
			responseRate: number;
			onTimeRate: number;
		};
	}>();

	const displayRating = $derived(
		typeof stats.rating === 'number' && Number.isFinite(stats.rating)
			? Math.round(stats.rating * 10) / 10
			: 0
	);
</script>

<!-- Stats Cards -->
<div class="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
	<div class="card bg-base-200 w-full rounded-2xl shadow-lg">
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<span class="text-base-content/70 text-sm">{$t('stats.tasksCompleted')}</span>
				<span class="text-primary text-lg font-bold">{stats.tasksCompleted}</span>
			</div>
		</div>
	</div>
	<div class="card bg-base-200 w-full rounded-2xl shadow-lg">
		<div class="card-body p-4">
			<div class="flex items-center justify-between gap-2 min-w-0">
				<span class="text-base-content/70 text-sm shrink-0">{$t('stats.rating')}</span>
				<div class="flex items-center gap-1 min-w-0">
					<span class="text-primary text-lg font-bold tabular-nums">{displayRating.toFixed(1)}</span>
					<StarRating value={displayRating} size="sm" unfilledClass="text-base-content/20" />
				</div>
			</div>
		</div>
	</div>
	<div class="card bg-base-200 w-full rounded-2xl shadow-lg">
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<span class="text-base-content/70 text-sm">{$t('stats.responseRate')}</span>
				<span class="text-success text-lg font-bold">{stats.responseRate}%</span>
			</div>
		</div>
	</div>
	<div class="card bg-base-200 w-full rounded-2xl shadow-lg">
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<span class="text-base-content/70 text-sm">{$t('stats.onTimeRate')}</span>
				<span class="text-info text-lg font-bold">{stats.onTimeRate}%</span>
			</div>
		</div>
	</div>
</div>
