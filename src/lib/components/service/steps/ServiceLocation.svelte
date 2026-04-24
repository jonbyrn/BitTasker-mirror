<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import EnhancedLocationPicker from '$lib/components/LocationPicker.svelte';
	import { ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import type { Location } from '$lib/types/task';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();

	onMount(() => {
		if (!$store.service.serviceLocationTypes || $store.service.serviceLocationTypes.length === 0) {
			store.updateService({
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE]
			});
		}
	});

	function toggleLocationType(type: ServiceLocationTypeEnum) {
		const currentType = ($store.service.serviceLocationTypes || [])[0];

		if (currentType === type) {
			return;
		}

		const defaultLocation: Location = {
			displayName: '',
			longitude: null,
			latitude: null,
			zipCode: '',
			locationLoaded: false
		};

		store.updateService({ serviceLocationTypes: [type] });

		if (type === ServiceLocationTypeEnum.TASKER_LOCATION) {
			store.updateService({
				locationDetails: {
					...$store.service.locationDetails,
					taskerLocation: {
						serviceLocation: { ...defaultLocation },
						serviceRadius: undefined
					},
					taskeeLocation: undefined
				}
			});
		} else if (type === ServiceLocationTypeEnum.TASKEE_LOCATION) {
			store.updateService({
				locationDetails: {
					...$store.service.locationDetails,
					taskeeLocation: {
						useGlobalLocation: false,
						serviceLocation: undefined,
						locationDisplayName: undefined,
						serviceRadius: 5
					},
					taskerLocation: undefined
				}
			});
		} else {
			store.updateService({
				locationDetails: {
					...$store.service.locationDetails,
					taskerLocation: undefined,
					taskeeLocation: undefined
				}
			});
		}
	}

	function getDefaultLocation(): Location {
		return {
			displayName: '',
			longitude: null,
			latitude: null,
			zipCode: '',
			locationLoaded: false
		};
	}

	function updateTaskeeLocationRadius(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const nextRadius = Number(target.value);
		const currentTaskeeLocation = $store.service.locationDetails?.taskeeLocation;

		if (!currentTaskeeLocation) {
			return;
		}

		store.updateService({
			locationDetails: {
				...$store.service.locationDetails,
				taskeeLocation: {
					...currentTaskeeLocation,
					serviceRadius: Number.isFinite(nextRadius)
						? nextRadius
						: currentTaskeeLocation.serviceRadius
				}
			}
		});
	}

	const kmToMiles = (km: number) => (km * 0.621371).toFixed(1);
</script>

<div
	class="min-w-0 space-y-6 overflow-x-hidden"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<div class="label">
			<span class="label-text-alt break-words">
				{$t('dashboard.services.create.location.types_hint')}
			</span>
		</div>

		<div class="space-y-3">
			<label
				class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {($store
					.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.REMOTE
					? 'border-primary bg-primary/10'
					: 'border-base-300'}"
			>
				<input
					type="radio"
					name="serviceLocationType"
					class="radio radio-primary"
					checked={($store.service.serviceLocationTypes || [])[0] ===
						ServiceLocationTypeEnum.REMOTE}
					onchange={() => toggleLocationType(ServiceLocationTypeEnum.REMOTE)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.location.remote_title')}</div>
					<div class="text-base-content/70 text-sm">
						{$t('dashboard.services.create.location.remote_description')}
					</div>
				</div>
			</label>

			<label
				class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {($store
					.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.TASKER_LOCATION
					? 'border-primary bg-primary/10'
					: 'border-base-300'}"
			>
				<input
					type="radio"
					name="serviceLocationType"
					class="radio radio-primary"
					checked={($store.service.serviceLocationTypes || [])[0] ===
						ServiceLocationTypeEnum.TASKER_LOCATION}
					onchange={() => toggleLocationType(ServiceLocationTypeEnum.TASKER_LOCATION)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.location.tasker_title')}</div>
					<div class="text-base-content/70 text-sm">
						{$t('dashboard.services.create.location.tasker_description')}
					</div>
				</div>
			</label>

			<label
				class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {($store
					.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.TASKEE_LOCATION
					? 'border-primary bg-primary/10'
					: 'border-base-300'}"
			>
				<input
					type="radio"
					name="serviceLocationType"
					class="radio radio-primary"
					checked={($store.service.serviceLocationTypes || [])[0] ===
						ServiceLocationTypeEnum.TASKEE_LOCATION}
					onchange={() => toggleLocationType(ServiceLocationTypeEnum.TASKEE_LOCATION)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.location.taskee_title')}</div>
					<div class="text-base-content/70 text-sm">
						{$t('dashboard.services.create.location.taskee_description')}
					</div>
				</div>
			</label>
		</div>

		{#if errors.locationTypes}
			<span class="label-text-alt text-error">{errors.locationTypes}</span>
		{/if}
	</div>

	{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKER_LOCATION)}
		<div class="card bg-base-200 min-w-0 space-y-4 overflow-hidden p-4">
			<h4 class="text-lg font-semibold break-words">
				{$t('dashboard.services.create.location.my_location_title')}
			</h4>

			<div class="w-full min-w-0">
				<EnhancedLocationPicker
					label={$t('dashboard.services.create.location.service_location_picker_label')}
					placeholder={$t('dashboard.services.create.location.service_location_placeholder')}
					location={$store.service.locationDetails?.taskerLocation?.serviceLocation ||
						getDefaultLocation()}
					onLocationSelect={(location) => {
						store.updateService({
							locationDetails: {
								...$store.service.locationDetails,
								taskerLocation: {
									...$store.service.locationDetails?.taskerLocation,
									serviceLocation: {
										...location,
										locationLoaded: true
									}
								}
							}
						});
					}}
					showMap={true}
					mapHeight="300px"
					showFullscreen={true}
					showGeolocation={true}
					showServiceRadius={false}
					showRadiusCircle={false}
				/>
			</div>
		</div>
	{/if}

	{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKEE_LOCATION)}
		<div class="card bg-base-200 min-w-0 space-y-4 overflow-hidden p-4">
			<h4 class="text-lg font-semibold break-words">
				{$t('dashboard.services.create.location.service_radius_title')}
			</h4>

			<div class="w-full min-w-0">
				<EnhancedLocationPicker
					label={$t('dashboard.services.create.location.taskee_location_picker_label')}
					placeholder={$t('dashboard.services.create.location.taskee_location_placeholder')}
					location={$store.service.locationDetails?.taskeeLocation?.serviceLocation ||
						getDefaultLocation()}
					onLocationSelect={(location) => {
						const currentTaskeeLocation = $store.service.locationDetails?.taskeeLocation;
						store.updateService({
							locationDetails: {
								...$store.service.locationDetails,
								taskeeLocation: {
									useGlobalLocation: currentTaskeeLocation?.useGlobalLocation ?? false,
									serviceLocation: {
										...location,
										locationLoaded: true
									},
									locationDisplayName: location.displayName
								}
							}
						});
					}}
					showMap={true}
					mapHeight="300px"
					showFullscreen={true}
					showGeolocation={true}
					showServiceRadius={false}
					serviceRadius={$store.service.locationDetails?.taskeeLocation?.serviceRadius || 5}
					showRadiusCircle={true}
				/>
			</div>

			<div class="w-full min-w-0">
				<label class="label" for="service-radius">
					<span class="label-text break-words">
						{$t('dashboard.services.create.location.service_radius_label')}
					</span>
					<span class="label-text-alt">
						{$store.service.locationDetails?.taskeeLocation?.serviceRadius || 5} km ({kmToMiles(
							$store.service.locationDetails?.taskeeLocation?.serviceRadius || 5
						)} miles)
					</span>
				</label>
				<input
					id="service-radius"
					type="range"
					min="1"
					max="100"
					step="1"
					class="range range-primary w-full"
					value={$store.service.locationDetails?.taskeeLocation?.serviceRadius || 5}
					oninput={updateTaskeeLocationRadius}
					data-testid="service-location-radius"
				/>
				<div class="text-base-content/60 mt-1 flex justify-between px-2 text-xs">
					<span>1 km ({kmToMiles(1)} mi)</span>
					<span
						>{$store.service.locationDetails?.taskeeLocation?.serviceRadius || 5} km ({kmToMiles(
							$store.service.locationDetails?.taskeeLocation?.serviceRadius || 5
						)} mi)</span
					>
					<span>100 km ({kmToMiles(100)} mi)</span>
				</div>
			</div>
		</div>
	{/if}

	{#if errors.location}
		<span class="label-text-alt text-error block">{errors.location}</span>
	{/if}
</div>
