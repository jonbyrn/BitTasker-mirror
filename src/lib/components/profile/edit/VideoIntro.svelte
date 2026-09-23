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

	let videoUrl = $state('');
	let isSaving = $state(false);
	let errorMessage = $state('');
	let loaded = $state(false);

	$effect(() => {
		if (loaded) return;
		loaded = true;
		const npub = $user?.npub;
		if (!npub) return;
		void fetchProfileMetadata(npub)
			.then((profile) => {
				videoUrl = (profile as { video?: string }).video ?? '';
			})
			.catch(() => undefined);
	});

	const isComplete = $derived(videoUrl.trim().length > 0);

	async function handleSubmit(): Promise<void> {
		isSaving = true;
		errorMessage = '';
		try {
			await publishProfileMetadata({ video: videoUrl.trim() } as never, {});
			appStore.showSuccessToast($t('profile.page.sections.video'));
			onComplete(isComplete, true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to save video introduction';
			appStore.showErrorToast(errorMessage);
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="video-intro-form"
	onsubmit={(e) => {
		e.preventDefault();
		void handleSubmit();
	}}
>
	<div class="space-y-3">
		<label class="form-control">
			<span class="label-text mb-1"
				>{$t('profile.page.fields.video_url', { default: 'Video introduction URL' })}</span
			>
			<input
				class="input input-bordered w-full"
				type="url"
				bind:value={videoUrl}
				oninput={() => onComplete(videoUrl.trim().length > 0, false)}
				data-testid="video-url"
			/>
		</label>

		{#if errorMessage}
			<div class="alert alert-error text-sm" role="alert">{errorMessage}</div>
		{/if}

		<button type="submit" class="btn btn-primary" disabled={isSaving} data-testid="save-video">
			{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$t('common.save', { default: 'Save' })}
		</button>
	</div>
</form>
