<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t, locale } from 'svelte-i18n';
	import { findMyServices } from '$lib/nostr/findServices';
	import { updateService } from '$lib/nostr/service';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription
	} from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import type { ServiceTier } from '$lib/types/service.d';
	import { appStore } from '$lib/stores/app.store';
	import IconPlus from '~icons/mdi/plus';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';

	let services = $state<Service[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let togglingServiceId = $state<string | null>(null);

	async function loadServices() {
		loading = true;
		error = null;
		try {
			const result = await findMyServices({ limit: 100 });
			services = result.services;
		} catch (e) {
			console.error('Failed to load my services:', e);
			error = e instanceof Error ? e.message : String(e);
			services = [];
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadServices();
	});

	function getPriceLabel(service: Service): string {
		const p = service.pricing;
		if (!p) return $t('dashboard.services.browse.pricing.request_quote') || 'Request Quote';
		switch (p.type) {
			case ServicePricingTypeEnum.FIXED:
				return p.amount != null ? `$${formatNumberWithTwoDecimals(p.amount)}` : '—';
			case ServicePricingTypeEnum.HOURLY:
				return p.hourlyRate != null ? `$${formatNumberWithTwoDecimals(p.hourlyRate)}/hr` : '—';
			case ServicePricingTypeEnum.TIERED:
				if (p.tiers?.length) {
					const prices = p.tiers.map((t: ServiceTier) => t.price).filter((n: number) => n > 0);
					return prices.length ? `From $${formatNumberWithTwoDecimals(Math.min(...prices))}` : '—';
				}
				return '—';
			case ServicePricingTypeEnum.INQUIRY_REQUIRED:
				return $t('dashboard.services.browse.pricing.request_quote') || 'Request Quote';
			default:
				return '—';
		}
	}

	function handleView(service: Service, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const id = service.uniqueId || service.id;
		goto(`/services/${id}`);
	}

	function handleEdit(service: Service, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const id = service.uniqueId || service.id;
		goto(`/dashboard/list-service?edit=true&serviceId=${encodeURIComponent(id)}`);
	}

	async function handleStatusToggle(service: Service, _e?: Event) {
		const id = service.uniqueId || service.id;
		if (!id) return;
		if (service.status === 'sold') return;
		togglingServiceId = id;
		try {
			const nextStatus = service.status === 'active' ? 'inactive' : 'active';
			await updateService(id, { status: nextStatus });
			appStore.showSuccessToast($t('dashboard.services.my_services.status_updated'));
			await loadServices();
		} catch (err) {
			appStore.showErrorToast($t('dashboard.services.my_services.status_update_failed'));
		} finally {
			togglingServiceId = null;
		}
	}
</script>

{#if loading}
	<div class="flex flex-col items-center justify-center py-16">
		<span class="loading loading-spinner loading-lg text-primary"></span>
		<p class="text-base-content/70 mt-4">{$t('dashboard.services.my_services.loading')}</p>
	</div>
{:else if error}
	<div class="alert alert-error alert-outline">
		<span>{$t('dashboard.services.my_services.error_loading')}: {error}</span>
	</div>
	<button type="button" class="btn btn-primary btn-sm mt-4" onclick={loadServices}>
		{$t('dashboard.services.my_services.retry')}
	</button>
{:else if services.length === 0}
	<div
		class="border-base-300 bg-base-200/50 flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center"
	>
		<IconBriefcaseOutline class="text-base-content/30 h-16 w-16" aria-hidden="true" />
		<h4 class="mt-4 text-lg font-semibold">{$t('dashboard.services.my_services.empty_title')}</h4>
		<p class="text-base-content/70 mt-2 max-w-md">
			{$t('dashboard.services.my_services.empty_message')}
		</p>
		<a href="/dashboard/list-service" class="btn btn-primary mt-6">
			<IconPlus class="mr-2 h-5 w-5" aria-hidden="true" />
			{$t('dashboard.services.my_services.list_service')}
		</a>
	</div>
{:else}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each services as service (service.id)}
			<div
				class="card bg-base-100 border-base-300 rounded-xl border shadow-md transition-shadow hover:shadow-lg"
			>
				<div class="card-body p-4">
					<div class="flex flex-col gap-3">
						<div class="flex items-start justify-between gap-2">
							<span class="line-clamp-2 flex-1 text-lg font-semibold"
								>{getServiceDisplayTitle(service, $locale || 'en')}</span
							>
							<span
								class="badge badge-sm shrink-0 {service.status === 'active'
									? 'badge-success'
									: service.status === 'inactive'
										? 'badge-warning'
										: 'badge-ghost'}"
							>
								{#if service.status === 'active'}
									{$t('dashboard.services.my_services.status_active')}
								{:else if service.status === 'inactive'}
									{$t('dashboard.services.my_services.status_inactive')}
								{:else}
									{$t('dashboard.services.my_services.status_sold')}
								{/if}
							</span>
						</div>
						<p class="text-base-content/60 line-clamp-2 text-sm">
							{getServiceDisplayDescription(service, $locale || 'en') || '—'}
						</p>
						<p class="text-sm font-medium">{getPriceLabel(service)}</p>
						<div class="flex flex-wrap items-center gap-2 pt-2">
							{#if service.status !== 'sold'}
								<label
									class="flex items-center gap-2 {togglingServiceId ===
									(service.uniqueId || service.id)
										? 'opacity-60'
										: ''}"
									title={service.status === 'active'
										? $t('dashboard.services.my_services.status_toggle_inactive')
										: $t('dashboard.services.my_services.status_toggle_active')}
								>
									<input
										type="checkbox"
										class="toggle toggle-primary toggle-sm"
										checked={service.status === 'active'}
										disabled={togglingServiceId === (service.uniqueId || service.id)}
										onchange={() => handleStatusToggle(service)}
										aria-label={service.status === 'active'
											? $t('dashboard.services.my_services.status_toggle_inactive')
											: $t('dashboard.services.my_services.status_toggle_active')}
									/>
									<span class="text-base-content/70 text-xs">
										{service.status === 'active'
											? $t('dashboard.services.my_services.status_active')
											: $t('dashboard.services.my_services.status_inactive')}
									</span>
								</label>
							{/if}
							<button
								type="button"
								class="btn btn-ghost btn-sm gap-1"
								onclick={(e) => handleView(service, e)}
								aria-label={$t('dashboard.services.my_services.view')}
							>
								<IconEyeOutline class="h-4 w-4" aria-hidden="true" />
								{$t('dashboard.services.my_services.view')}
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-sm gap-1"
								onclick={(e) => handleEdit(service, e)}
								aria-label={$t('dashboard.services.my_services.edit')}
							>
								<IconPencilOutline class="h-4 w-4" aria-hidden="true" />
								{$t('dashboard.services.my_services.edit')}
							</button>
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
