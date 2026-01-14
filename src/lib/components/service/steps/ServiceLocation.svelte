<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import EnhancedLocationPicker from '$lib/components/EnhancedLocationPicker.svelte';
	import { ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import type { Location } from '$lib/types/task';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();

	// Initialize location types if not set
	$effect(() => {
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
						serviceRadius: 10, // Default 10 km
						perDistanceCharge: undefined
					}
				}
			});
		} else if (type === ServiceLocationTypeEnum.TASKEE_LOCATION) {
			store.updateService({
				locationDetails: {
					...$store.service.locationDetails,
					taskeeLocation: {
						useGlobalLocation: true,
						serviceLocation: undefined,
						locationDisplayName: undefined
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
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<div class="label">
			<span class="label-text-alt">{$t('dashboard.services.create.location.types_hint')}</span>
		</div>

		<div class="space-y-3">
			<!-- Remote Option -->
			<label class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {($store.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.REMOTE ? 'border-primary bg-primary/10' : 'border-base-300'}">
				<input
					type="radio"
					name="serviceLocationType"
					class="radio radio-primary"
					checked={($store.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.REMOTE}
                    onchange={() => toggleLocationType(ServiceLocationTypeEnum.REMOTE)}				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.location.remote_title')}</div>
					<div class="text-sm text-base-content/70">{$t('dashboard.services.create.location.remote_description')}</div>
				</div>
			</label>

			<!-- Tasker Location Option -->
			<label class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {($store.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.TASKER_LOCATION ? 'border-primary bg-primary/10' : 'border-base-300'}">
				<input
					type="radio"
					name="serviceLocationType"
					class="radio radio-primary"
					checked={($store.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.TASKER_LOCATION}
					onchange={() => toggleLocationType(ServiceLocationTypeEnum.TASKER_LOCATION)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.location.tasker_title')}</div>
					<div class="text-sm text-base-content/70">{$t('dashboard.services.create.location.tasker_description')}</div>
				</div>
			</label>

			<!-- Taskee Location Option -->
			<label class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {($store.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.TASKEE_LOCATION ? 'border-primary bg-primary/10' : 'border-base-300'}">
				<input
					type="radio"
					name="serviceLocationType"
					class="radio radio-primary"
					checked={($store.service.serviceLocationTypes || [])[0] === ServiceLocationTypeEnum.TASKEE_LOCATION}
					onchange={() => toggleLocationType(ServiceLocationTypeEnum.TASKEE_LOCATION)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.location.taskee_title')}</div>
					<div class="text-sm text-base-content/70">{$t('dashboard.services.create.location.taskee_description')}</div>
				</div>
			</label>
		</div>

		{#if errors.locationTypes}
			<span class="label-text-alt text-error">{errors.locationTypes}</span>
		{/if}
	</div>

	<!-- Tasker Location Configuration -->
	{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKER_LOCATION)}
		<div class="card bg-base-200 p-4 space-y-4">
			<h4 class="font-semibold text-lg">{$t('dashboard.services.create.location.tasker_config_title')}</h4>

			<!-- Service Location (Base Location) -->
			<div class="w-full">
				<div class="label">
					<span class="label-text">{$t('dashboard.services.create.location.service_location_label')}</span>
					<span class="label-text-alt">{$t('dashboard.services.create.location.service_location_hint')}</span>
				</div>
				<EnhancedLocationPicker
					label={$t('dashboard.services.create.location.service_location_picker_label')}
					placeholder={$t('dashboard.services.create.location.service_location_placeholder')}
					location={$store.service.locationDetails?.taskerLocation?.serviceLocation || getDefaultLocation()}
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
					showServiceRadius={true}
					serviceRadius={$store.service.locationDetails?.taskerLocation?.serviceRadius || 10}
				/>
			</div>

			<!-- Per-Distance Charge (Optional) -->
			<div class="w-full">
				<label class="label cursor-pointer" id="perDistanceCharge-label">
					<span class="label-text">{$t('dashboard.services.create.location.per_distance_charge_label')}</span>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={!!$store.service.locationDetails?.taskerLocation?.perDistanceCharge}
						onchange={(e) => {
							const enabled = (e.target as HTMLInputElement).checked;
							const currentTaskerLocation = $store.service.locationDetails?.taskerLocation;
							if (currentTaskerLocation?.serviceLocation) {
								store.updateService({
									locationDetails: {
										...$store.service.locationDetails,
										taskerLocation: {
											serviceLocation: currentTaskerLocation.serviceLocation,
											serviceRadius: currentTaskerLocation.serviceRadius,
											perDistanceCharge: enabled
												? {
														amount: 0,
														currency: $store.service.pricing?.currency || 'USDt',
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
				{#if $store.service.locationDetails?.taskerLocation?.perDistanceCharge}
					<div class="mt-2 flex gap-4">
						<div class="flex-1">
							<label for="perDistanceAmount" class="label" id="perDistanceAmount-label">
								<span class="label-text">{$t('dashboard.services.create.location.per_distance_amount_label')}</span>
							</label>
							<input
								type="number"
								id="perDistanceAmount"
								min="0"
								step="0.01"
								value={$store.service.locationDetails?.taskerLocation?.perDistanceCharge?.amount || 0}
								onchange={(e) => {
									const amount = Number((e.target as HTMLInputElement).value);
									const currentTaskerLocation = $store.service.locationDetails?.taskerLocation;
									if (currentTaskerLocation?.serviceLocation && currentTaskerLocation?.perDistanceCharge) {
										store.updateService({
											locationDetails: {
												...$store.service.locationDetails,
												taskerLocation: {
													serviceLocation: currentTaskerLocation.serviceLocation,
													serviceRadius: currentTaskerLocation.serviceRadius,
													perDistanceCharge: {
														...currentTaskerLocation.perDistanceCharge,
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
						<div class="w-32">
							<label for="perDistanceUnit" class="label" id="perDistanceUnit-label">
								<span class="label-text">{$t('dashboard.services.create.location.per_distance_unit_label')}</span>
							</label>
							<select
								id="perDistanceUnit"
								class="select select-bordered w-full"
								value={$store.service.locationDetails?.taskerLocation?.perDistanceCharge?.unit || 'km'}
								onchange={(e) => {
									const unit = (e.target as HTMLSelectElement).value as 'km' | 'mile';
									const currentTaskerLocation = $store.service.locationDetails?.taskerLocation;
									if (currentTaskerLocation?.serviceLocation && currentTaskerLocation?.perDistanceCharge) {
										store.updateService({
											locationDetails: {
												...$store.service.locationDetails,
												taskerLocation: {
													serviceLocation: currentTaskerLocation.serviceLocation,
													serviceRadius: currentTaskerLocation.serviceRadius,
													perDistanceCharge: {
														...currentTaskerLocation.perDistanceCharge,
														unit
													}
												}
											}
										});
									}
								}}
							>
								<option value="km">km</option>
								<option value="mile">mile</option>
							</select>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Taskee Location Configuration -->
	{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKEE_LOCATION)}
		<div class="card bg-base-200 p-4 space-y-4">
			<h4 class="font-semibold text-lg">{$t('dashboard.services.create.location.taskee_config_title')}</h4>

			<!-- Use Global Location Toggle -->
			<div class="w-full">
				<label class="label cursor-pointer" id="useGlobalLocation-label">
					<span class="label-text">{$t('dashboard.services.create.location.use_global_location_label')}</span>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={$store.service.locationDetails?.taskeeLocation?.useGlobalLocation ?? true}
						onchange={(e) => {
							const useGlobal = (e.target as HTMLInputElement).checked;
							store.updateService({
								locationDetails: {
									...$store.service.locationDetails,
									taskeeLocation: {
										useGlobalLocation: useGlobal,
										serviceLocation: useGlobal ? undefined : getDefaultLocation(),
										locationDisplayName: useGlobal ? undefined : ''
									} as { useGlobalLocation: boolean; serviceLocation?: Location; locationDisplayName?: string }
								}
							});
						}}
					/>
				</label>
				<span class="label-text-alt">{$t('dashboard.services.create.location.use_global_location_hint')}</span>
			</div>

			<!-- Specific Service Location (if not using global) -->
			{#if !$store.service.locationDetails?.taskeeLocation?.useGlobalLocation}
				<div class="w-full">
					<div class="label">
						<span class="label-text">{$t('dashboard.services.create.location.taskee_specific_location_label')}</span>
					</div>
					<EnhancedLocationPicker
						label={$t('dashboard.services.create.location.taskee_location_picker_label')}
						placeholder={$t('dashboard.services.create.location.taskee_location_placeholder')}
						location={$store.service.locationDetails?.taskeeLocation?.serviceLocation || getDefaultLocation()}
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
					/>
				</div>
			{/if}
		</div>
	{/if}

	{#if errors.location}
		<span class="label-text-alt text-error block">{errors.location}</span>
	{/if}
</div>

