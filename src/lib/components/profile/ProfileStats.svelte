<script lang="ts">
	import { t } from 'svelte-i18n';
	let { stats } = $props<{
		stats: {
			tasksCompleted: number;
			rating: number;
			responseRate: number;
			onTimeRate: number;
		};
	}>();
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
			<div class="flex items-center justify-between">
				<span class="text-base-content/70 text-sm">{$t('stats.rating')}</span>
				<div class="flex items-center gap-1">
					<span class="text-primary text-lg font-bold">{stats.rating}</span>
					<svg
						class="h-4 w-4 text-primary"
						fill="currentColor"
						viewBox="0 0 20 20"
					>
						<path
							fill-rule="evenodd"
							d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
							clip-rule="evenodd"
						/>
					</svg>
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
