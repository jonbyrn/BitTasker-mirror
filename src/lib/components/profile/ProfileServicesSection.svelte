<script lang="ts">
	import { profileStore } from '$lib/stores/profile.store';
	import { locale, t } from 'svelte-i18n';
	import {
		getServiceDisplayDescription,
		getServiceDisplayTitle
	} from '$lib/utils/serviceDisplayTranslation';
	import type { Service } from '$lib/types/service.d';

	function getServiceHref(service: Service): string {
		return `/services/${service.uniqueId || service.id}`;
	}

	function getServiceTitle(service: Service): string {
		const translatedTitle = getServiceDisplayTitle(service, $locale || 'en').trim();
		return translatedTitle || service.title || service.uniqueId || service.id;
	}

	function getServiceDescription(service: Service): string {
		return getServiceDisplayDescription(service, $locale || 'en').trim();
	}
</script>

<section class="mb-8" data-testid="profile-services-module">
	<div class="card bg-base-200 rounded-2xl shadow-lg">
		<div class="card-body gap-4">
			<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div class="space-y-1">
					<h3 class="card-title text-lg">{$t('profile.services_summary.title')}</h3>
					<p class="text-base-content/70 text-sm">
						{$t('profile.services_summary.description')}
					</p>
				</div>
				{#if !$profileStore.servicesLoading && !$profileStore.servicesError}
					<div class="badge badge-outline badge-secondary">
						{$profileStore.services.length} {$t('stats.activeServices')}
					</div>
				{/if}
			</div>

			{#if $profileStore.servicesLoading}
				<div class="space-y-3" data-testid="profile-services-loading">
					<p class="text-base-content/70 text-sm">
						{$t('profile.services_summary.count_loading')}
					</p>
					{#each Array.from({ length: 3 }) as _, index (index)}
						<div
							class="bg-base-100/70 animate-pulse rounded-xl p-4"
							data-testid={`profile-services-loading-row-${index}`}
						>
							<div class="bg-base-300 mb-3 h-4 w-1/3 rounded"></div>
							<div class="bg-base-300 h-3 w-full rounded"></div>
						</div>
					{/each}
				</div>
			{:else if $profileStore.servicesError}
				<div class="space-y-3" data-testid="profile-services-error">
					<div class="alert alert-outline alert-error">
						<span>{$t('profile.services_summary.load_error')}</span>
					</div>
					<p class="text-base-content/60 text-sm">{$profileStore.servicesError}</p>
				</div>
			{:else if $profileStore.services.length === 0}
				<div
					class="bg-base-100/70 rounded-xl border border-dashed p-6 text-center"
					data-testid="profile-services-empty"
				>
					<p class="mb-3 text-sm">{$t('profile.services_summary.empty')}</p>
					<a class="btn btn-primary btn-sm" href="/create-service">
						{$t('profile.services_summary.create_cta')}
					</a>
				</div>
			{:else}
				<div class="grid gap-3 lg:grid-cols-2" data-testid="profile-services-list">
					{#each $profileStore.services as service (service.id)}
						<a
							class="bg-base-100 hover:border-primary/40 hover:bg-base-100/90 block rounded-xl border border-transparent p-4 transition"
							data-testid={`profile-service-link-${service.uniqueId || service.id}`}
							href={getServiceHref(service)}
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1 space-y-2">
									<h4 class="line-clamp-2 text-base font-semibold">
										{getServiceTitle(service)}
									</h4>
									{#if getServiceDescription(service)}
										<p class="text-base-content/70 line-clamp-2 text-sm">
											{getServiceDescription(service)}
										</p>
									{/if}
								</div>
								<span class="badge badge-ghost shrink-0">
									{$t('profile.services_summary.active_badge')}
								</span>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</section>
