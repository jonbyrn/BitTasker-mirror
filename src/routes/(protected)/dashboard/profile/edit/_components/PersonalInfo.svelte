<script lang="ts">
	import type { NostrProfile, NostrProfileImage } from '$lib/types/profile.d';
	import {
		publishMultipleImages,
		subscribeToProfileUpdates,
		deleteNostrEvent
	} from '$lib/nostr/profile';
	import { SimplePool } from 'nostr-tools/pool';
	import { publishProfileMetadata } from '$lib/nostr/profile';
	import { onDestroy, onMount } from 'svelte';
	import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let { onComplete } = $props<{ onComplete: (completed: boolean) => void }>();

	// Local state
	let displayName = $state('');
	let professionalTitle = $state('');
	let profileDescription = $state('');
	let website = $state('');
	let pictures = $state<(NostrProfileImage | File)[]>([]);
	let isLoading = $state(false);
	let error = $state('');
	let nostrPool = $state(new SimplePool());
	let profileEventId = $state<string | null>(null);
	let imageEventId = $state<string | null>(null); // Track the current image event ID
	let cleanup: (() => void) | null = null;

	// Subscribe to profile updates
	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					// Handle profile metadata update
					if (event.kind === 0) {
						profileEventId = event.id;
						const metadata = JSON.parse(event.content);
						displayName = metadata.displayName || displayName;
						professionalTitle = metadata.professionalTitle || professionalTitle;
						profileDescription = metadata.about || profileDescription;
						website = metadata.website || website;
					}
					// Handle image metadata update
					else if (event.kind === 1063) {
						imageEventId = event.id; // Store the event ID
						const images = JSON.parse(event.content);
						if (images.length > 0) {
							pictures = images.map((img: NostrProfileImage) => ({
								url: img.url,
								type: img.type || 'image/jpeg',
								alt: img.alt || '',
								key: img.key
							}));
						}
					}
				} catch (err) {
					console.error('Failed to process profile update:', err);
					error = 'Failed to connect to Nostr relay. Please try again later.';
				}
			},
			[0, 1063] // Kind 0 for metadata, 1063 for media metadata
		);
	});

	// Cleanup subscription on component destroy
	onDestroy(() => {
		if (cleanup) cleanup();
		nostrPool.close([PUBLIC_NOSTR_RELAY_URL]);
	});

	// Derived state for form completion
	let isComplete = $derived(
		displayName && professionalTitle && profileDescription && website && pictures.length > 0
	);

	// Track form completion
	$effect(() => {
		onComplete(isComplete);
	});

	const uploadImages = async (pictures: (NostrProfileImage | File)[]) => {
		const uploadPromises = pictures.map(async (picture) => {
			if (picture instanceof File) {
				const uploadResult = await uploadService.uploadSingleFile(picture, 'profile');
				return {
					key: uploadResult.key,
					url: uploadResult.url,
					type: picture.type,
					alt: picture.name
				};
			} else {
				return picture;
			}
		});

		return Promise.all(uploadPromises);
	};

	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		isLoading = true;
		error = '';

		try {
			// const uploadedPictures = await uploadImages(pictures);
			const uploadedPictures = [
				{
					url: 'https://pub-9749cc3802084a9da8131640ddfd3403.r2.dev/profile/1747839971600-acb3a5b460e5ec3e.webp',
					key: 'profile/1747839971600-acb3a5b460e5ec3e.webp',
					type: 'image/webp',
					alt: 'bugatti divo.webp'
				},
				{
					url: 'https://pub-9749cc3802084a9da8131640ddfd3403.r2.dev/profile/1747839972381-48b053b512414835.png',
					key: 'profile/1747839972381-48b053b512414835.png',
					type: 'image/png',
					alt: 'bugatti bolide.png'
				},
				{
					url: 'https://pub-9749cc3802084a9da8131640ddfd3403.r2.dev/profile/1747839972432-1d2be5fb5f32c768.png',
					key: 'profile/1747839972432-1d2be5fb5f32c768.png',
					type: 'image/png',
					alt: 'screenshot-2024.png'
				}
			];

			// Publish new images event, passing the existing event ID if we have one
			await publishMultipleImages(uploadedPictures, imageEventId, 'profile-images');

			// Prepare profile data
			const profileData: NostrProfile = {
				displayName,
				professionalTitle,
				about: profileDescription,
				website
			};

			// Publish profile metadata with retry logic
			await publishProfileMetadata(profileData, uploadedPictures);
		} catch (err) {
			console.error('Failed to update profile:', err);
			error = err instanceof Error ? err.message : 'Failed to update profile';
		} finally {
			isLoading = false;
		}
	}

	// Handle image upload
	async function handleImageUpload(files: File[]) {
		if (pictures.length > 5 || !files.length || files.length > 5) return;
		pictures = [...pictures, ...files];
	}

	// TODO: Remove profile picture
	function removePicture(index: number, file: File | string) {
		if (typeof file === 'string') {
			// remove images from nostr
		}
		pictures = pictures.filter((_, i) => i !== index);
	}
</script>

<form onsubmit={handleSubmit} class="space-y-6">
	<!-- Profile Pictures -->
	<div class="space-y-4">
		<div>
			<span class="text-base-content/80 block font-medium">Profile Pictures - 5 max</span>
			<span class="text-base-content/70 block whitespace-normal">
				First picture will be your primary profile picture
			</span>
		</div>

		<!-- Upload new pictures -->
		<div class="border-base-300 rounded-lg border p-1">
			<Uploader
				id="profilePictures"
				label="Add Pictures"
				files={pictures.map((pic) => (pic instanceof File ? pic : pic.url))}
				maxFiles={5}
				onChange={handleImageUpload}
			/>
		</div>
	</div>

	<!-- Display Name -->
	<div class="form-control">
		<label class="label" for="displayName">
			<span class="label-text">Display Name</span>
		</label>
		<input
			type="text"
			id="displayName"
			bind:value={displayName}
			class="input input-bordered mt-1 w-full"
			placeholder="Your display name"
		/>
	</div>

	<!-- Professional Title -->
	<div class="form-control">
		<label class="label" for="professionalTitle">
			<span class="label-text">Professional Title</span>
		</label>
		<input
			type="text"
			id="professionalTitle"
			bind:value={professionalTitle}
			class="input input-bordered mt-1 w-full"
			placeholder="e.g. Software Engineer"
		/>
	</div>

	<!-- Website -->
	<div class="form-control">
		<label class="label" for="website">
			<span class="label-text">Website</span>
		</label>
		<input
			type="url"
			id="website"
			bind:value={website}
			class="input input-bordered mt-1 w-full"
			placeholder="https://example.com"
		/>
	</div>

	<!-- Profile Description -->
	<div class="form-control">
		<label class="label" for="profileDescription">
			<span class="label-text">Profile Description</span>
		</label>
		<textarea
			id="profileDescription"
			bind:value={profileDescription}
			class="textarea textarea-bordered h-32 w-full rounded-xl"
			placeholder="Tell clients about your professional background, expertise, and what makes you unique..."
			maxlength="2000"
			rows="4"
		></textarea>
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Submit Button -->
	<div class="flex justify-end">
		<button type="submit" class="btn btn-primary" disabled={isLoading}>
			{#if isLoading}
				<span class="loading loading-spinner"></span>
			{/if}
			Save Personal Information
		</button>
	</div>
</form>
