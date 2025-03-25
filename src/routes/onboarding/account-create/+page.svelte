<script lang="ts">
	import { onMount } from 'svelte';
	import OnboardingLayout from '$lib/components/onboarding/OnboardingLayout.svelte';
	import { navigateWithTransition } from '$lib/utils/viewTransition';
	import { onboardingStore } from '$lib/stores/onboardingStore';
	import { accountCreateSchema } from '$lib/validation/onboardingSchemas';
	import { ZodError } from 'zod';

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let accountType = $state('');
	let errors: Record<string, string> = $state({});
	let formSubmitted = $state(false);

	onMount(() => {
		// Get data from store
		const unsubscribe = onboardingStore.subscribe((data) => {
			email = data.email || '';
			password = data.password || '';
			accountType = data.accountType;
		});

		return unsubscribe;
	});

	function validateForm() {
		errors = {};
		formSubmitted = true;

		try {
			accountCreateSchema.parse({ email, password });

			// Additional validation for confirm password
			if (password !== confirmPassword) {
				errors.confirmPassword = 'Passwords do not match';
				return false;
			}

			return true;
		} catch (error) {
			if (error instanceof ZodError) {
				error.errors.forEach((err) => {
					errors[err.path[0]] = err.message;
				});
			}
			return false;
		}
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (validateForm()) {
			onboardingStore.updateFields({ email, password });

			// Navigate to the appropriate next step based on account type
			if (accountType === 'freelancer') {
				navigateWithTransition('/onboarding/freelancer/name-location');
			} else {
				navigateWithTransition('/onboarding/client/name-location');
			}
		}
	}
</script>

<svelte:head>
	<title>Create Account | BitTasker</title>
</svelte:head>

<OnboardingLayout
	title="Create Your Account"
	subtitle="Let's set up your account credentials."
	step={3}
	totalSteps={5}
>
	<form onsubmit={handleSubmit} class="space-y-4">
		<div class="form-control">
			<label for="email" class="label">
				<span class="label-text">Email Address</span>
			</label>
			<input
				type="email"
				id="email"
				bind:value={email}
				class="input input-bordered w-full {errors.email ? 'input-error' : ''}"
				placeholder="your.email@example.com"
				required
			/>
			{#if errors.email}
				<label class="label">
					<span class="label-text-alt text-error">{errors.email}</span>
				</label>
			{/if}
		</div>

		<div class="form-control">
			<label for="password" class="label">
				<span class="label-text">Password</span>
			</label>
			<input
				type="password"
				id="password"
				bind:value={password}
				class="input input-bordered w-full {errors.password ? 'input-error' : ''}"
				placeholder="••••••••"
				required
			/>
			{#if errors.password}
				<label class="label">
					<span class="label-text-alt text-error">{errors.password}</span>
				</label>
			{/if}
			<label class="label">
				<span class="label-text-alt whitespace-normal"
					>Password must be at least 8 characters with uppercase, lowercase, and numbers.</span
				>
			</label>
		</div>

		<div class="form-control">
			<label for="confirmPassword" class="label">
				<span class="label-text">Confirm Password</span>
			</label>
			<input
				type="password"
				id="confirmPassword"
				bind:value={confirmPassword}
				class="input input-bordered w-full {errors.confirmPassword ? 'input-error' : ''}"
				placeholder="••••••••"
				required
			/>
			{#if errors.confirmPassword}
				<label class="label">
					<span class="label-text-alt text-error">{errors.confirmPassword}</span>
				</label>
			{/if}
		</div>

		<div class="mt-8 flex justify-between">
			<button
				type="button"
				class="btn btn-outline"
				onclick={() => navigateWithTransition('/onboarding/account-type')}
			>
				Back
			</button>

			<button type="submit" class="btn btn-primary"> Continue </button>
		</div>
	</form>
</OnboardingLayout>
