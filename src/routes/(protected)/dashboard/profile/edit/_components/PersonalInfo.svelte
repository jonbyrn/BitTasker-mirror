<script lang="ts">
	import type { NostrProfile, NostrProfileImage } from '$lib/types/profile.d';
	import type { NostrEvent } from 'nostr-tools';
	import { getNostrMetadata, mergeNostrAndGraphQLData } from '$lib/nostr/profile';
	import { publishEvent } from '$lib/utils/nostr';
	import { finalizeEvent } from 'nostr-tools/pure';
	import { SimplePool } from 'nostr-tools/pool';
	import { publishProfileMetadata } from '$lib/nostr/profile';
	import { onDestroy, onMount } from 'svelte';
	import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let { user, onComplete } = $props<{
		user: any | null | undefined;
		onComplete: (completed: boolean) => void;
	}>();

	// Local state
	let displayName = $state(user?.displayName || 'John');
	let professionalTitle = $state(user?.professionalTitle || 'Software Engineer');
	let profileDescription = $state(user?.about || 'I am a software engineer');
	let website = $state(user?.website || 'https://www.example.com');
	// let pictures = $state<NostrProfileImage[]>(
	// 	[
	// 		user?.profilePictureUrl
	// 			? {
	// 					url: user.profilePictureUrl,
	// 					type: user.profilePictureContentType || 'image/jpeg',
	// 					alt: user.profilePictureAlt || 'Profile picture',
	// 					key: user.profilePictureKey
	// 				}
	// 			: null,
	// 		...user?.additionalProfilePictures?.map((pic: NostrProfileImage) => ({
	// 			url: pic.url,
	// 			type: pic.type,
	// 			alt: pic.alt,
	// 			key: pic.key
	// 		}))
	// 	].filter(Boolean) as NostrProfileImage[]
	// );
	let pictures = $state<NostrProfileImage[]>([
		...(user?.profilePictures || []),
		...(user?.additionalProfilePictures || [])
	]);
	let isLoading = $state(false);
	let error = $state('');
	let nostrPool = $state(new SimplePool());

	// Derived state for form completion
	let isComplete = $derived(
		displayName && professionalTitle && profileDescription && website && pictures.length > 0
	);

	// Track form completion
	$effect(() => {
		onComplete(isComplete);
	});

	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		isLoading = true;
		error = '';

		try {
			// Prepare profile data
			const profileData: NostrProfile = {
				displayName,
				professionalTitle,
				about: profileDescription,
				website,
				picture: pictures[0]?.url,
				additionalPictures: pictures.slice(1).map((pic) => pic.url)
			};

			return console.log({ profileData, pictures });

			// Publish profile metadata
			await publishProfileMetadata(profileData, pictures);
		} catch (err) {
			console.error('Failed to update profile:', err);
			error = err instanceof Error ? err.message : 'Failed to update profile';
		} finally {
			isLoading = false;
		}
	}

	// Handle image upload
	async function handleImageUpload(files: File[]) {
		if (!files.length || files.length > 5) return;

		try {
			const uploadPromises = files.map(async (file) => {
				const uploadResult = await uploadService.uploadSingleFile(file, 'profile');
				return {
					key: uploadResult.key,
					url: uploadResult.url,
					type: file.type,
					alt: file.name
				};
			});

			const uploadedFiles = await Promise.all(uploadPromises);
			pictures = [...pictures, ...uploadedFiles];
		} catch (err) {
			console.error('Failed to process images:', err);
			error = err instanceof Error ? err.message : 'Failed to process images';
		}
	}

	// Remove profile picture
	function removePicture(index: number, file: File | string) {
		if (typeof file === 'string') {
			// remove images from nostr
		}
		pictures = pictures.filter((_, i) => i !== index);
	}

	// Cleanup
	onDestroy(() => {
		nostrPool.close([PUBLIC_NOSTR_RELAY_URL]);
	});
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
				files={pictures.map((pic) => pic.url)}
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
