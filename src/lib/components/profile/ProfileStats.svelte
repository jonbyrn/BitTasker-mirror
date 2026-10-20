<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconStar from '~icons/mdi/star';

	let { stats, serviceCountState = 'ready' } = $props<{
		stats: {
			tasksCompleted: number;
			contractsCompleted: number;
			activeServices: number;
			rating: number;
			responseRate: number;
			onTimeRate: number;
		};
		serviceCountState?: 'loading' | 'ready' | 'error';
	}>();
</script>

<!-- Stats Cards -->
<div class="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-6" data-testid="profile-reputation-stats">
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
				<span class="text-base-content/70 text-sm">{$t('stats.contractsCompleted')}</span>
				<span class="text-primary text-lg font-bold" data-testid="profile-stats-contracts-completed">{stats.contractsCompleted}</span>
			</div>
		</div>
	</div>
	<div class="card bg-base-200 w-full rounded-2xl shadow-lg">
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<span class="text-base-content/70 text-sm">{$t('stats.rating')}</span>
				<div class="flex items-center gap-1">
					<span class="text-primary text-lg font-bold">{stats.rating}</span>
					<IconStar class="text-primary h-4 w-4" />
				</div>
			</div>
		</div>
	</div>
	<div class="card bg-base-200 w-full rounded-2xl shadow-lg">
		<div class="card-body p-4">
			<div class="flex items-center justify-between gap-3">
				<span class="text-base-content/70 text-sm">{$t('stats.activeServices')}</span>
				{#if serviceCountState === 'loading'}
					<span
						class="text-base-content/60 text-sm font-semibold"
						data-testid="profile-stats-active-services"
						>{$t('profile.services_summary.count_loading')}</span
					>
				{:else if serviceCountState === 'error'}
					<span
						class="text-warning text-sm font-semibold"
						data-testid="profile-stats-active-services"
						>{$t('profile.services_summary.count_unavailable')}</span
					>
				{:else}
					<span class="text-primary text-lg font-bold" data-testid="profile-stats-active-services"
						>{stats.activeServices}</span
					>
				{/if}
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
