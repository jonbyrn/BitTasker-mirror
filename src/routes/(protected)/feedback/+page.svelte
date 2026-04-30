<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { user } from '$lib/stores/user.store';
	import { compressImage, validateImageFile } from '$lib/utils/imageCompression';
	import Logo from '$lib/components/Logo.svelte';

	type FeedbackSubmission = {
		npub: string;
		status: 'Bug' | 'Feature';
		Description: string;
		Screenshot?: File;
		contact_info: string;
	};

	let status = $state<'' | 'Bug' | 'Feature'>('');
	let description = $state('');
	let screenshot = $state<File | null>(null);
	let contactInfo = $state('');
	let isLoading = $state(false);
	let isSubmitted = $state(false);
	let error = $state('');
	let userNpub = $state('');
	let username = $state('');
	let statusBugInput = $state<HTMLInputElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let isCompressing = $state(false);

	onMount(() => {
		// Get user's npub from the store
		const unsubscribe = user.subscribe((userData) => {
			if (userData.npub) {
				userNpub = userData.npub;
			}
			if (userData.name) {
				username = userData.name;
			}
		});

		// Load user data if not already loaded
		if (!userNpub) {
			user.getUserData().catch((err) => {
				console.error('Failed to load user data:', err);
			});
		}

		return unsubscribe;
	});

	async function handleSubmit() {
		if (!status) {
			error = $t('feedback.errors.select_type') || 'Please select Bug or Feature Request';
			if (statusBugInput) {
				statusBugInput.setCustomValidity(
					$t('feedback.errors.select_type') || 'Please select Bug or Feature Request'
				);
				statusBugInput.reportValidity();
			}
			return;
		} else if (statusBugInput) {
			statusBugInput.setCustomValidity('');
		}
		if (!description.trim()) {
			error = $t('feedback.errors.provide_description') || 'Please provide a description';
			return;
		}

		if (!userNpub) {
			error = $t('feedback.errors.missing_user') || 'Unable to identify user. Please try again.';
			return;
		}

		isLoading = true;
		error = '';

		try {
			const feedback: FeedbackSubmission = {
				npub: userNpub,
				status,
				Description: description.trim(),
				contact_info: contactInfo.trim(),
				Screenshot: screenshot || undefined
			};

			const formData = new FormData();
			formData.append('npub', feedback.npub);
			// Match NocoDB field casing exactly
			formData.append('status', feedback.status); // will be mapped to 'Status' on server
			formData.append('Description', feedback.Description);
			formData.append('contact_info', feedback.contact_info); // will be mapped to 'Contact info' on server
			if (feedback.Screenshot) formData.append('Screenshot', feedback.Screenshot);
			if (username) formData.append('username', username);

			// Debug: log outgoing payload (excluding file content)
			const debugPayload: Record<string, string | { name: string; size: number; type: string }> =
				{};
			for (const [k, v] of formData.entries()) {
				debugPayload[k] = v instanceof File ? { name: v.name, size: v.size, type: v.type } : v;
			}

			const res = await fetch('/srv-api/feedback', {
				method: 'POST',
				body: formData
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(
					data?.error || $t('feedback.errors.submit_failed') || 'Feedback submission failed'
				);
			}
			isSubmitted = true;
			if (typeof window !== 'undefined') {
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}
		} catch (err) {
			console.error('Failed to submit feedback:', err);
			error = $t('feedback.errors.submit_failed') || 'Failed to submit feedback. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	async function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			const originalFile = target.files[0];

			// Validate if it's an image file
			if (!originalFile.type.startsWith('image/')) {
				error = $t('feedback.errors.invalid_image') || 'Please select an image file';
				return;
			}

			// Validate image file before compression
			const validation = validateImageFile(originalFile);
			if (!validation.isValid) {
				error =
					validation.error || $t('feedback.errors.invalid_image_file') || 'Invalid image file';
				return;
			}

			isCompressing = true;
			error = '';

			try {
				// Compress the image
				const compressionResult = await compressImage(originalFile, {
					maxSizeMB: 2,
					maxWidthOrHeight: 3840,
					quality: 0.8,
					fileType: 'image/webp'
				});

				screenshot = compressionResult.file;
			} catch {
				screenshot = originalFile;
			} finally {
				isCompressing = false;
			}
		}
	}

	function resetForm() {
		status = '';
		description = '';
		screenshot = null;
		contactInfo = '';
		error = '';
		isSubmitted = false;
		isCompressing = false;
	}
</script>

<svelte:head>
	<title>Feedback | BitTasker</title>
</svelte:head>

<div class="feedback-container xs:px-4 container mx-auto px-2 py-8">
	<div class="mx-auto w-full max-w-4xl">
		<!-- Logo Section -->
		<div class="mb-8 text-center">
			<Logo />
		</div>

		<!-- Feedback Form Container -->
		<div class="card bg-base-100 mx-4 shadow-xl">
			<div class="card-body p-6 lg:p-8">
				{#if isSubmitted}
					<!-- Success Message -->
					<div class="py-8 text-center">
						<div class="text-success mb-4 text-6xl">✓</div>
						<h2 class="mb-4">{$t('feedback.thank_you_title') || 'Thank You!'}</h2>
						<p class="text-base-content/70 mb-6">
							{$t('feedback.thank_you_message') ||
								'Your feedback has been submitted successfully. We appreciate you taking the time to help us improve BitTasker!'}
						</p>
						<button onclick={resetForm} class="btn btn-primary">
							{$t('feedback.submit_another') || 'Submit More Feedback'}
						</button>
					</div>
				{:else}
					<!-- Feedback Form -->
					<div class="mx-auto">
						<h1 class="text-base-content mb-2 text-center text-3xl font-bold">
							{$t('navbar.feedback') || 'Feedback'}
						</h1>
						<p class="text-base-content text-m mb-8 text-center">
							{$t('feedback.intro') || 'Thanks for testing BitTasker. Share your feedback with us!'}
						</p>
						<p class="text-base-content/50 mb-6 text-center text-sm">
							{$t('feedback.required_hint') || 'An asterisk (*) indicates mandatory questions.'}
						</p>

						<form
							onsubmit={(e) => {
								e.preventDefault();
								handleSubmit();
							}}
							class="space-y-6"
						>
							<!-- Status Selection -->
							<div class="form-control">
								<fieldset>
									<legend class="label">
										<h6 class="label-text text-base-content mb-2">
											{$t('feedback.type_label') || 'Is this a bug, or a feature request? *'}
										</h6>
									</legend>
									<p class="text-base-content/60 mb-4 text-sm">
										{$t('feedback.type_help_text') ||
											"A bug is a feature that's present that isn't working as it should be. A feature request is for adding new abilities to the app that aren't currently present."}
									</p>
									<div class="flex gap-4">
										<label class="flex cursor-pointer items-center">
											<input
												type="radio"
												bind:group={status}
												value="Bug"
												required
												class="radio radio-primary mr-2"
												bind:this={statusBugInput}
											/>
											<span class="text-base-content text-sm font-medium"
												>{$t('feedback.bug') || 'Bug'}</span
											>
										</label>
										<label class="flex cursor-pointer items-center">
											<input
												type="radio"
												bind:group={status}
												value="Feature"
												class="radio radio-primary mr-2"
											/>
											<span class="text-base-content text-sm font-medium"
												>{$t('feedback.feature') || 'Feature Request'}</span
											>
										</label>
									</div>
								</fieldset>
							</div>

							<div class="divider"></div>

							<!-- Description -->
							<div class="form-control">
								<label for="description" class="label">
									<h6 class="label-text text-base-content mb-2">
										{$t('feedback.describe_label') || 'Describe the issue *'}
									</h6>
								</label>
								<textarea
									id="description"
									bind:value={description}
									rows="6"
									class="textarea textarea-bordered w-full"
									placeholder={$t('feedback.describe_placeholder') ||
										'Please provide a detailed description of the bug or feature request...'}
									required
								></textarea>
							</div>

							<div class="divider"></div>

							<!-- Screenshot Upload -->
							<div class="form-control">
								<label for="screenshot" class="label">
									<h6 class="label-text text-base-content mb-2">
										{$t('feedback.screenshot') || 'Screenshot'}
									</h6>
								</label>
								<p class="text-base-content/60 mb-4 text-sm">
									{$t('feedback.screenshot_hint') ||
										"If possible, include a screenshot that illustrates the issue you're seeing."}
								</p>
								<input
									id="screenshot"
									type="file"
									accept="image/*"
									onchange={handleFileChange}
									bind:this={fileInputEl}
									class="sr-only"
								/>
								<div class="flex flex-col items-start gap-2">
									<button
										type="button"
										class="btn btn-outline btn-sm"
										onclick={() => fileInputEl && fileInputEl.click()}
										disabled={isCompressing}
									>
										{#if isCompressing}
											<span class="loading loading-spinner loading-xs"></span>
											{$t('feedback.compressing') || 'Compressing...'}
										{:else}
											{$t('feedback.choose_file') || 'Choose File'}
										{/if}
									</button>
									{#if screenshot}
										<div class="flex flex-col gap-1">
											<span class="text-base-content/70 text-sm break-all">{screenshot.name}</span>
										</div>
									{/if}
								</div>
							</div>

							<div class="divider"></div>

							<!-- Contact Info -->
							<div class="form-control">
								<label for="contact" class="label">
									<h6 class="label-text text-base-content mb-2">
										{$t('feedback.contact_label') || 'Your contact info'}
									</h6>
								</label>
								<p class="text-base-content/60 mb-4 text-sm">
									{$t('feedback.contact_hint') ||
										'Please enter your email address, Telegram username, or WhatsApp number in case we have follow up questions.'}
								</p>
								<input
									id="contact"
									type="text"
									bind:value={contactInfo}
									class="input input-bordered w-full"
									placeholder={$t('feedback.contact_placeholder') ||
										'Your email, Telegram, or WhatsApp'}
									aria-required="false"
								/>
							</div>

							<!-- Error Message -->
							{#if error}
								<div
									class="alert alert-outline outline-error/30 text-error mb-6 bg-transparent outline"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-6 w-6 shrink-0 stroke-current"
										fill="none"
										viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
										/></svg
									>
									<span>{error}</span>
								</div>
							{/if}

							<!-- Submit Button -->
							<div class="pt-4">
								<button type="submit" disabled={isLoading} class="btn btn-primary w-full">
									{#if isLoading}
										<span class="loading loading-spinner loading-sm"></span>
									{/if}
									{isLoading
										? $t('feedback.submitting') || 'Submitting...'
										: $t('feedback.submit') || 'Submit Feedback'}
								</button>
							</div>
						</form>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* Ensure proper spacing and accessibility */
	.feedback-container {
		scroll-margin-top: 2rem;
	}

	/* Prevent horizontal scrolling on the container */
	.feedback-container {
		overflow-x: hidden;
		max-width: 100vw;
	}
</style>
