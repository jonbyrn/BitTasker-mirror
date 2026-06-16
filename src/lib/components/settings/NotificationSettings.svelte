<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
	import type { NotificationPreferencesExtended } from '$lib/types/notification';
	import { appStore } from '$lib/stores/app.store';

	const NOTIFICATION_CATEGORIES: Array<[keyof NotificationPreferencesExtended, string]> = [
		['contractUpdates', 'contract'],
		['bidUpdates', 'bid'],
		['taskMatches', 'task'],
		['messageNotifications', 'message'],
		['reviewNotifications', 'review'],
		['serviceNotifications', 'service'],
		['walletNotifications', 'wallet'],
		['securityAlerts', 'security'],
		['discoveryNotifications', 'discovery'],
		['reengagementNotifications', 'reengagement']
	];

	const FIELD_I18N: Record<string, string> = {
		pushEnabled: 'notifications.settings.push',
		emailEnabled: 'notifications.settings.email',
		quietHoursEnabled: 'notifications.settings.quiet_hours_enabled',
		quietHoursStart: 'notifications.settings.quiet_hours_start',
		quietHoursEnd: 'notifications.settings.quiet_hours_end',
		contractUpdates: 'notifications.types.contract',
		bidUpdates: 'notifications.types.bid',
		taskMatches: 'notifications.types.task',
		messageNotifications: 'notifications.types.message',
		reviewNotifications: 'notifications.types.review',
		serviceNotifications: 'notifications.types.service',
		walletNotifications: 'notifications.types.wallet',
		securityAlerts: 'notifications.types.security',
		discoveryNotifications: 'notifications.types.discovery',
		reengagementNotifications: 'notifications.types.reengagement'
	};

	let prefs = $state<NotificationPreferencesExtended | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expanded = $state(false);
	let savingField = $state<string | null>(null);

	onMount(async () => {
		try {
			prefs = await notificationCenterService.getPreferences();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load preferences';
		} finally {
			loading = false;
		}
	});

	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	function debouncedSave(field: string, newValue: boolean | string) {
		if (saveTimeout) clearTimeout(saveTimeout);
		savingField = field;
		saveTimeout = setTimeout(async () => {
			if (!prefs) return;
			try {
				await notificationCenterService.updatePreferences(prefs);
				const labelKey = FIELD_I18N[field];
				const label = labelKey ? $t(labelKey) : field;
				if (typeof newValue === 'boolean') {
					const state = newValue
						? $t('notifications.success.enabled')
						: $t('notifications.success.disabled');
					appStore.showSuccessToast(`${label} ${state}`);
				} else {
					appStore.showSuccessToast(`${label} ${$t('notifications.success.updated')}`);
				}
			} catch {
				appStore.showErrorToast($t('notifications.errors.settings_error'));
			} finally {
				savingField = null;
			}
		}, 500);
	}

	function toggleField(field: keyof NotificationPreferencesExtended) {
		if (!prefs || typeof prefs[field] !== 'boolean') return;
		const newValue = !prefs[field];
		prefs = { ...prefs, [field]: newValue };
		debouncedSave(field, newValue);
	}

	function updateField(field: keyof NotificationPreferencesExtended, value: string) {
		if (!prefs) return;
		prefs = { ...prefs, [field]: value };
		debouncedSave(field, value);
	}
</script>

{#if error}
	<div class="alert alert-error alert-outline text-sm">
		<span>{error}</span>
	</div>
{:else}
	<div
		class="collapse-arrow bg-base-100 collapse mb-6 rounded-lg shadow-xl"
		class:collapse-open={expanded}
	>
		<button
			type="button"
			class="collapse-title border-base-300 flex items-center gap-2 border-b text-left"
			onclick={() => (expanded = !expanded)}
		>
			<h4 class="text-lg font-semibold">{$t('notifications.settings.title')}</h4>
		</button>
		<div class="collapse-content">
			{#if loading}
				<div class="flex items-center justify-center py-4">
					<span class="loading loading-spinner loading-sm"></span>
				</div>
			{:else if prefs}
				<div class="space-y-6 pt-2">
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-sm">{$t('notifications.settings.push')}</span>
							<div class="flex items-center gap-2">
								{#if savingField === 'pushEnabled'}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								<input
									type="checkbox"
									class="toggle toggle-primary toggle-sm"
									checked={prefs.pushEnabled}
									onchange={() => toggleField('pushEnabled')}
								/>
							</div>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm">{$t('notifications.settings.email')}</span>
							<div class="flex items-center gap-2">
								{#if savingField === 'emailEnabled'}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								<input
									type="checkbox"
									class="toggle toggle-primary toggle-sm"
									checked={prefs.emailEnabled}
									onchange={() => toggleField('emailEnabled')}
								/>
							</div>
						</div>
					</div>

					<div class="divider my-0"></div>

					<div class="space-y-3">
						<h5 class="text-sm font-semibold">{$t('notifications.settings.quiet_hours')}</h5>
						<div class="flex items-center justify-between">
							<span class="text-sm">{$t('notifications.settings.quiet_hours_enabled')}</span>
							<div class="flex items-center gap-2">
								{#if savingField === 'quietHoursEnabled'}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								<input
									type="checkbox"
									class="toggle toggle-primary toggle-sm"
									checked={prefs.quietHoursEnabled}
									onchange={() => toggleField('quietHoursEnabled')}
								/>
							</div>
						</div>
						{#if prefs.quietHoursEnabled}
							<div class="flex items-center gap-4">
								<label class="flex items-center gap-2">
									<span class="text-xs">{$t('notifications.settings.quiet_hours_start')}</span>
									<input
										type="time"
										class="input input-sm input-bordered w-24"
										value={prefs.quietHoursStart}
										onchange={(e) => updateField('quietHoursStart', e.currentTarget.value)}
									/>
								</label>
								<label class="flex items-center gap-2">
									<span class="text-xs">{$t('notifications.settings.quiet_hours_end')}</span>
									<input
										type="time"
										class="input input-sm input-bordered w-24"
										value={prefs.quietHoursEnd}
										onchange={(e) => updateField('quietHoursEnd', e.currentTarget.value)}
									/>
								</label>
							</div>
						{/if}
					</div>

					<div class="divider my-0"></div>

					<div class="space-y-3">
						<h5 class="text-sm font-semibold">Categories</h5>
						{#each NOTIFICATION_CATEGORIES as [field, label] (field)}
							<div class="flex items-center justify-between">
								<span class="text-sm">{$t(`notifications.types.${label}`)}</span>
								<div class="flex items-center gap-2">
									{#if savingField === field}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									<input
										type="checkbox"
										class="toggle toggle-primary toggle-sm"
										checked={prefs[field] as boolean}
										onchange={() => toggleField(field)}
									/>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
