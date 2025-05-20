<script lang="ts">
	import { UpdateUserProfileStore } from '$houdini';
	import Input from '$lib/components/Input.svelte';

	interface ServiceOption {
		id: string;
		name: string;
		description: string;
		duration: number; // minutes
		price: number;
		isCustomizable: boolean;
	}

	interface StandardServicesData {
		services: ServiceOption[];
		currency: string;
		customQuoteAvailable: boolean;
		minimumBookingDuration: number; // minutes
	}

	let { user, onComplete } = $props<{
		user: { standardServices?: StandardServicesData | null } | null | undefined;
		onComplete: (completed: boolean) => void;
	}>();

	const profileStore = new UpdateUserProfileStore();

	// Local state
	let services = $state<ServiceOption[]>(user?.standardServices?.services || []);
	let currency = $state(user?.standardServices?.currency || 'USD');
	let customQuoteAvailable = $state(user?.standardServices?.customQuoteAvailable ?? true);
	let minimumBookingDuration = $state(user?.standardServices?.minimumBookingDuration || 60);
	let isLoading = $state(false);
	let error = $state('');

	// New service form state
	let newService = $state<Partial<ServiceOption>>({
		name: '',
		description: '',
		duration: 60,
		price: 0,
		isCustomizable: false
	});

	// Available currencies
	const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR'];

	// Duration options (in minutes)
	const durationOptions = [
		{ value: 30, label: '30 minutes' },
		{ value: 60, label: '1 hour' },
		{ value: 90, label: '1.5 hours' },
		{ value: 120, label: '2 hours' },
		{ value: 180, label: '3 hours' },
		{ value: 240, label: '4 hours' },
		{ value: 480, label: '8 hours' }
	];

	// Track completion
	$effect(() => {
		const isComplete = services.length > 0;
		onComplete(isComplete);
	});

	// Add new service
	function addService() {
		if (!newService.name || !newService.description) {
			error = 'Please fill in all required fields';
			return;
		}

		services = [
			...services,
			{
				id: `service-${Date.now()}`,
				name: newService.name,
				description: newService.description,
				duration: newService.duration || 60,
				price: newService.price || 0,
				isCustomizable: newService.isCustomizable || false
			}
		];

		// Reset form
		newService = {
			name: '',
			description: '',
			duration: 60,
			price: 0,
			isCustomizable: false
		};
	}

	// Remove service
	function removeService(id: string) {
		services = services.filter((service) => service.id !== id);
	}

	// Format price
	function formatPrice(price: number, curr: string = currency) {
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

	// Save services
	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';

			if (services.length === 0) {
				error = 'Please add at least one service';
				return;
			}

			// Create services data
			const servicesData: StandardServicesData = {
				services,
				currency,
				customQuoteAvailable,
				minimumBookingDuration
			};

			// Update profile using GraphQL
			const result = await profileStore.mutate({
				input: {
					standardServices: servicesData
				}
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			// Show success message
			const toast = document.getElementById('services-toast-success');
			if (toast) toast.style.display = 'block';
		} catch (err) {
			console.error('Services update failed:', err);
			error = err instanceof Error ? err.message : 'Failed to update services';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Currency Selection -->
	<div class="form-control">
		<label class="label" for="currency">
			<span class="label-text font-medium">Currency</span>
		</label>
		<Input
			id="currency"
			options={currencies.map((currency) => ({ label: currency, value: currency }))}
			value={currency}
		/>
	</div>

	<!-- Booking Preferences -->
	<div class="grid gap-4 md:grid-cols-2">
		<!-- Minimum Booking Duration -->
		<div class="form-control">
			<label class="label" for="minDuration">
				<span class="label-text font-medium">Minimum Booking Duration</span>
			</label>
			<Input
				id="minDuration"
				options={durationOptions.map((option) => ({
					label: option.label,
					value: option.value.toString()
				}))}
				value={minimumBookingDuration}
			/>
		</div>

		<!-- Custom Quote Option -->
		<div class="form-control">
			<label class="label cursor-pointer">
				<span class="label-text font-medium">Allow Custom Quote Requests</span>
				<input type="checkbox" bind:checked={customQuoteAvailable} class="toggle toggle-primary" />
			</label>
			<p class="text-base-content/70 text-sm">
				Let clients request custom quotes for services not listed
			</p>
		</div>
	</div>

	<!-- Add New Service -->
	<div class="card p-6 rounded-xl border border-white/50 shadow-md">
		<h3 class="mb-4 text-lg font-medium">Add New Service</h3>

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
					<select
						id="serviceDuration"
						bind:value={newService.duration}
						class="select select-bordered w-full"
					>
						{#each durationOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>

				<!-- Price -->
				<div class="form-control">
					<label class="label" for="servicePrice">
						<span class="label-text font-medium">Price</span>
					</label>
					<div class="join">
						<span class="join-item bg-base-200 flex items-center px-3">
							{currency}
						</span>
						<input
							type="number"
							id="servicePrice"
							bind:value={newService.price}
							min="0"
							step="0.01"
							class="input input-bordered join-item w-full"
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

			<div class="flex justify-end">
				<button
					class="btn btn-primary"
					onclick={addService}
					disabled={!newService.name || !newService.description}
				>
					Add Service
				</button>
			</div>
		</div>
	</div>

	<!-- Services List -->
	{#if services.length > 0}
		<div class="space-y-4">
			<h3 class="text-lg font-medium">Your Services</h3>

			<div class="grid gap-4 md:grid-cols-2">
				{#each services as service}
					<div class="card bg-base-100 shadow-lg">
						<div class="card-body">
							<div class="flex items-start justify-between">
								<div>
									<h3 class="card-title">{service.name}</h3>
									<p class="text-base-content/70">{service.description}</p>
								</div>
								<button
									class="btn btn-ghost btn-sm text-error"
									onclick={() => removeService(service.id)}
								>
									✕
								</button>
							</div>

							<div class="mt-4 flex flex-wrap gap-4">
								<span class="badge badge-primary">
									{formatPrice(service.price)}
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
		</div>
	{:else}
		<div class="alert">
			<span>No services added yet. Add some services to start receiving bookings.</span>
		</div>
	{/if}

	<!-- Error Message -->
	{#if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Submit Button -->
	<div class="flex justify-end">
		<button
			class="btn btn-primary"
			onclick={handleSubmit}
			disabled={isLoading || services.length === 0}
		>
			{#if isLoading}
				<span class="loading loading-spinner"></span>
			{/if}
			Save Services
		</button>
	</div>
</div>

<!-- Success Toast -->
<div id="services-toast-success" class="toast toast-end" style="display: none;">
	<div class="alert alert-success">
		<span>Services updated successfully!</span>
	</div>
</div>
