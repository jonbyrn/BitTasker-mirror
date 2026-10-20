<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		publishProfileMetadata,
		publishMultipleImages,
		fetchProfileMetadata,
		fetchKind0Profile
	} from '$lib/nostr/profile';
	import uploadService from '$lib/api/services/upload.service';
	import { appStore } from '$lib/stores/app.store';
	import { publishLocalIdentity } from '$lib/stores/profile-identity.store';
	import { user } from '$lib/stores/user.store';

	let {
		onComplete = (_completed: boolean, _fromSave?: boolean) => {}
	}: {
		onComplete?: (completed: boolean, fromSave?: boolean) => void;
	} = $props();

	let displayName = $state('');
	let about = $state('');
	let picture = $state('');
	let photoPreview = $state('');
	let photoFile = $state<File | null>(null);
	let isSaving = $state(false);
	let errorMessage = $state('');
	let loaded = $state(false);

	// Load current profile metadata once on mount.
	$effect(() => {
		if (loaded) return;
		loaded = true;
		const npub = $user?.npub;
		if (!npub) return;
		void fetchProfileMetadata(npub)
			.then((profile) => {
				displayName = profile.display_name ?? profile.name ?? '';
				about = profile.about ?? '';
				picture = profile.picture ?? '';
			})
			.catch(() => undefined);
	});

	const isComplete = $derived(displayName.trim().length > 0);

	function onPhotoSelected(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			errorMessage = $t('profile.page.fields.picture_type', { default: 'Choose an image file' });
			return;
		}
		if (file.size > 8 * 1024 * 1024) {
			errorMessage = $t('profile.page.fields.picture_size', {
				default: 'Image must be 8MB or smaller'
			});
			return;
		}
		errorMessage = '';
		if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
		photoFile = file;
		photoPreview = URL.createObjectURL(file);
	}

	async function handleSubmit(): Promise<void> {
		isSaving = true;
		errorMessage = '';
		try {
			const npub = $user?.npub;
			if (!npub) {
				throw new Error('No public key found');
			}

			let uploadedPicture = picture.trim();
			if (photoFile) {
				const uploaded = await uploadService.uploadSingleFile(photoFile, { folder: 'profile' });
				uploadedPicture = uploaded.url;
				try {
					await publishMultipleImages(
						[
							{
								url: uploaded.url,
								type: photoFile.type || 'image/jpeg',
								alt: displayName.trim() || 'profile photo',
								key: uploaded.key,
								isPrimary: true
							}
						],
						null,
						'profile-images'
					);
				} catch (galleryError) {
					console.error('Profile photo gallery publish failed:', galleryError);
				}
			}
			if (uploadedPicture.startsWith('blob:')) {
				throw new Error('Photo upload did not return a URL');
			}

			const existing = (await fetchKind0Profile(npub)) ?? {};
			const savedName = displayName.trim();
			if (!savedName) {
				delete existing.display_name;
				delete existing.name;
			}
			const savedAbout = about.trim();
			await publishProfileMetadata(
				{ display_name: savedName, about: savedAbout, picture: uploadedPicture },
				existing
			);
			picture = uploadedPicture;
			if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
			photoPreview = '';
			photoFile = null;
			await publishLocalIdentity({
				npub,
				displayName: savedName,
				picture: uploadedPicture,
				about: savedAbout
			});
			appStore.showSuccessToast($t('profile.page.sections.personal_info'));
			onComplete(isComplete, true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to save profile';
			appStore.showErrorToast(errorMessage);
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="personal-info-form"
	onsubmit={(e) => {
		e.preventDefault();
		void handleSubmit();
	}}
>
	<div class="space-y-3">
		<label class="form-control">
			<span class="label-text mb-1"
				>{$t('profile.page.fields.display_name', { default: 'Display name' })}</span
			>
			<input
				class="input input-bordered w-full"
				bind:value={displayName}
				oninput={() => onComplete(displayName.trim().length > 0, false)}
				data-testid="display-name"
			/>
		</label>

		<label class="form-control">
			<span class="label-text mb-1">{$t('profile.page.fields.about', { default: 'About' })}</span>
			<textarea
				class="textarea textarea-bordered w-full"
				rows="3"
				bind:value={about}
				data-testid="about"
			></textarea>
		</label>

		<label class="form-control" for="profile-photo">
			<span class="label-text mb-1">{$t('profile.page.fields.picture', { default: 'Photo' })}</span>
			{#if photoPreview || picture}
				<img
					src={photoPreview || picture}
					alt={displayName || $t('profile.page.fields.picture', { default: 'Photo' })}
					class="mb-2 h-16 w-16 rounded-full object-cover"
				/>
			{/if}
			<input
				id="profile-photo"
				class="file-input file-input-bordered w-full"
				type="file"
				accept="image/*"
				onchange={onPhotoSelected}
				data-testid="picture-file"
			/>
			<input
				class="input input-bordered mt-2 w-full"
				type="url"
				bind:value={picture}
				oninput={() => {
					photoFile = null;
					photoPreview = '';
				}}
				placeholder={$t('profile.page.fields.picture_url', { default: 'Or paste an image URL' })}
				data-testid="picture"
			/>
		</label>

		{#if errorMessage}
			<div class="alert alert-error text-sm" role="alert">{errorMessage}</div>
		{/if}

		<button
			type="submit"
			class="btn btn-primary"
			disabled={isSaving}
			data-testid="save-personal-info"
		>
			{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$t('common.save', { default: 'Save' })}
		</button>
	</div>
</form>
