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

	// Initialize location types if not set (run once on mount)
	onMount(() => {
		if (!$store.service.serviceLocationTypes || $store.service.serviceLocationTypes.length === 0) {
			store.updateService({
				serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE]
			});
		}
	});

	// Select location type (radio button behavior - only one at a time)
	function toggleLocationType(type: ServiceLocationTypeEnum) {
		// Always set to single selection (radio button behavior)
		const currentType = ($store.service.serviceLocationTypes || [])[0];

		// If clicking the same type, don't do anything (radio buttons don't deselect)
		if (currentType === type) {
			return;
		}

		// Set to single selection
		store.updateService({ serviceLocationTypes: [type] });

		// Clean up location details for unselected types
		if (type !== ServiceLocationTypeEnum.TASKER_LOCATION) {
			store.updateService({
				locationDetails: {
					...$store.service.locationDetails,
					taskerLocation: undefined
				}
			});
		}
		if (type !== ServiceLocationTypeEnum.TASKEE_LOCATION) {
			store.updateService({
				locationDetails: {
					...$store.service.locationDetails,
					taskeeLocation: undefined
				}
			});
		}

		// Initialize location details for selected type
		if (type === ServiceLocationTypeEnum.TASKER_LOCATION) {
			const defaultLocation: Location = {
				displayName: '',
				longitude: null,
				latitude: null,
				zipCode: '',
				locationLoaded: false
			};
			store.updateService({
				locationDetails: {
					...$store.service.locationDetails,
					taskerLocation: {
						serviceLocation: defaultLocation,
						serviceRadius: undefined,
						perDistanceCharge: undefined
					}
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
						serviceRadius: 5,
						perDistanceCharge: undefined
					}
				}
			});
		}
	}

	// Get default location object
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
			<!-- Remote Option -->
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

			<!-- Tasker Location Option -->
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

			<!-- Taskee Location Option -->
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

	<!-- Tasker Location Configuration -->
	{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKER_LOCATION)}
		<div class="card bg-base-200 min-w-0 space-y-4 overflow-hidden p-4">
			<h4 class="text-lg font-semibold break-words">
				{$t('dashboard.services.create.location.tasker_config_title')}
			</h4>

			<!-- Service Location -->
			<div class="w-full min-w-0">
				<div class="label">
					<span class="label-text break-words"
						>{$t('dashboard.services.create.location.service_location_label')}</span
					>
				</div>
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

	<!-- Taskee Location Configuration -->
	{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKEE_LOCATION)}
		<div class="card bg-base-200 min-w-0 space-y-4 overflow-hidden p-4">
			<h4 class="text-lg font-semibold break-words">
				{$t('dashboard.services.create.location.taskee_config_title')}
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
						{$store.service.locationDetails?.taskeeLocation?.serviceRadius || 5} km
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
					<span>1 km</span>
					<span>{$store.service.locationDetails?.taskeeLocation?.serviceRadius || 5} km</span>
					<span>100 km</span>
				</div>
			</div>

			<div class="w-full min-w-0">
				<label class="label cursor-pointer" id="perDistanceCharge-label">
					<span class="label-text break-words"
						>{$t('dashboard.services.create.location.per_distance_charge_label')}</span
					>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={!!$store.service.locationDetails?.taskeeLocation?.perDistanceCharge}
						onchange={(e) => {
							const enabled = (e.target as HTMLInputElement).checked;
							const currentTaskeeLocation = $store.service.locationDetails?.taskeeLocation;
							if (currentTaskeeLocation?.serviceLocation) {
								store.updateService({
									locationDetails: {
										...$store.service.locationDetails,
										taskeeLocation: {
											...currentTaskeeLocation,
											perDistanceCharge: enabled
												? {
														amount: 0,
														currency: $store.service.pricing?.currency || 'USD',
														unit: 'km'
													}
												: undefined
										}
									}
								});
							}
						}}
					/>
				</label>
				{#if $store.service.locationDetails?.taskeeLocation?.perDistanceCharge}
					<div class="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(8rem,10rem)] gap-3">
						<div class="min-w-0">
							<label for="perDistanceAmount" class="label" id="perDistanceAmount-label">
								<span class="label-text break-words"
									>{$t('dashboard.services.create.location.per_distance_amount_label')}</span
								>
							</label>
							<input
								type="number"
								id="perDistanceAmount"
								min="0"
								step="0.01"
								value={$store.service.locationDetails?.taskeeLocation?.perDistanceCharge?.amount ||
									0}
								onchange={(e) => {
									const amount = Number((e.target as HTMLInputElement).value);
									const currentTaskeeLocation = $store.service.locationDetails?.taskeeLocation;
									if (
										currentTaskeeLocation?.serviceLocation &&
										currentTaskeeLocation?.perDistanceCharge
									) {
										store.updateService({
											locationDetails: {
												...$store.service.locationDetails,
												taskeeLocation: {
													...currentTaskeeLocation,
													perDistanceCharge: {
														...currentTaskeeLocation.perDistanceCharge,
														amount
													}
												}
											}
										});
									}
								}}
								class="input input-bordered w-full"
							/>
						</div>
						<div class="min-w-0">
							<label for="perDistanceUnit" class="label" id="perDistanceUnit-label">
								<span class="label-text break-words"
									>{$t('dashboard.services.create.location.per_distance_unit_label')}</span
								>
							</label>
							<select
								id="perDistanceUnit"
								class="select select-bordered w-full"
								value={$store.service.locationDetails?.taskeeLocation?.perDistanceCharge?.unit ||
									'km'}
								onchange={(e) => {
									const unit = (e.target as HTMLSelectElement).value as 'km' | 'mile';
									const currentTaskeeLocation = $store.service.locationDetails?.taskeeLocation;
									if (
										currentTaskeeLocation?.serviceLocation &&
										currentTaskeeLocation?.perDistanceCharge
									) {
										store.updateService({
											locationDetails: {
												...$store.service.locationDetails,
												taskeeLocation: {
													...currentTaskeeLocation,
													perDistanceCharge: {
														...currentTaskeeLocation.perDistanceCharge,
														unit
													}
												}
											}
										});
									}
								}}
							>
								<option value="km">{$t('dashboard.services.create.location.unit_km')}</option>
								<option value="mile">{$t('dashboard.services.create.location.unit_mile')}</option>
							</select>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if errors.location}
		<span class="label-text-alt text-error block">{errors.location}</span>
	{/if}
</div>
