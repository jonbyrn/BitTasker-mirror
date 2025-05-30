<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import type { StandardService, NostrStandardServices } from '$lib/types/profile.d';
	import {
		publishStandardServices,
		deleteStandardService,
		subscribeToProfileUpdates
	} from '$lib/nostr/profile';
	import Input from '$lib/components/Input.svelte';

	let { onComplete } = $props<{
		onComplete: (completed: boolean) => void;
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
	const currencies = ['BTC', 'USD'];

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
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					if (
						event.kind === 30003 &&
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
			error = 'Please fill in all required fields';
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

			// Show success message
			successMessage = editingService
				? 'Service updated successfully!'
				: 'Service added successfully!';

			setTimeout(() => (successMessage = ''), 2000);

			// Reset form
			resetForm();
		} catch (err) {
			console.error('Failed to save service:', err);
			error = err instanceof Error ? err.message : 'Failed to save service';
		} finally {
			isLoading = false;
		}
	}

	// Remove service
	async function removeService(service: StandardService) {
		try {
			if (!service.id) {
				appStore.showErrorToast('Cannot delete service: No ID found');
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
			appStore.showSuccessToast('Service deleted successfully!');
		} catch (err) {
			console.error('Failed to remove service:', err);
			error = err instanceof Error ? err.message : 'Failed to remove service';
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
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: curr
		}).format(price);
	}

	// Format duration
	function formatDuration(minutes: number) {
		if (minutes < 60) return `${minutes} minutes`;
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		return remainingMinutes
			? `${hours}h ${remainingMinutes}m`
			: `${hours} hour${hours > 1 ? 's' : ''}`;
	}

	// Track completion
	$effect(() => {
		const isComplete = services.length > 0;
		onComplete(isComplete);
	});
</script>

<div class="space-y-6">
	<!-- Custom Quote Option -->
	<div class="form-control">
		<label class="label cursor-pointer">
			<span class="label-text font-medium">Allow Custom Quote Requests</span>
			<input
				type="checkbox"
				checked={customQuoteAvailable}
				onchange={handleCustomQuoteAvailable}
				class="toggle toggle-primary"
			/>
		</label>
		<p class="text-base-content/70 text-sm">
			Let clients request custom quotes for services not listed
		</p>
	</div>

	<div class="card-title flex items-center justify-between">
		<h2 class="card-title">Services</h2>
		<button
			aria-label="Add Service"
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
					{editingService ? 'Edit Service' : 'Add Service'}
				</h3>

				<div class="space-y-4">
					<!-- Service Name -->
					<div class="form-control">
						<label class="label" for="serviceName">
							<span class="label-text font-medium">Service Name</span>
							<span class="label-text-alt">Required</span>
						</label>
						<input
							type="text"
							id="serviceName"
							bind:value={newService.name}
							class="input input-bordered w-full"
							placeholder="e.g. Basic Website Development"
							required
						/>
					</div>

					<!-- Service Description -->
					<div class="form-control">
						<label class="label" for="serviceDescription">
							<span class="label-text font-medium">Description</span>
							<span class="label-text-alt">Required</span>
						</label>
						<textarea
							id="serviceDescription"
							bind:value={newService.description}
							class="textarea textarea-bordered h-24 w-full rounded-xl"
							placeholder="Describe what's included in this service..."
							required
						></textarea>
					</div>

					<div class="grid gap-4 md:grid-cols-3">
						<!-- Duration -->
						<div class="form-control">
							<label class="label" for="serviceDuration">
								<span class="label-text font-medium">Duration</span>
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
								<span class="label-text font-medium">Price</span>
								<span class="label-text-alt">(Required)</span>
							</label>
							<div class="join">
								<select
									class="select select-bordered join-item w-1/3"
									bind:value={newService.currency}
								>
									{#each currencies as curr}
										<option value={curr}>{curr}</option>
									{/each}
								</select>
								<input
									type="number"
									id="servicePrice"
									bind:value={newService.price}
									required={true}
									min="0"
									step="0.01"
									class="input input-bordered join-item w-full {!newService.price && error
										? 'border-error'
										: ''}"
								/>
							</div>
						</div>

						<!-- Customizable -->
						<div class="form-control">
							<label class="label cursor-pointer">
								<span class="label-text font-medium">Customizable</span>
								<input
									type="checkbox"
									bind:checked={newService.isCustomizable}
									class="checkbox checkbox-primary"
								/>
							</label>
						</div>
					</div>

					<!-- Error Message -->
					{#if error}
						<div class="alert alert-error">
							<span>{error}</span>
						</div>
					{/if}

					<!-- Success Message -->
					{#if successMessage}
						<div class="alert alert-success">
							<span>{successMessage}</span>
						</div>
					{/if}

					<!-- Form Actions -->
					<div class="flex justify-end gap-2">
						{#if editingService}
							<button class="btn btn-ghost" onclick={resetForm}> Cancel </button>
						{/if}
						<button
							class="btn btn-primary"
							onclick={handleSubmit}
							disabled={isLoading || !newService.name || !newService.description}
						>
							{#if isLoading}
								<span class="loading loading-spinner"></span>
							{/if}
							{editingService ? 'Update Service' : 'Add Service'}
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
									<p class="text-base-content/70">{service.description}</p>
								</div>
								<div class="flex gap-2">
									<button
										aria-label="Edit Service"
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
									<span class="badge badge-secondary"> Customizable </span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="alert">
				<span>No services added yet. Add some services to start receiving bookings.</span>
			</div>
		{/if}
	</div>
</div>
