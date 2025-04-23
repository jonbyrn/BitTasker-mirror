<script lang="ts">
	import { onMount } from 'svelte';
	import { z } from 'zod';
	import { fly } from 'svelte/transition';
	import {
		sequentialTransition,
		addViewTransitionStyles,
		navigateWithTransition
	} from '$lib/utils/viewTransition';
	import { t, setLocale } from '$lib/stores/i18n.store';
	import { deviceInfo } from '$lib/stores/deviceInfo.store';
	import { graphql } from '$houdini';
	import { tryCatch } from '$lib/utils/tryCatch';

	const updateUserMutation = graphql(`
		mutation UpdateUser($input: UpdateUserInput!) {
			updateUser(input: $input) {
				id
			}
		}
	`);

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

			isLoading = true;

			// Use GraphQL mutation with tryCatch utility
			const { data, error } = await tryCatch(
				updateUserMutation.mutate({
					input: {
						name: fullName,
						email: email,
						userRole: userType,
						address: {
							city: city,
							country: country,
							postalCode: postalCode,
							state: stateName,
							street: address2 ? `${address1}, ${address2}` : address1
						}
					}
				})
			);

			if (error) {
				errors.step3 = error.message;
			} else if (data.errors) {
				errors.step3 = data.errors[0].message;
			} else if (data.data?.updateUser.id) {
				navigateWithTransition('/dashboard');
			} else {
				errors.step3 = 'An unknown error occurred';
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
					console.log('Error:', result3.error);
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
	<div class="card bg-base-100 relative w-full max-w-2xl shadow-xl">
		<!-- Language selector - only shown on native devices -->
		{#if $deviceInfo?.platform === 'ios' || $deviceInfo?.platform === 'android'}
			<div class="absolute top-1 right-1 z-10">
				<div class="dropdown dropdown-end">
					<div tabindex="0" role="button" class="btn btn-ghost btn-sm">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-1 h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
							/>
						</svg>
					</div>
					<ul class="dropdown-content menu bg-base-100 rounded-box z-10 w-52 p-2 shadow">
						<li><button onclick={() => setLocale('en')}>English</button></li>
						<li><button onclick={() => setLocale('es')}>Español</button></li>
					</ul>
				</div>
			</div>
		{/if}

		<div class="card-body p-4 text-sm md:p-8 md:text-base">
			<h2 class="mb-2 text-center text-3xl font-bold">{$t('onboarding.page.title')}</h2>
			<p class="text-base-content/70 mb-6 text-center">
				{$t('onboarding.page.subtitle')}
			</p>

			<!-- Progress indicator -->
			<div class="mb-8 w-full">
				<progress class="progress progress-primary w-full" value={currentStep} max={totalSteps}
				></progress>
				<div class="mt-2 flex justify-between text-sm">
					<span
						class={currentStep >= 1
							? 'text-primary font-xs md:font-medium'
							: 'text-base-content/50'}>{$t('onboarding.step.profile_type')}</span
					>
					<span
						class={currentStep >= 2
							? 'text-primary font-xs md:font-medium'
							: 'text-base-content/50'}>{$t('onboarding.step.personal_info')}</span
					>
					<span
						class={currentStep >= 3
							? 'text-primary font-xs md:font-medium'
							: 'text-base-content/50'}>{$t('onboarding.step.location')}</span
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
							<span class="label-text text-lg font-medium"
								>{$t('onboarding.profile_type.question')}</span
							>

							<div class="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
								<button
									tabindex="0"
									class="flex cursor-pointer flex-col rounded-lg border p-4 transition-all {userType ===
									'CLIENT'
										? 'border-primary bg-primary/10'
										: 'border-base-300 hover:border-primary/50'}"
									onclick={() => {
										userType = 'CLIENT';
									}}
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
										<span class="font-semibold">{$t('onboarding.profile_type.client')}</span>
										<p class="text-base-content/70 mt-1 text-sm">
											{$t('onboarding.profile_type.client_desc')}
										</p>
									</div>
								</button>

								<button
									tabindex="0"
									class="flex cursor-pointer flex-col rounded-lg border p-4 transition-all {userType ===
									'FREELANCER'
										? 'border-primary bg-primary/10'
										: 'border-base-300 hover:border-primary/50'}"
									onclick={() => {
										userType = 'FREELANCER';
									}}
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
										<span class="font-semibold">{$t('onboarding.profile_type.freelancer')}</span>
										<p class="text-base-content/70 mt-1 text-sm">
											{$t('onboarding.profile_type.freelancer_desc')}
										</p>
									</div>
								</button>
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
							<h3 class="text-lg font-medium">{$t('onboarding.personal_info.title')}</h3>

							<div class="form-control px-1">
								<span class="label-text">{$t('onboarding.personal_info.full_name')}</span>

								<input
									type="text"
									placeholder={$t('onboarding.personal_info.full_name_placeholder')}
									class="input input-bordered w-full"
									bind:value={fullName}
									required
								/>
							</div>

							<div class="form-control px-1">
								<span class="label-text">{$t('onboarding.personal_info.email')}</span>

								<input
									type="email"
									placeholder={$t('onboarding.personal_info.email_placeholder')}
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
							<h3 class="text-lg font-medium">{$t('onboarding.location.title')}</h3>

							<div class="form-control px-1">
								<span class="label-text">{$t('onboarding.location.address1')}</span>

								<input
									type="text"
									placeholder={$t('onboarding.location.address1_placeholder')}
									class="input input-bordered w-full"
									bind:value={address1}
									required
								/>
							</div>

							<div class="form-control px-1">
								<span class="label-text">{$t('onboarding.location.address2')}</span>

								<input
									type="text"
									placeholder={$t('onboarding.location.address2_placeholder')}
									class="input input-bordered w-full"
									bind:value={address2}
								/>
							</div>

							<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div class="form-control px-1">
									<span class="label-text">{$t('onboarding.location.city')}</span>

									<input
										type="text"
										placeholder={$t('onboarding.location.city_placeholder')}
										class="input input-bordered w-full"
										bind:value={city}
										required
									/>
								</div>

								<div class="form-control px-1">
									<span class="label-text">{$t('onboarding.location.state')}</span>

									<input
										type="text"
										placeholder={$t('onboarding.location.state_placeholder')}
										class="input input-bordered w-full"
										bind:value={stateName}
										required
									/>
								</div>
							</div>

							<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
								<div class="form-control px-1">
									<span class="label-text">{$t('onboarding.location.postal_code')}</span>

									<input
										type="text"
										placeholder={$t('onboarding.location.postal_code_placeholder')}
										class="input input-bordered w-full"
										bind:value={postalCode}
										required
									/>
								</div>

								<div class="form-control px-1">
									<span class="label-text">{$t('onboarding.location.country')}</span>

									<select class="select select-bordered w-full" bind:value={country} required>
										<option value="" disabled selected
											>{$t('onboarding.location.country_placeholder')}</option
										>
										<option value="United States">{$t('onboarding.country.us')}</option>
										<option value="Canada">{$t('onboarding.country.canada')}</option>
										<option value="United Kingdom">{$t('onboarding.country.uk')}</option>
										<option value="Australia">{$t('onboarding.country.australia')}</option>
										<option value="Germany">{$t('onboarding.country.germany')}</option>
										<option value="France">{$t('onboarding.country.france')}</option>
										<option value="Japan">{$t('onboarding.country.japan')}</option>
										<option value="China">{$t('onboarding.country.china')}</option>
										<option value="India">{$t('onboarding.country.india')}</option>
										<option value="Brazil">{$t('onboarding.country.brazil')}</option>
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
							{$t('onboarding.button.back')}
						</button>
					{:else}
						<div></div>
					{/if}

					{#if currentStep < totalSteps}
						<button type="button" class="btn btn-primary" onclick={nextStep} disabled={isAnimating}>
							{$t('onboarding.button.next')}
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
							{isLoading ? $t('onboarding.button.completing') : $t('onboarding.button.complete')}
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
