<script lang="ts">
	import type { NostrEvent } from 'nostr-tools';
	// import { UpdateUserProfileStore } from '$houdini';
	// import type { User } from '$houdini';
	import { publishEvent } from '$lib/utils/nostr';
	import Uploader from '$lib/components/Uploader.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let { user, onComplete } = $props<{
		user: any | null | undefined;
		onComplete: (completed: boolean) => void;
	}>();

	// const profileStore = new UpdateUserProfileStore();

	// Local state
	let displayName = $state(user?.displayName || 'John Doe');
	let professionalTitle = $state(user?.professionalTitle || 'Software Engineer');
	let profileDescription = $state(user?.profileDescription || 'I am a software engineer');
	let website = $state(user?.website || 'https://www.example.com');
	let profilePictures = $state<Array<{ key: string; url: string }>>(
		[
			user?.profilePictureUrl
				? { key: user.profilePictureId || '', url: user.profilePictureUrl }
				: null
		].filter(Boolean) as Array<{ key: string; url: string }>
	);
	let isLoading = $state(false);
	let error = $state('');

	// Track form completion
	$effect(() => {
		const isComplete =
			displayName && professionalTitle && profileDescription && profilePictures.length > 0;
		onComplete(isComplete);
	});

	// Handle image upload
	async function handleImageUpload(files: File[]) {
		if (!files.length) return;

		try {
			isLoading = true;
			error = '';

			const uploadPromises = files.map((file) => uploadService.uploadSingleFile(file, 'profile'));
			const uploadedFiles = await Promise.all(uploadPromises);

			profilePictures = [
				...profilePictures,
				...uploadedFiles.map((file) => ({ key: file.key, url: file.url }))
			].slice(0, 5); // Limit to 5 pictures
		} catch (err) {
			console.error('File upload failed:', err);
			error = 'Failed to upload images. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	// Remove profile picture
	function removePicture(index: number) {
		profilePictures = profilePictures.filter((_, i) => i !== index);
	}

	// Set primary profile picture
	function setPrimaryPicture(index: number) {
		if (index === 0) return;
		const picture = profilePictures[index];
		profilePictures = [
			picture,
			...profilePictures.slice(0, index),
			...profilePictures.slice(index + 1)
		];
	}

	/* async function handleSubmit(event: Event) {
		event.preventDefault();
		try {
			isLoading = true;
			error = '';

			// Validate inputs
			if (!displayName || !professionalTitle || !profileDescription || !profilePictures.length) {
				error = 'Please fill in all required fields and add at least one profile picture.';
				return;
			}

			// Create profile data
			const profileData = {
				displayName,
				professionalTitle,
				profileDescription,
				profilePictureUrl: profilePictures[0].url,
				profilePictureId: profilePictures[0].key,
				additionalPictures: profilePictures.slice(1).map((pic) => ({ url: pic.url, key: pic.key }))
			};

			// Update profile using GraphQL
			const result = await profileStore.mutate({
				input: profileData
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			// Show success message
			const toast = document.getElementById('toast-success');
			if (toast) toast.style.display = 'block';
		} catch (err) {
			console.error('Profile update failed:', err);
			error = err instanceof Error ? err.message : 'Failed to update profile';
		} finally {
			isLoading = false;
		}
	} */

	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		try {
			isLoading = true;
			error = '';

			// Validate inputs
			// if (!displayName || !professionalTitle || !profileDescription || !profilePictures.length) {
			// 	error = 'Please fill in all required fields and add at least one profile picture.';
			// 	return;
			// }

			// Create Nostr metadata content
			const metadata = {
				name: displayName,
				about: profileDescription,
				// picture: profilePictures[0].url,
				// banner: profilePictures[1]?.url,
				nip05: user?.nip05,
				displayName: displayName,
				website: website,
				additionalPictures: profilePictures.slice(1).map((pic) => pic.url),
				professionalTitle: professionalTitle
			};

			// Create kind 0 event
			const event = {
				kind: 0,
				content: JSON.stringify(metadata),
				created_at: Math.floor(Date.now() / 1000),
				tags: []
			};

			// Publish to relay using the provided function
			await publishEvent(event);
		} catch (err) {
			console.error('Profile update failed:', err);
			error = err instanceof Error ? err.message : 'Failed to update profile';
		} finally {
			isLoading = false;
		}
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
				files={profilePictures.map((pic) => pic.url)}
				maxFiles={5}
				onChange={handleImageUpload}
			/>
		</div>
	</div>

	<!-- Display Name -->
	<div class="form-control">
		<label class="label" for="displayName">
			<span class="label-text font-medium">Display Name</span>
			<span class="label-text-alt">Required</span>
		</label>
		<input
			type="text"
			id="displayName"
			bind:value={displayName}
			class="input input-bordered w-full"
			placeholder="Your professional name"
			required
		/>
	</div>

	<!-- Professional Title -->
	<div class="form-control">
		<label class="label" for="professionalTitle">
			<span class="label-text font-medium">Professional Title</span>
			<span class="label-text-alt">Required</span>
		</label>
		<input
			type="text"
			id="professionalTitle"
			bind:value={professionalTitle}
			class="input input-bordered w-full"
			placeholder="e.g. Senior Software Engineer, Professional Plumber"
			required
		/>
	</div>

	<!-- Website -->
	<div class="form-control">
		<label class="label" for="website">
			<span class="label-text font-medium">Website</span>
		</label>
		<input
			type="text"
			id="website"
			bind:value={website}
			class="input input-bordered w-full"
			placeholder="https://www.example.com"
		/>
	</div>

	<!-- Profile Description -->
	<div class="form-control">
		<label class="label" for="profileDescription">
			<span class="label-text font-medium">Professional Summary</span>
			<span class="label-text-alt">Required • {profileDescription.length}/2000</span>
		</label>
		<textarea
			id="profileDescription"
			bind:value={profileDescription}
			class="textarea textarea-bordered h-32 w-full rounded-xl"
			placeholder="Tell clients about your professional background, expertise, and what makes you unique..."
			maxlength="2000"
			required
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

<!-- Success Toast -->
<div id="toast-success" class="toast toast-end" style="display: none;">
	<div class="alert alert-success">
		<span>Profile updated successfully!</span>
	</div>
</div>
