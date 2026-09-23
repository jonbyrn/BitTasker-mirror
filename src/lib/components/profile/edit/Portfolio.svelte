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

	let website = $state('');
	let portfolioLinks = $state<string[]>([]);
	let draft = $state('');
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
				website = profile.website ?? '';
			})
			.catch(() => undefined);
	});

	function addLink(): void {
		const value = draft.trim();
		if (!value || portfolioLinks.includes(value)) return;
		portfolioLinks = [...portfolioLinks, value];
		draft = '';
		onComplete(portfolioLinks.length > 0, false);
	}

	function removeLink(index: number): void {
		portfolioLinks = portfolioLinks.filter((_, i) => i !== index);
		onComplete(portfolioLinks.length > 0, false);
	}

	async function handleSubmit(): Promise<void> {
		isSaving = true;
		errorMessage = '';
		try {
			await publishProfileMetadata({ website: website.trim() }, {});
			appStore.showSuccessToast($t('profile.page.sections.portfolio'));
			onComplete(portfolioLinks.length > 0 || website.trim().length > 0, true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to save portfolio';
			appStore.showErrorToast(errorMessage);
		} finally {
			isSaving = false;
		}
	}
</script>

<form
	data-testid="portfolio-form"
	onsubmit={(e) => {
		e.preventDefault();
		void handleSubmit();
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
				bind:value={website}
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

		<button type="submit" class="btn btn-primary" disabled={isSaving} data-testid="save-portfolio">
			{#if isSaving}<span class="loading loading-spinner loading-sm"></span>{/if}
			{$t('common.save', { default: 'Save' })}
		</button>
	</div>
</form>
