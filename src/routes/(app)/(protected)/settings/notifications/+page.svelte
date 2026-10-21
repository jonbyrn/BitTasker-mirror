<script lang="ts">
	import { resolve } from '$app/paths';
	import { getContext, onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from 'svelte-i18n';
	import { animate, stagger } from 'motion';
	import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
	import type { NotificationPreferencesExtended } from '$lib/types/notification';
	import { appStore } from '$lib/stores/app.store';
	import IconBell from '~icons/mdi/bell-badge';
	import IconMoon from '~icons/mdi/moon-waning-crescent';
	import IconGrid from '~icons/mdi/view-grid-outline';
	import IconClipboard from '~icons/mdi/clipboard-check';
	import IconBriefcase from '~icons/mdi/briefcase-outline';
	import IconChevronLeft from '~icons/mdi/chevron-left';
	import IconContract from '~icons/mdi/handshake';
	import IconBid from '~icons/mdi/gavel';
	import IconMessage from '~icons/mdi/chat-outline';
	import IconReview from '~icons/mdi/star-outline';
	import IconWallet from '~icons/mdi/wallet-outline';
	import IconSecurity from '~icons/mdi/shield-alert';
	import IconDiscovery from '~icons/mdi/magnify';
	import IconReengagement from '~icons/mdi/bell-ring-outline';

	const settings = getContext<{ keysReady: boolean; error: string }>('settings');

	const NOTIFICATION_CATEGORIES: Array<
		[keyof NotificationPreferencesExtended, string, typeof IconBell]
	> = [
		['contractUpdates', 'contract', IconContract],
		['bidUpdates', 'bid', IconBid],
		['messageNotifications', 'message', IconMessage],
		['reviewNotifications', 'review', IconReview],
		['walletNotifications', 'wallet', IconWallet],
		['securityAlerts', 'security', IconSecurity],
		['discoveryNotifications', 'discovery', IconDiscovery],
		['reengagementNotifications', 'reengagement', IconReengagement]
	];

	const FIELD_TOAST_I18N: Record<string, string> = {
		pushEnabled: 'notifications.settings.push',
		emailEnabled: 'notifications.settings.email',
		quietHoursEnabled: 'notifications.settings.quiet_hours',
		quietHoursStart: 'notifications.settings.quiet_hours_start_label',
		quietHoursEnd: 'notifications.settings.quiet_hours_end_label',
		contractUpdates: 'notifications.types.contract',
		bidUpdates: 'notifications.types.bid',
		taskMatches: 'notifications.types.task',
		messageNotifications: 'notifications.types.message',
		reviewNotifications: 'notifications.types.review',
		serviceNotifications: 'notifications.types.service',
		walletNotifications: 'notifications.types.wallet',
		securityAlerts: 'notifications.types.security',
		discoveryNotifications: 'notifications.types.discovery',
		reengagementNotifications: 'notifications.types.reengagement',
		'taskNotificationSettings.enabled': 'notifications.settings.task.saved_search_matches',
		'taskNotificationSettings.frequency': 'notifications.settings.task.match_frequency',
		'taskNotificationSettings.broadcast': 'notifications.settings.task.new_task_alerts',
		'taskNotificationSettings.broadcastFrequency': 'notifications.settings.task.alert_frequency',
		'serviceNotificationSettings.enabled': 'notifications.settings.service.saved_search_matches',
		'serviceNotificationSettings.frequency': 'notifications.settings.service.match_frequency',
		'serviceNotificationSettings.broadcast': 'notifications.settings.service.new_service_alerts',
		'serviceNotificationSettings.broadcastFrequency':
			'notifications.settings.service.alert_frequency'
	};

	let prefs = $state<NotificationPreferencesExtended | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let savingField = $state<string | null>(null);
	let reduced = $state(false);
	let gridEl = $state<HTMLElement | null>(null);

	const activeCategoryCount = $derived.by(() => {
		if (!prefs) return 0;
		return NOTIFICATION_CATEGORIES.filter(([field]) => prefs![field]).length;
	});

	onMount(async () => {
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		try {
			prefs = await notificationCenterService.getPreferences();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load preferences';
		} finally {
			loading = false;
		}

		if (!reduced) {
			await tick();
			if (!gridEl) return;
			const cards = gridEl.querySelectorAll('.notif-settings-card');
			if (cards.length === 0) return;
			animate(cards, { scale: [0.96, 1], opacity: [0, 1] }, {
				duration: 0.3,
				delay: stagger(0.06, { startDelay: 0.08 }),
				easing: [0, 0, 0, 1]
			} as Parameters<typeof animate>[2]).finished.then(() => {
				if (gridEl) gridEl.classList.add('entrance-done');
			});
		}
	});

	function handleMouseMove(e: MouseEvent, card: HTMLElement) {
		const rect = card.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		card.style.setProperty('--spotlight-x', `${x}px`);
		card.style.setProperty('--spotlight-y', `${y}px`);
	}

	function handleMouseLeave(card: HTMLElement) {
		card.style.setProperty('--spotlight-x', '50%');
		card.style.setProperty('--spotlight-y', '50%');
	}

	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	function debouncedSave(field: string, newValue: boolean | string) {
		if (saveTimeout) clearTimeout(saveTimeout);
		savingField = field;
		saveTimeout = setTimeout(async () => {
			if (!prefs) return;
			try {
				await notificationCenterService.updatePreferences(prefs);
				const labelKey = FIELD_TOAST_I18N[field];
				const setting = labelKey ? $t(labelKey) : field;
				if (typeof newValue === 'boolean') {
					const message = newValue
						? $t('notifications.success.toggle_enabled', { values: { setting } })
						: $t('notifications.success.toggle_disabled', { values: { setting } });
					appStore.showSuccessToast(message);
				} else {
					appStore.showSuccessToast(
						$t('notifications.success.value_updated', { values: { setting } })
					);
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
		prefs = { ...prefs, [field]: !prefs[field] };
		debouncedSave(field, prefs[field] as boolean);
	}

	function updateField(field: keyof NotificationPreferencesExtended, value: string) {
		if (!prefs) return;
		prefs = { ...prefs, [field]: value };
		debouncedSave(field, value);
	}

	function toggleNestedBoolean(
		group: 'taskNotificationSettings' | 'serviceNotificationSettings',
		key: 'enabled' | 'broadcast'
	) {
		if (!prefs) return;
		const current = prefs[group];
		prefs = { ...prefs, [group]: { ...current, [key]: !current[key] } };
		debouncedSave(`${group}.${key}`, prefs[group][key]);
	}

	function updateNestedString(
		group: 'taskNotificationSettings' | 'serviceNotificationSettings',
		key: 'frequency' | 'broadcastFrequency',
		value: string
	) {
		if (!prefs) return;
		const current = prefs[group];
		prefs = { ...prefs, [group]: { ...current, [key]: value } };
		debouncedSave(`${group}.${key}`, value);
	}

	const FREQUENCY_OPTIONS = ['INSTANT', 'DAILY', 'WEEKLY'];

	function timeToPercent(time: string): number {
		const [h, m] = time.split(':').map(Number);
		return ((h * 60 + m) / 1440) * 100;
	}
</script>

<div in:fly={{ x: 300, duration: 250, easing: cubicOut }}>
	<div class="mb-4">
		<a href={resolve('/settings')} class="btn btn-sm border-base-300 bg-base-200 gap-2 border">
			<IconChevronLeft class="h-4 w-4" />
			{$t('settings.back')}
		</a>
	</div>

	{#if settings.keysReady}
		<div class="mb-6 flex items-center gap-3">
			<div
				class="notif-header-icon icon-subtle-pulse inline-flex h-12 w-12 items-center justify-center rounded-2xl"
				style="background: var(--color-primary)15; color: var(--color-primary)"
			>
				<IconBell class="h-6 w-6" />
			</div>
			<div>
				<h4 class="text-lg font-semibold">{$t('notifications.settings.title')}</h4>
				<p class="text-base-content/60 text-xs">
					{$t('notifications.settings.subtitle')}
				</p>
			</div>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-12">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{:else if error}
			<div class="alert alert-error alert-outline text-sm">
				<span>{error}</span>
			</div>
		{:else if prefs}
			<div bind:this={gridEl} class="notif-settings-grid space-y-4">
				<!-- Global -->
				<div
					class="notif-settings-card group border-base-300/50 bg-base-100 relative overflow-hidden rounded-2xl border p-5 shadow-lg sm:hover:scale-[1.01] sm:hover:shadow-xl"
					onmousemove={(e) => handleMouseMove(e, e.currentTarget)}
					onmouseleave={(e) => handleMouseLeave(e.currentTarget)}
					role="region"
					aria-label="Global notification settings"
				>
					<div
						class="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-300 sm:block sm:group-hover:opacity-100"
						style="background: radial-gradient(300px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), var(--color-primary)10, transparent 60%)"
					></div>
					<div class="relative z-10">
						<div class="mb-4 flex items-center gap-3">
							<div
								class="notif-section-icon icon-subtle-pulse inline-flex h-10 w-10 items-center justify-center rounded-xl"
								style="background: var(--color-primary)15; color: var(--color-primary)"
							>
								<IconBell class="h-5 w-5" />
							</div>
							<h5 class="text-sm font-semibold">Global</h5>
						</div>
						<div class="space-y-3 pl-1">
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
					</div>
				</div>

				<!-- Quiet hours -->
				<div
					class="notif-settings-card group border-base-300/50 bg-base-100 relative overflow-hidden rounded-2xl border p-5 shadow-lg sm:hover:scale-[1.01] sm:hover:shadow-xl"
					onmousemove={(e) => handleMouseMove(e, e.currentTarget)}
					onmouseleave={(e) => handleMouseLeave(e.currentTarget)}
					role="region"
					aria-label="Quiet hours settings"
				>
					<div
						class="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-300 sm:block sm:group-hover:opacity-100"
						style="background: radial-gradient(300px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), var(--color-info)10, transparent 60%)"
					></div>
					<div class="relative z-10">
						<div class="mb-4 flex items-center gap-3">
							<div
								class="notif-section-icon icon-subtle-float inline-flex h-10 w-10 items-center justify-center rounded-xl"
								style="background: var(--color-info)15; color: var(--color-info)"
							>
								<IconMoon class="h-5 w-5" />
							</div>
							<h5 class="text-sm font-semibold">
								{$t('notifications.settings.quiet_hours')}
							</h5>
						</div>
						<div class="space-y-3 pl-1">
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
								<div class="bg-base-200 relative h-2 w-full overflow-hidden rounded-full">
									<div
										class="absolute top-0 h-full rounded-full opacity-40"
										style="background: var(--color-info); left: {timeToPercent(
											prefs.quietHoursStart
										)}%; width: {Math.abs(
											timeToPercent(prefs.quietHoursEnd) - timeToPercent(prefs.quietHoursStart)
										)}%"
									></div>
								</div>
								<div class="text-base-content/40 flex justify-between text-[10px]">
									<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span
										>24:00</span
									>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Categories -->
				<div
					class="notif-settings-card group border-base-300/50 bg-base-100 relative overflow-hidden rounded-2xl border p-5 shadow-lg sm:hover:scale-[1.01] sm:hover:shadow-xl"
					onmousemove={(e) => handleMouseMove(e, e.currentTarget)}
					onmouseleave={(e) => handleMouseLeave(e.currentTarget)}
					role="region"
					aria-label="Notification categories"
				>
					<div
						class="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-300 sm:block sm:group-hover:opacity-100"
						style="background: radial-gradient(300px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), var(--color-success)10, transparent 60%)"
					></div>
					<div class="relative z-10">
						<div class="mb-4 flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div
									class="notif-section-icon icon-subtle-breathe inline-flex h-10 w-10 items-center justify-center rounded-xl"
									style="background: var(--color-success)15; color: var(--color-success)"
								>
									<IconGrid class="h-5 w-5" />
								</div>
								<h5 class="text-sm font-semibold">Categories</h5>
							</div>
							<span
								class="badge badge-sm"
								class:badge-success={activeCategoryCount === NOTIFICATION_CATEGORIES.length}
								class:badge-ghost={activeCategoryCount < NOTIFICATION_CATEGORIES.length}
							>
								{activeCategoryCount}/{NOTIFICATION_CATEGORIES.length}
							</span>
						</div>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
							{#each NOTIFICATION_CATEGORIES as [field, label, CatIcon] (field)}
								<div
									class="border-base-300/50 flex items-center justify-between gap-2 rounded-xl border p-3 transition-all duration-200 {prefs[
										field
									]
										? 'bg-primary/10 border-primary/30'
										: 'opacity-50'}"
								>
									<div class="flex min-w-0 items-center gap-2">
										<CatIcon class="h-4 w-4 shrink-0" />
										<span class="truncate text-xs font-medium"
											>{$t(`notifications.types.${label}`)}</span
										>
									</div>
									<div class="flex shrink-0 items-center gap-1.5">
										{#if savingField === field}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										<input
											type="checkbox"
											class="toggle toggle-primary toggle-xs"
											checked={prefs[field] as boolean}
											onchange={() => toggleField(field)}
										/>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Tasks -->
				<div
					class="notif-settings-card group border-base-300/50 bg-base-100 relative overflow-hidden rounded-2xl border p-5 shadow-lg sm:hover:scale-[1.01] sm:hover:shadow-xl"
					onmousemove={(e) => handleMouseMove(e, e.currentTarget)}
					onmouseleave={(e) => handleMouseLeave(e.currentTarget)}
					role="region"
					aria-label="Task notification settings"
				>
					<div
						class="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-300 sm:block sm:group-hover:opacity-100"
						style="background: radial-gradient(300px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), var(--color-warning)10, transparent 60%)"
					></div>
					<div class="relative z-10">
						<div class="mb-4 flex items-center gap-3">
							<div
								class="notif-section-icon icon-subtle-sway inline-flex h-10 w-10 items-center justify-center rounded-xl"
								style="background: var(--color-warning)15; color: var(--color-warning)"
							>
								<IconClipboard class="h-5 w-5" />
							</div>
							<h5 class="text-sm font-semibold">
								{$t('notifications.settings.task.title')}
							</h5>
						</div>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<div
									class="border-base-300 flex items-center justify-between rounded-xl border p-3"
								>
									<span class="text-sm">{$t('notifications.settings.task.new_task_alerts')}</span>
									<div class="flex items-center gap-2">
										{#if savingField === 'taskNotificationSettings.broadcast'}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										<input
											type="checkbox"
											class="toggle toggle-primary toggle-sm"
											checked={prefs.taskNotificationSettings.broadcast}
											onchange={() => toggleNestedBoolean('taskNotificationSettings', 'broadcast')}
										/>
									</div>
								</div>
								{#if prefs.taskNotificationSettings.broadcast}
									<div class="border-base-300 space-y-1 rounded-xl border p-3">
										<span class="text-base-content/60 text-xs"
											>{$t('notifications.settings.task.alert_frequency')}</span
										>
										<div class="btn-group w-full">
											{#each FREQUENCY_OPTIONS as freq (freq)}
												<button
													class="btn btn-sm flex-1"
													class:btn-primary={prefs.taskNotificationSettings.broadcastFrequency ===
														freq}
													class:btn-ghost={prefs.taskNotificationSettings.broadcastFrequency !==
														freq}
													onclick={() =>
														updateNestedString(
															'taskNotificationSettings',
															'broadcastFrequency',
															freq
														)}
												>
													{$t(`notifications.settings.frequency.${freq.toLowerCase()}`)}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
							<div class="space-y-2">
								<div
									class="border-base-300 flex items-center justify-between rounded-xl border p-3"
								>
									<span class="text-sm"
										>{$t('notifications.settings.task.saved_search_matches')}</span
									>
									<div class="flex items-center gap-2">
										{#if savingField === 'taskNotificationSettings.enabled'}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										<input
											type="checkbox"
											class="toggle toggle-primary toggle-sm"
											checked={prefs.taskNotificationSettings.enabled}
											onchange={() => toggleNestedBoolean('taskNotificationSettings', 'enabled')}
										/>
									</div>
								</div>
								{#if prefs.taskNotificationSettings.enabled}
									<div class="border-base-300 space-y-1 rounded-xl border p-3">
										<span class="text-base-content/60 text-xs"
											>{$t('notifications.settings.task.match_frequency')}</span
										>
										<div class="btn-group w-full">
											{#each FREQUENCY_OPTIONS as freq (freq)}
												<button
													class="btn btn-sm flex-1"
													class:btn-primary={prefs.taskNotificationSettings.frequency === freq}
													class:btn-ghost={prefs.taskNotificationSettings.frequency !== freq}
													onclick={() =>
														updateNestedString('taskNotificationSettings', 'frequency', freq)}
												>
													{$t(`notifications.settings.frequency.${freq.toLowerCase()}`)}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<!-- Services -->
				<div
					class="notif-settings-card group border-base-300/50 bg-base-100 relative overflow-hidden rounded-2xl border p-5 shadow-lg sm:hover:scale-[1.01] sm:hover:shadow-xl"
					onmousemove={(e) => handleMouseMove(e, e.currentTarget)}
					onmouseleave={(e) => handleMouseLeave(e.currentTarget)}
					role="region"
					aria-label="Service notification settings"
				>
					<div
						class="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-300 sm:block sm:group-hover:opacity-100"
						style="background: radial-gradient(300px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), var(--color-accent)10, transparent 60%)"
					></div>
					<div class="relative z-10">
						<div class="mb-4 flex items-center gap-3">
							<div
								class="notif-section-icon icon-subtle-sway inline-flex h-10 w-10 items-center justify-center rounded-xl"
								style="background: var(--color-accent)15; color: var(--color-accent)"
							>
								<IconBriefcase class="h-5 w-5" />
							</div>
							<h5 class="text-sm font-semibold">
								{$t('notifications.settings.service.title')}
							</h5>
						</div>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<div
									class="border-base-300 flex items-center justify-between rounded-xl border p-3"
								>
									<span class="text-sm"
										>{$t('notifications.settings.service.new_service_alerts')}</span
									>
									<div class="flex items-center gap-2">
										{#if savingField === 'serviceNotificationSettings.broadcast'}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										<input
											type="checkbox"
											class="toggle toggle-primary toggle-sm"
											checked={prefs.serviceNotificationSettings.broadcast}
											onchange={() =>
												toggleNestedBoolean('serviceNotificationSettings', 'broadcast')}
										/>
									</div>
								</div>
								{#if prefs.serviceNotificationSettings.broadcast}
									<div class="border-base-300 space-y-1 rounded-xl border p-3">
										<span class="text-base-content/60 text-xs"
											>{$t('notifications.settings.service.alert_frequency')}</span
										>
										<div class="btn-group w-full">
											{#each FREQUENCY_OPTIONS as freq (freq)}
												<button
													class="btn btn-sm flex-1"
													class:btn-primary={prefs.serviceNotificationSettings
														.broadcastFrequency === freq}
													class:btn-ghost={prefs.serviceNotificationSettings.broadcastFrequency !==
														freq}
													onclick={() =>
														updateNestedString(
															'serviceNotificationSettings',
															'broadcastFrequency',
															freq
														)}
												>
													{$t(`notifications.settings.frequency.${freq.toLowerCase()}`)}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
							<div class="space-y-2">
								<div
									class="border-base-300 flex items-center justify-between rounded-xl border p-3"
								>
									<span class="text-sm"
										>{$t('notifications.settings.service.saved_search_matches')}</span
									>
									<div class="flex items-center gap-2">
										{#if savingField === 'serviceNotificationSettings.enabled'}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										<input
											type="checkbox"
											class="toggle toggle-primary toggle-sm"
											checked={prefs.serviceNotificationSettings.enabled}
											onchange={() => toggleNestedBoolean('serviceNotificationSettings', 'enabled')}
										/>
									</div>
								</div>
								{#if prefs.serviceNotificationSettings.enabled}
									<div class="border-base-300 space-y-1 rounded-xl border p-3">
										<span class="text-base-content/60 text-xs"
											>{$t('notifications.settings.service.match_frequency')}</span
										>
										<div class="btn-group w-full">
											{#each FREQUENCY_OPTIONS as freq (freq)}
												<button
													class="btn btn-sm flex-1"
													class:btn-primary={prefs.serviceNotificationSettings.frequency === freq}
													class:btn-ghost={prefs.serviceNotificationSettings.frequency !== freq}
													onclick={() =>
														updateNestedString('serviceNotificationSettings', 'frequency', freq)}
												>
													{$t(`notifications.settings.frequency.${freq.toLowerCase()}`)}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	@keyframes icon-subtle-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.85;
		}
	}

	@keyframes icon-subtle-float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-1px);
		}
	}

	@keyframes icon-subtle-breathe {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.02);
		}
	}

	@keyframes icon-subtle-sway {
		0%,
		100% {
			transform: rotate(0deg);
		}
		25% {
			transform: rotate(1.5deg);
		}
		75% {
			transform: rotate(-1.5deg);
		}
	}

	.icon-subtle-pulse {
		animation: icon-subtle-pulse 4s ease-in-out infinite;
	}

	.icon-subtle-float {
		animation: icon-subtle-float 5s ease-in-out infinite;
	}

	.icon-subtle-breathe {
		animation: icon-subtle-breathe 4.5s ease-in-out infinite;
	}

	.icon-subtle-sway {
		animation: icon-subtle-sway 5s ease-in-out infinite;
	}

	.notif-settings-card {
		contain: layout style paint;
		transition:
			transform 300ms ease,
			box-shadow 300ms ease;
	}

	.notif-settings-card:active {
		transform: scale(0.98);
	}

	:global(.entrance-done) .notif-settings-card {
		transition:
			transform 300ms ease,
			box-shadow 300ms ease,
			filter 300ms ease;
	}

	@media (prefers-reduced-motion: reduce) {
		.icon-subtle-pulse,
		.icon-subtle-float,
		.icon-subtle-breathe,
		.icon-subtle-sway {
			animation: none !important;
		}

		.notif-settings-card {
			transition: none !important;
		}

		.notif-settings-card:active {
			transform: none !important;
		}
	}
</style>
