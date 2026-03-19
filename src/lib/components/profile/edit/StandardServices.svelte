<script lang="ts">
	import type { StandardService, NostrStandardServices } from '$lib/types/profile.d';
	import { onDestroy, onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { publishStandardServices, subscribeToProfileUpdates } from '$lib/nostr/profile';
	import Input from '$lib/components/Input.svelte';
import { SATS_PER_BTC } from '$lib/utils/helpers/crypto';
import { btcUsd } from '$lib/stores/market-price.store';
	import KINDS from '$lib/utils/constants/kinds';

	let { onComplete } = $props<{
		onComplete: (completed: boolean, fromSave?: boolean) => void;
	}>();

	// Local state
	let services = $state<StandardService[]>([]);
	let customQuoteAvailable = $state(false);
	let isLoading = $state(false);
	let error = $state('');
	let editingService = $state<StandardService | null>(null);
	let addingService = $state(false);
	let successMessage = $state('');
	let isRemovingService = $state<string | null>(null);
	let servicesForm = $state<HTMLDivElement | null>(null);
	let currentEventId = $state<string | null>(null); // Track the current event ID
	let isInitialLoading = $state(false);
	const btcPrice = btcUsd;

	// New service form state
	let newService = $state<Partial<StandardService>>({
		id: '', // Will be set when adding
		name: '',
		description: '',
		duration: 60,
		price: undefined,
		currency: 'USD',
		isCustomizable: false
	});

	let isFormOpen = $derived(addingService || editingService);

	// Available currencies
	const currencies = ['USD', 'Sats'];

	// Duration options (in minutes)
	const durationOptions = [
		{ value: '30', label: '30 minutes' },
		{ value: '60', label: '1 hour' },
		{ value: '90', label: '1.5 hours' },
		{ value: '120', label: '2 hours' },
		{ value: '180', label: '3 hours' },
		{ value: '240', label: '4 hours' },
		{ value: '480', label: '8 hours' }
	];

	let cleanup: (() => void) | null = null;

	onMount(async () => {
		// Subscribe to services updates after init
		
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					isInitialLoading = true;
					if (
						event.kind === KINDS.PROFILE_STANDARD_SERVICES &&
						event.tags.find((t) => t[0] === 'd' && t[1] === 'standard-services')
					) {
						const servicesData = JSON.parse(event.content) as NostrStandardServices;
						// Ensure all services have IDs
						services = servicesData.services.map((service) => ({
							...service,
							id: service.id || generateServiceId()
						}));
						customQuoteAvailable = servicesData.customQuoteAvailable;
						currentEventId = event.id;
					}
				} catch (err) {
					console.error('Failed to subscribe to services updates:', err);
				} finally {
					isInitialLoading = false;
				}
			},
			{
				30003: { d: 'standard-services' }
			}
		);
	});

	onDestroy(() => {
		if (cleanup) cleanup();
	});

	// Generate a unique ID for a service
	function generateServiceId() {
		return `srv-${Math.random().toString(36).substring(2)}-${Date.now().toString(36)}`;
	}

	async function handleCustomQuoteAvailable() {
		customQuoteAvailable = !customQuoteAvailable;
		const tags = [['d', 'standard-services']];
		await publishStandardServices(
			{
				services: services,
				customQuoteAvailable
			},
			tags
		);
	}

	// Add or update service
	async function handleSubmit() {
		if (!newService.name || !newService.description || !newService.duration || !newService.price) {
			error = $t('profile.services.please_fill_required');
			console.log('error', error);
			return;
		}

		try {
			isLoading = true;
			error = '';

			const service: StandardService = {
				id: editingService?.id || generateServiceId(),
				name: newService.name,
				description: newService.description,
				duration: newService.duration || 60,
				price: newService.price || 0,
				currency: newService.currency || 'USD',
				isCustomizable: newService.isCustomizable || false
			};

			const updatedServices = editingService
				? services.map((s) => (s.id === editingService?.id ? service : s))
				: [...services, service];

			const servicesData: NostrStandardServices = {
				services: updatedServices,
				customQuoteAvailable
			};

			// Always use the same d tag for the services list
			const tags = [['d', 'standard-services']];

			await publishStandardServices(servicesData, tags);

			// Notify completion change from save (triggers toast in parent)
			const isComplete = services.length > 0;
			onComplete(isComplete, true);

			// Show success message
			successMessage = editingService
				? $t('profile.services.service_updated_success')
				: $t('profile.services.service_added_success');

			setTimeout(() => (successMessage = ''), 2000);

			// Reset form
			resetForm();
		} catch (err) {
			console.error('Failed to save service:', err);
			error = err instanceof Error ? err.message : $t('profile.services.failed_to_save');
		} finally {
			isLoading = false;
		}
	}

	// Remove service
	async function removeService(service: StandardService) {
		try {
		if (!service.id) {
			appStore.showErrorToast($t('profile.services.cannot_delete_no_id'));
			return;
		}

			isRemovingService = service.id;
			error = '';

			const updatedServices = services.filter((s) => s.id !== service.id);
			const servicesData: NostrStandardServices = {
				services: updatedServices,
				customQuoteAvailable
			};

			const tags = [['d', 'standard-services']];

			await publishStandardServices(servicesData, tags);
			appStore.showSuccessToast($t('profile.services.service_deleted_success'));
		} catch (err) {
			console.error('Failed to remove service:', err);
			error = err instanceof Error ? err.message : $t('profile.services.failed_to_remove');
		} finally {
			isRemovingService = null;
		}
	}

	// Edit service
	function editService(service: StandardService) {
		editingService = service;
		newService = { ...service };
	}

	// Reset form
	function resetForm() {
		addingService = false;
		editingService = null;
		newService = {
			id: '',
			name: '',
			description: '',
			duration: 60,
			price: 0,
			currency: 'USD',
			isCustomizable: false
		};
		error = '';
	}

	// Format price
	function formatPrice(price: number, curr: string) {
		if (curr === 'Sats') {
			return `${price.toLocaleString('en-US')} sats`;
		}
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: curr
		}).format(price);
	}

	// Convert Satoshis to USD using real-time BTC price
	function satsToUsd(sats: number): number {
		if ($btcPrice <= 0) return 0;
		return (sats / SATS_PER_BTC) * $btcPrice;
	}

	// Get price placeholder based on currency
	function getPricePlaceholder(curr: string): string {
		if (curr === 'Sats') {
			return '5000';
		}
		return '5.55';
	}

	// Format duration
	function formatDuration(minutes: number) {
		if (minutes < 60) return `${minutes} ${$t('profile.services.minutes')}`;
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		return remainingMinutes
			? `${hours}h ${remainingMinutes}m`
			: `${hours} ${hours > 1 ? $t('profile.services.hours') : $t('profile.services.hour')}`;
	}

	// Track completion
	$effect(() => {
		const isComplete = services.length > 0;
		onComplete(isComplete);
	});

	// Handle price input validation
	function handlePriceInput(event: Event) {
		const target = event.target as HTMLInputElement;
		let value = target.value;

		// For Satoshis, only allow whole numbers (no decimals)
		if (newService.currency === 'Sats') {
			// Remove any non-numeric characters
			value = value.replace(/[^0-9]/g, '');
			
			// Ensure value is not negative
			const numericValue = parseInt(value) || 0;
			if (numericValue < 0) {
				value = '0';
			}
		} else {
			// For USD, allow decimals
			// Remove any non-numeric characters except decimal point
			value = value.replace(/[^0-9.]/g, '');

			// Prevent multiple decimal points
			const decimalCount = (value.match(/\./g) || []).length;
			if (decimalCount > 1) {
				value = value.replace(/\.(?=.*\.)/, '');
			}

			// Limit to 2 decimal places
			if (value.includes('.')) {
				const parts = value.split('.');
				if (parts[1] && parts[1].length > 2) {
					value = parts[0] + '.' + parts[1].substring(0, 2);
				}
			}

			// Ensure value is not negative
			const numericValue = parseFloat(value);
			if (numericValue < 0) {
				value = '0';
			}
		}

		// Update the input value and the state
		target.value = value;
		newService.price = newService.currency === 'Sats' ? parseInt(value) || 0 : parseFloat(value) || 0;
	}
</script>

{#if isInitialLoading}
	<div class="space-y-8">
		<!-- Services List Skeleton -->
		<div class="grid gap-6 md:grid-cols-2">
			{#each Array(2) as _}
				<div class="card bg-base-200 border-base-200 rounded-xl border shadow-lg">
					<div class="card-body">
						<!-- Service Title -->
						<div class="bg-base-300 h-6 w-48 animate-pulse rounded"></div>

						<!-- Service Description -->
						<div class="bg-base-300 mt-2 h-16 w-full animate-pulse rounded"></div>

						<!-- Price and Duration -->
						<div class="mt-4 grid grid-cols-2 gap-4">
							<div class="bg-base-300 h-8 w-full animate-pulse rounded"></div>
							<div class="bg-base-300 h-8 w-full animate-pulse rounded"></div>
						</div>

						<!-- Actions -->
						<div class="card-actions mt-4 justify-end">
							<div class="bg-base-300 h-8 w-20 animate-pulse rounded"></div>
							<div class="bg-base-300 h-8 w-20 animate-pulse rounded"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Add Service Button Skeleton -->
		<div class="flex justify-end">
			<div class="bg-base-300 h-8 w-32 animate-pulse rounded"></div>
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<!-- Custom Quote Option -->
		<div class="form-control">
			<label class="label cursor-pointer">
				<span class="label-text font-medium">{$t('profile.services.custom_quote')}</span>
				<input
					type="checkbox"
					checked={customQuoteAvailable}
					onchange={handleCustomQuoteAvailable}
					class="toggle toggle-primary"
				/>
			</label>
		</div>

		<div class="card-title flex items-center justify-between">
			<button
				aria-label={$t('profile.services.add_service')}
				class="btn btn-circle btn-outline btn-xs"
				onclick={() => (addingService = !addingService)}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
					<g
						fill="none"
						stroke="#fff"
						stroke-dasharray="16"
						stroke-dashoffset="16"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
					>
						<path d="M5 12h14">
							<animate fill="freeze" attributeName="stroke-dashoffset" dur="0.4s" values="16;0" />
						</path>
						{#if !addingService}
							<path d="M12 5v14">
								<animate
									fill="freeze"
									attributeName="stroke-dashoffset"
									begin="0.4s"
									dur="0.4s"
									values="16;0"
								/>
							</path>
						{/if}
					</g>
				</svg>
			</button>
		</div>

		<div class="space-y-8" bind:this={servicesForm}>
			<!-- Service Form -->
			{#if isFormOpen}
				<div class="card border-base-300 rounded-xl border p-4">
					<h3 class="mb-4 text-lg font-medium">
						{editingService
							? $t('profile.services.edit_service')
							: $t('profile.services.add_service')}
					</h3>

					<div class="space-y-4">
						<!-- Service Name -->
						<div class="form-control">
							<label class="label" for="serviceName">
								<span class="label-text font-medium">{$t('profile.services.service_name')}</span>
								<span class="label-text-alt">{$t('common.required')}</span>
							</label>
							<input
								type="text"
								id="serviceName"
								bind:value={newService.name}
								class="input input-bordered w-full"
								placeholder={$t('profile.services.service_name_placeholder')}
								required
							/>
						</div>

						<!-- Service Description -->
						<div class="form-control">
							<label class="label" for="serviceDescription">
								<span class="label-text font-medium">{$t('profile.services.description')}</span>
								<span class="label-text-alt">{$t('common.required')}</span>
							</label>
							<textarea
								id="serviceDescription"
								bind:value={newService.description}
								class="textarea textarea-bordered h-24 w-full rounded-xl"
								placeholder={$t('profile.services.description_placeholder')}
								required
							></textarea>
						</div>

						<div class="grid gap-4 md:grid-cols-2">
							<!-- Duration -->
							<div class="form-control">
								<label class="label" for="serviceDuration">
									<span class="label-text font-medium">{$t('profile.services.duration')}</span>
								</label>
								<Input
									type="number"
									id="serviceDuration"
									value={newService.duration?.toString()}
									min={0}
									step={1}
									options={durationOptions}
									onChange={({ value }) => {
										newService.duration = parseInt(value);
									}}
								/>
							</div>

							<!-- Price and Currency -->
							<div class="form-control">
								<label class="label" for="servicePrice">
									<span class="label-text font-medium">{$t('profile.services.price')}</span>
									<span class="label-text-alt">({$t('common.required')})</span>
								</label>
								<div class="join w-full">
									<select
										class="select select-bordered join-item w-1/2"
										bind:value={newService.currency}
									>
										{#each currencies as curr}
											<option value={curr}>{curr}</option>
										{/each}
									</select>
									<input
										type="text"
										id="servicePrice"
										value={newService.price?.toString() || ''}
										required={true}
										placeholder={getPricePlaceholder(newService.currency || 'USD')}
										class="input input-bordered join-item w-full {!newService.price && error
											? 'border-error'
											: ''}"
										oninput={handlePriceInput}
									/>
								</div>
								{#if newService.currency === 'Sats' && newService.price && newService.price > 0}
									<div class="label">
										<span class="label-text-alt text-base-content/70">
											≈ ${satsToUsd(newService.price).toFixed(2)} USD
										</span>
									</div>
								{/if}
							</div>
						</div>

						<!-- Customizable -->
						<div class="form-control flex items-center justify-start">
							<label class="label cursor-pointer">
								<span class="label-text font-medium">{$t('profile.services.customizable')}</span>
								<input
									type="checkbox"
									bind:checked={newService.isCustomizable}
									class="checkbox checkbox-primary"
								/>
							</label>
						</div>

						<!-- Error Message -->
						{#if error}
							<div class="alert alert-error alert-outline">
								<span>{error}</span>
							</div>
						{/if}

						<!-- Success Message -->
						{#if successMessage}
							<div class="alert alert-success alert-outline">
								<span>{successMessage}</span>
							</div>
						{/if}

						<!-- Form Actions -->
						<div class="flex justify-end gap-2">
							{#if editingService}
								<button class="btn btn-ghost" onclick={resetForm}>{$t('profile.services.cancel')}</button>
							{/if}
							<button
								class="btn btn-primary"
								onclick={handleSubmit}
								disabled={isLoading || !newService.name || !newService.description}
							>
								{#if isLoading}
									<span class="loading loading-spinner"></span>
								{/if}
								{editingService ? $t('profile.services.update_service') : $t('profile.services.add_service')}
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Services List -->
			{#if services.length > 0}
				<div class="grid gap-4 md:grid-cols-2">
					{#each services as service}
						<div class="card bg-base-200 border-base-200 rounded-xl border shadow-lg">
							<div class="card-body">
								<div class="flex items-start justify-between">
									<div>
										<h3 class="card-title">{service.name}</h3>
										<p class="text-base-content/70 line-clamp-4">{service.description}</p>
									</div>
									<div class="flex gap-2">
										<button
											aria-label={$t('common.edit')}
											class="btn btn-ghost btn-circle btn-xs sm:btn-sm"
											onclick={() => {
												editService(service);
												servicesForm?.scrollIntoView({ behavior: 'smooth' });
											}}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="20"
												height="20"
												viewBox="0 0 24 24"
												><g fill="none"
													><path
														stroke="#fff"
														d="m5.93 19.283l.021-.006l2.633-.658l.045-.01c.223-.056.42-.105.599-.207s.322-.245.484-.407l.033-.033l7.194-7.194l.024-.024c.313-.313.583-.583.77-.828c.2-.263.353-.556.353-.916s-.152-.653-.353-.916c-.187-.245-.457-.515-.77-.828l-.024-.024l-.353.354l.353-.354l-.171-.171l-.024-.024c-.313-.313-.583-.583-.828-.77c-.263-.2-.556-.353-.916-.353s-.653.152-.916.353c-.245.187-.515.457-.828.77l-.024.024l-7.194 7.194l-.033.032c-.162.163-.306.306-.407.485c-.102.18-.15.376-.206.6l-.011.044l-.664 2.654l-.007.027a4 4 0 0 0-.095.464c-.015.155-.011.416.198.626s.47.213.625.197a3.4 3.4 0 0 0 .492-.101Z"
														stroke-width="1"
													/><path fill="#fff" d="m12.5 7.5l3-2l3 3l-2 3z" /></g
												></svg
											>
										</button>
										<button
											class="btn btn-ghost btn-circle btn-xs sm:btn-sm text-error"
											onclick={() => removeService(service)}
											disabled={isRemovingService === service.id}
										>
											{#if isRemovingService === service.id}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												✕
											{/if}
										</button>
									</div>
								</div>

								<div class="mt-4 flex flex-wrap gap-2">
									<span class="badge badge-primary">
										{formatPrice(service.price, service.currency)}
									</span>
									<span class="badge badge-ghost">
										{formatDuration(service.duration)}
									</span>
									{#if service.isCustomizable}
										<span class="badge badge-secondary">{$t('profile.services.customizable')}</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert alert-outline">
					<span>{$t('profile.services.no_services')}</span>
				</div>
			{/if}
		</div>
	</div>
{/if}
