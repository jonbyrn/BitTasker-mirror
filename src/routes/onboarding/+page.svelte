<script lang="ts">
	import { onMount } from 'svelte';
	import { z } from 'zod';
	import { fly } from 'svelte/transition';
	import {
		sequentialTransition,
		addViewTransitionStyles,
		navigateWithTransition
	} from '$lib/utils/viewTransition';
	import { completeUserOnboarding } from '$lib/services/user.service';
	import { tryCatch } from '$lib/utils/tryCatch';
	import type { OnboardingRequest } from '$lib/types/onboarding';

	// Define reactive state with Svelte 5 runes
	let userType = $state<'CLIENT' | 'FREELANCER' | 'BOTH'>('CLIENT');
	let fullName = $state('');
	let email = $state('');
	let address1 = $state('');
	let address2 = $state('');
	let city = $state('');
	let stateName = $state('');
	let postalCode = $state('');
	let country = $state('');

	// Progress tracking
	let currentStep = $state(1);
	let totalSteps = $state(3);
	let isAnimating = $state(false);
	let isLoading = $state(false);

	// Form validation errors
	let errors = $state({
		step1: '',
		step2: '',
		step3: ''
	});

	// Animation direction for transitions
	let direction = $state(1); // 1 for forward, -1 for backward

	// Define Zod schemas for each step
	const step1Schema = z.object({
		userType: z.enum(['CLIENT', 'FREELANCER'])
	});

	const step2Schema = z.object({
		fullName: z.string().min(2, 'Full name is required'),
		email: z.string().email('Please enter a valid email address')
	});

	const step3Schema = z.object({
		address1: z.string().min(3, 'Address is required'),
		address2: z.string().optional(),
		city: z.string().min(2, 'City is required'),
		stateName: z.string().min(1, 'State/Province is required'),
		postalCode: z.string().min(3, 'Postal/ZIP code is required'),
		country: z.string().min(2, 'Country is required')
	});

	// Form validation
	let isFormValid = $derived(
		fullName !== '' &&
			email !== '' &&
			address1 !== '' &&
			city !== '' &&
			stateName !== '' &&
			postalCode !== '' &&
			country !== ''
	);

	async function handleSubmit(e: Event) {
		e.preventDefault();

		// Validate the final step before submission
		try {
			step3Schema.parse({
				address1,
				address2,
				city,
				stateName,
				postalCode,
				country
			});

			// Here you would submit the data to your API
			const userData: OnboardingRequest = {
				userType: userType,
				userInfo: {
					fullName: fullName,
					email: email
				},
				location: {
					address1: address1,
					address2: address2,
					city: city,
					state: stateName,
					postalCode: postalCode,
					country: country,
					latitude: 0, // These would be populated by a geocoding service
					longitude: 0
				}
			};

			isLoading = true;
			const { data: response, error } = await tryCatch(completeUserOnboarding(userData));
			if (error) {
				console.error('Error:', error);
				errors.step3 = error.message;
			} else {
				console.log('Response:', response);
				navigateWithTransition('/dashboard');
			}
			isLoading = false;
		} catch (error) {
			if (error instanceof z.ZodError) {
				errors.step3 = error.errors[0].message;
			}
		}
	}

	function validateCurrentStep(): boolean {
		switch (currentStep) {
			case 1:
				const result1 = step1Schema.safeParse({ userType });
				if (!result1.success) {
					errors.step1 = result1.error.errors[0].message;
					return false;
				}
				errors.step1 = '';
				return true;
			case 2:
				const result2 = step2Schema.safeParse({ fullName, email });
				if (!result2.success) {
					errors.step2 = result2.error.errors[0].message;
					return false;
				}
				errors.step2 = '';
				return true;
			case 3:
				const result3 = step3Schema.safeParse({
					address1,
					address2,
					city,
					stateName,
					postalCode,
					country
				});
				if (!result3.success) {
					errors.step3 = result3.error.errors[0].message;
					return false;
				}
				errors.step3 = '';
				return true;
			default:
				return false;
		}
	}

	async function nextStep() {
		if (currentStep < totalSteps && !isAnimating) {
			if (validateCurrentStep()) {
				isAnimating = true;
				direction = 1;

				// Update view transition direction for animations
				addViewTransitionStyles(direction);

				// Use sequential transition for smoother animation
				await sequentialTransition(
					() => {
						currentStep++;
					},
					300,
					direction
				);

				isAnimating = false;
			}
		}
	}

	async function prevStep() {
		if (currentStep > 1 && !isAnimating) {
			isAnimating = true;
			direction = -1;

			// Update view transition direction for animations
			addViewTransitionStyles(direction);

			// Use sequential transition
			await sequentialTransition(
				() => {
					currentStep--;
				},
				300,
				direction
			);

			isAnimating = false;
		}
	}

	onMount(() => {
		// Initialize view transition styles
		addViewTransitionStyles(1);
	});
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4 pt-20">
	<div class="card bg-base-100 w-full max-w-2xl shadow-xl">
		<div class="card-body p-4 text-sm md:p-8 md:text-base">
			<h2 class="mb-2 text-center text-3xl font-bold">Welcome to Our Platform!</h2>
			<p class="text-base-content/70 mb-6 text-center">
				Let's get your profile set up so you can get started.
			</p>

			<!-- Progress indicator -->
			<div class="mb-8 w-full">
				<progress class="progress progress-primary w-full" value={currentStep} max={totalSteps}
				></progress>
				<div class="mt-2 flex justify-between text-sm">
					<span
						class={currentStep >= 1
							? 'text-primary font-xs md:font-medium'
							: 'text-base-content/50'}>Profile Type</span
					>
					<span
						class={currentStep >= 2
							? 'text-primary font-xs md:font-medium'
							: 'text-base-content/50'}>Personal Info</span
					>
					<span
						class={currentStep >= 3
							? 'text-primary font-xs md:font-medium'
							: 'text-base-content/50'}>Location</span
					>
				</div>
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				<!-- Step content container with transition support -->
				<div class="step-content-container max-h-[70vh] overflow-y-auto md:min-h-[45vh]">
					<!-- Step 1: User Type -->
					{#if currentStep === 1}
						<div
							class="form-control px-1"
							in:fly={{ x: direction > 0 ? 100 : -100, duration: 250, delay: 300 }}
							out:fly={{ x: direction > 0 ? -100 : 100, duration: 250, delay: 0 }}
						>
							<span class="label-text text-lg font-medium">What best describes you?</span>

							<div class="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
								<label
									class="flex cursor-pointer flex-col rounded-lg border p-4 transition-all {userType ===
									'CLIENT'
										? 'border-primary bg-primary/10'
										: 'border-base-300 hover:border-primary/50'}"
								>
									<input
										type="radio"
										name="userType"
										class="hidden"
										value="CLIENT"
										bind:group={userType}
										checked={userType === 'CLIENT'}
									/>
									<div class="mb-3 flex h-12 items-center justify-center">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-primary h-8 w-8"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
											/>
										</svg>
									</div>
									<div class="text-center">
										<span class="font-semibold">Client</span>
										<p class="text-base-content/70 mt-1 text-sm">
											I want to hire experts for my projects
										</p>
									</div>
								</label>

								<label
									class="flex cursor-pointer flex-col rounded-lg border p-4 transition-all {userType ===
									'FREELANCER'
										? 'border-primary bg-primary/10'
										: 'border-base-300 hover:border-primary/50'}"
								>
									<input
										type="radio"
										name="userType"
										class="hidden"
										value="FREELANCER"
										bind:group={userType}
										checked={userType === 'FREELANCER'}
									/>
									<div class="mb-3 flex h-12 items-center justify-center">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-primary h-8 w-8"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
											/>
										</svg>
									</div>
									<div class="text-center">
										<span class="font-semibold">Freelancer</span>
										<p class="text-base-content/70 mt-1 text-sm">
											I want to work on projects and get paid
										</p>
									</div>
								</label>
							</div>

							{#if errors.step1}
								<div class="text-error mt-4 text-sm">{errors.step1}</div>
							{/if}
						</div>
					{/if}

					<!-- Step 2: Personal Information -->
					{#if currentStep === 2}
						<div
							class="space-y-4"
							in:fly={{ x: direction > 0 ? 100 : -100, duration: 250, delay: 300 }}
							out:fly={{ x: direction > 0 ? -100 : 100, duration: 250, delay: 0 }}
						>
							<h3 class="text-lg font-medium">Personal Information</h3>

							<div class="form-control px-1">
								<span class="label-text">Full Name</span>

								<input
									type="text"
									placeholder="John Doe"
									class="input input-bordered w-full"
									bind:value={fullName}
									required
								/>
							</div>

							<div class="form-control px-1">
								<span class="label-text">Email</span>

								<input
									type="email"
									placeholder="example@domain.com"
									class="input input-bordered w-full"
									bind:value={email}
									required
								/>
							</div>

							{#if errors.step2}
								<div class="text-error mt-2 text-sm">{errors.step2}</div>
							{/if}
						</div>
					{/if}

					<!-- Step 3: Location -->
					{#if currentStep === 3}
						<div
							class="space-y-4"
							in:fly={{ x: direction > 0 ? 100 : -100, duration: 250, delay: 300 }}
							out:fly={{ x: direction > 0 ? -100 : 100, duration: 250, delay: 0 }}
						>
							<h3 class="text-lg font-medium">Your Location</h3>

							<div class="form-control px-1">
								<span class="label-text">Address Line 1</span>

								<input
									type="text"
									placeholder="123 Main St"
									class="input input-bordered w-full"
									bind:value={address1}
									required
								/>
							</div>

							<div class="form-control px-1">
								<span class="label-text">Address Line 2 (Optional)</span>

								<input
									type="text"
									placeholder="Apt, Suite, Unit, etc."
									class="input input-bordered w-full"
									bind:value={address2}
								/>
							</div>

							<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div class="form-control px-1">
									<span class="label-text">City</span>

									<input
										type="text"
										placeholder="New York"
										class="input input-bordered w-full"
										bind:value={city}
										required
									/>
								</div>

								<div class="form-control px-1">
									<span class="label-text">State/Province</span>

									<input
										type="text"
										placeholder="NY"
										class="input input-bordered w-full"
										bind:value={stateName}
										required
									/>
								</div>
							</div>

							<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div class="form-control px-1">
									<span class="label-text">Postal/ZIP Code</span>

									<input
										type="text"
										placeholder="10001"
										class="input input-bordered w-full"
										bind:value={postalCode}
										required
									/>
								</div>

								<div class="form-control px-1">
									<span class="label-text">Country</span>

									<select class="select select-bordered w-full" bind:value={country} required>
										<option value="" disabled selected>Select country</option>
										<option value="United States">United States</option>
										<option value="Canada">Canada</option>
										<option value="United Kingdom">United Kingdom</option>
										<option value="Australia">Australia</option>
										<option value="Germany">Germany</option>
										<option value="France">France</option>
										<option value="Japan">Japan</option>
										<option value="China">China</option>
										<option value="India">India</option>
										<option value="Brazil">Brazil</option>
										<!-- Add more countries as needed -->
									</select>
								</div>
							</div>

							{#if errors.step3}
								<div class="text-error mt-2 text-sm">{errors.step3}</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Navigation buttons -->
				<div class="mt-8 flex justify-between">
					{#if currentStep > 1}
						<button type="button" class="btn btn-outline" onclick={prevStep} disabled={isAnimating}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-2 h-5 w-5"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
							Back
						</button>
					{:else}
						<div></div>
					{/if}

					{#if currentStep < totalSteps}
						<button type="button" class="btn btn-primary" onclick={nextStep} disabled={isAnimating}>
							Next
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="ml-2 h-5 w-5"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
					{:else}
						<button
							type="submit"
							class="btn btn-primary"
							class:loading={isLoading}
							disabled={!isFormValid || isAnimating || isLoading}
						>
							{isLoading ? 'Completing...' : 'Complete Setup'}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="ml-2 h-5 w-5"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
					{/if}
				</div>
			</form>
		</div>
	</div>
</div>
