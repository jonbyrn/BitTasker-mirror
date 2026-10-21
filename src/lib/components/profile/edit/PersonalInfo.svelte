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
	import { prepareSigner } from '$lib/utils/nostrKeys';
	import { sectionFailed, type SectionSaveResult } from './section-save';

	let {
		onComplete = (_completed: boolean, _fromSave?: boolean) => {},
		showSave = true
	}: {
		onComplete?: (completed: boolean, fromSave?: boolean) => void;
		showSave?: boolean;
	} = $props();

	let displayName = $state('');
	let about = $state('');
	let picture = $state('');
	let photoPreview = $state('');
	let photoFile = $state<File | null>(null);
	let isSaving = $state(false);
	let errorMessage = $state('');
	let loaded = $state(false);
	let nameTouched = $state(false);
	let aboutTouched = $state(false);
	let pictureTouched = $state(false);

	// Load current profile metadata once. A late response must not erase what was typed.
	$effect(() => {
		if (loaded) return;
		loaded = true;
		const npub = $user?.npub;
		if (!npub) return;
		void fetchProfileMetadata(npub)
			.then((profile) => {
				if (!nameTouched) displayName = profile.display_name ?? profile.name ?? '';
				if (!aboutTouched) about = profile.about ?? '';
				if (!pictureTouched && !photoFile) picture = profile.picture ?? '';
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

	function setDisplayName(event: Event): void {
		const value = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		nameTouched = true;
		displayName = value;
		onComplete(value.trim().length > 0, false);
	}

	function setAbout(event: Event): void {
		aboutTouched = true;
		about = event.currentTarget instanceof HTMLTextAreaElement ? event.currentTarget.value : '';
	}

	function setPictureUrl(event: Event): void {
		pictureTouched = true;
		photoFile = null;
		photoPreview = '';
		picture = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
	}

	export async function save(): Promise<SectionSaveResult> {
		// Start the passkey prompt in this turn, before any await.
		const unlocking = prepareSigner();
		isSaving = true;
		errorMessage = '';
		try {
			const npub = $user?.npub;
			if (!npub) {
				throw new Error('No public key found');
			}
			await unlocking;

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
			try {
				await publishProfileMetadata(
					{ display_name: savedName, about: savedAbout, picture: uploadedPicture },
					existing,
					undefined,
					savedName ? { timeoutMs: 5_000, requiredDisplayName: savedName } : false
				);
			} catch (publishError) {
				if (
					!(publishError instanceof Error) ||
					publishError.message !== 'PROFILE_METADATA_VERIFY_TIMEOUT'
				) {
					throw publishError;
				}
			}
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
			return { ok: true };
		} catch (error) {
			errorMessage = sectionFailed(error, 'Failed to save profile').error;
			appStore.showErrorToast(errorMessage);
			return { ok: false, error: errorMessage };
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="personal-info-form"
	onsubmit={(e) => {
		e.preventDefault();
		void save();
	}}
>
	<div class="space-y-3">
		<label class="form-control">
			<span class="label-text mb-1"
				>{$t('profile.page.fields.display_name', { default: 'Display name' })}</span
			>
			<input
				class="input input-bordered w-full"
				value={displayName}
				oninput={setDisplayName}
				data-testid="display-name"
			/>
		</label>

		<label class="form-control">
			<span class="label-text mb-1">{$t('profile.page.fields.about', { default: 'About' })}</span>
			<textarea
				class="textarea textarea-bordered w-full"
				rows="3"
				value={about}
				oninput={setAbout}
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
				value={picture}
				oninput={setPictureUrl}
				placeholder={$t('profile.page.fields.picture_url', { default: 'Or paste an image URL' })}
				data-testid="picture"
			/>
		</label>

		{#if errorMessage}
			<div class="alert alert-error text-sm" role="alert">{errorMessage}</div>
		{/if}

		{#if showSave}
			<button
				type="submit"
				class="btn btn-primary"
				disabled={isSaving}
				data-testid="save-personal-info"
			>
				{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$t('common.save', { default: 'Save' })}
			</button>
		{/if}
	</div>
</form>
