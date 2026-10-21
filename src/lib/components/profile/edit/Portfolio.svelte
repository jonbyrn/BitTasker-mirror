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

	let website = $state('');
	let portfolioLinks = $state<string[]>([]);
	let draft = $state('');
	let isSaving = $state(false);
	let errorMessage = $state('');
	let loaded = $state(false);
	let websiteTouched = $state(false);
	let linksDirty = $state(false);

	$effect(() => {
		if (loaded) return;
		loaded = true;
		const npub = $user?.npub;
		if (!npub) return;
		void fetchProfileMetadata(npub)
			.then((profile) => {
				if (!websiteTouched) website = profile.website ?? '';
			})
			.catch(() => undefined);
	});

	function setWebsite(event: Event): void {
		websiteTouched = true;
		website = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : '';
	}

	function addLink(): void {
		const value = draft.trim();
		if (!value || portfolioLinks.includes(value)) return;
		linksDirty = true;
		portfolioLinks = [...portfolioLinks, value];
		draft = '';
		onComplete(portfolioLinks.length > 0 || website.trim().length > 0, false);
	}

	function removeLink(index: number): void {
		linksDirty = true;
		portfolioLinks = portfolioLinks.filter((_, i) => i !== index);
		onComplete(portfolioLinks.length > 0 || website.trim().length > 0, false);
	}

	export async function save(): Promise<SectionSaveResult> {
		if (!websiteTouched && !linksDirty) return sectionSaved();
		isSaving = true;
		errorMessage = '';
		try {
			const npub = $user?.npub;
			if (!npub) throw new Error('No public key found');
			await publishMergedProfile(npub, { website: website.trim() });
			websiteTouched = false;
			linksDirty = false;
			appStore.showSuccessToast($t('profile.page.sections.portfolio'));
			onComplete(portfolioLinks.length > 0 || website.trim().length > 0, true);
			return sectionSaved();
		} catch (error) {
			const failed = sectionFailed(error, 'Failed to save portfolio');
			errorMessage = failed.error;
			appStore.showErrorToast(errorMessage);
			return failed;
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="portfolio-form"
	onsubmit={(e) => {
		e.preventDefault();
		void save();
	}}
>
	<div class="space-y-3">
		<label class="form-control">
			<span class="label-text mb-1"
				>{$t('profile.page.fields.website', { default: 'Website' })}</span
			>
			<input
				class="input input-bordered w-full"
				type="url"
				value={website}
				oninput={setWebsite}
				data-testid="website"
			/>
		</label>

		<div class="join w-full">
			<input
				class="input input-bordered join-item flex-1"
				type="url"
				placeholder={$t('profile.page.portfolio.add_link', { default: 'Add a portfolio link' })}
				bind:value={draft}
				data-testid="portfolio-link-input"
			/>
			<button
				type="button"
				class="btn btn-outline join-item"
				onclick={addLink}
				data-testid="add-link"
			>
				{$t('common.add', { default: 'Add' })}
			</button>
		</div>

		{#if portfolioLinks.length > 0}
			<ul class="space-y-1" data-testid="portfolio-links">
				{#each portfolioLinks as link, i (link)}
					<li class="flex items-center justify-between gap-2 text-sm">
						<span class="truncate">{link}</span>
						<button
							type="button"
							class="btn btn-ghost btn-xs"
							aria-label={$t('common.remove', { default: 'Remove' })}
							onclick={() => removeLink(i)}>×</button
						>
					</li>
				{/each}
			</ul>
		{/if}

		{#if errorMessage}
			<div class="alert alert-error text-sm" role="alert">{errorMessage}</div>
		{/if}

		{#if showSave}
			<button
				type="submit"
				class="btn btn-primary"
				disabled={isSaving}
				data-testid="save-portfolio"
			>
				{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
				{$t('common.save', { default: 'Save' })}
			</button>
		{/if}
	</div>
</form>
