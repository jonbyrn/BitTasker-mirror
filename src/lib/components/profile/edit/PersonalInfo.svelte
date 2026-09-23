<script lang="ts">
	import { t } from 'svelte-i18n';
	import { publishProfileMetadata, fetchProfileMetadata } from '$lib/nostr/profile';
	import { appStore } from '$lib/stores/app.store';
	import { user } from '$lib/stores/user.store';

	let {
		onComplete = (_completed: boolean, _fromSave?: boolean) => {}
	}: {
		onComplete?: (completed: boolean, fromSave?: boolean) => void;
	} = $props();

	let displayName = $state('');
	let about = $state('');
	let picture = $state('');
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

	async function handleSubmit(): Promise<void> {
		isSaving = true;
		errorMessage = '';
		try {
			await publishProfileMetadata(
				{ display_name: displayName.trim(), about: about.trim(), picture: picture.trim() },
				{}
			);
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

		<label class="form-control">
			<span class="label-text mb-1"
				>{$t('profile.page.fields.picture', { default: 'Avatar URL' })}</span
			>
			<input
				class="input input-bordered w-full"
				type="url"
				bind:value={picture}
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
