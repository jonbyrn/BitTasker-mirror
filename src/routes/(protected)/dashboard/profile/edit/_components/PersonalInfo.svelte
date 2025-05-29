<script lang="ts">
	import type { NostrProfile, NostrProfileImage } from '$lib/types/profile.d';
	import {
		publishMultipleImages,
		subscribeToProfileUpdates
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
					else if (event.kind === 30063) {
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
			{ 0: null, 30063: { d: 'profile-images' } } // Kind 0 for metadata, 300063 for media metadata
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
			const imagesToUpload = pictures.filter((picture) => {
				return picture instanceof File;
			});
			const otherImages = pictures.filter((picture) => {
				return !(picture instanceof File);
			});

			const uploadedPictures = await uploadImages(imagesToUpload);

			const images = [...(otherImages as NostrProfileImage[]), ...uploadedPictures];

			// Publish new images event, passing the existing event ID if we have one
			await publishMultipleImages(images, imageEventId, 'profile-images');

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
	async function handleImageUpload(files: (File | NostrProfileImage)[]) {
		const newFiles = files.filter((file) => {
			if (!pictures.includes(file)) {
				return file instanceof File;
			}
			return false;
		});
		if (newFiles.length > 0) {
			pictures = [...pictures, ...newFiles];
		}
	}

	function removePicture(index: number) {
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
				onRemove={removePicture}
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
