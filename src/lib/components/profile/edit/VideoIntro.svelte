<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fetchProfileMetadata } from '$lib/nostr/profile';
	import { appStore } from '$lib/stores/app.store';
	import { user } from '$lib/stores/user.store';
	import {
		publishMergedProfile,
		sectionFailed,
		sectionSaved,
		type SectionSaveResult
	} from './section-save';

	let {
		onComplete = (_completed: boolean, _fromSave?: boolean) => {},
		showSave = true
	}: {
		onComplete?: (completed: boolean, fromSave?: boolean) => void;
		showSave?: boolean;
	} = $props();

	let videoUrl = $state('');
	let isSaving = $state(false);
	let errorMessage = $state('');
	let loaded = $state(false);
	let videoTouched = $state(false);

	$effect(() => {
		if (loaded) return;
		loaded = true;
		const npub = $user?.npub;
		if (!npub) return;
		void fetchProfileMetadata(npub)
			.then((profile) => {
				if (!videoTouched) videoUrl = (profile as { video?: string }).video ?? '';
			})
			.catch(() => undefined);
	});

	const isComplete = $derived(videoUrl.trim().length > 0);

	function setVideoUrl(event: Event): void {
		videoTouched = true;
		videoUrl = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
		onComplete(videoUrl.trim().length > 0, false);
	}

	export async function save(): Promise<SectionSaveResult> {
		if (!videoTouched) return sectionSaved();
		isSaving = true;
		errorMessage = '';
		try {
			const npub = $user?.npub;
			if (!npub) throw new Error('No public key found');
			await publishMergedProfile(npub, { video: videoUrl.trim() } as never);
			videoTouched = false;
			appStore.showSuccessToast($t('profile.page.sections.video'));
			onComplete(isComplete, true);
			return sectionSaved();
		} catch (error) {
			const failed = sectionFailed(error, 'Failed to save video introduction');
			errorMessage = failed.error;
			appStore.showErrorToast(errorMessage);
			return failed;
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="video-intro-form"
	onsubmit={(e) => {
		e.preventDefault();
		void save();
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
				value={videoUrl}
				oninput={setVideoUrl}
				data-testid="video-url"
			/>
		</label>

		{#if errorMessage}
			<div class="alert alert-error text-sm" role="alert">{errorMessage}</div>
		{/if}

		{#if showSave}
			<button type="submit" class="btn btn-primary" disabled={isSaving} data-testid="save-video">
				{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$t('common.save', { default: 'Save' })}
			</button>
		{/if}
	</div>
</form>
