<script lang="ts">
	import { locale, t } from 'svelte-i18n';
	import { isQvacEnabled } from '$lib/services/feature-flags';
	import { translateText, QvacError } from '$lib/qvac/client';
	import { shouldOfferTranslation, uiLanguage } from '$lib/qvac/language.js';

	let {
		title = '',
		description = '',
		onchange
	}: {
		title?: string;
		description?: string;
		onchange?: (value: { title: string; description: string } | null) => void;
	} = $props();

	let showing = $state(false);
	let cachedTitle = $state('');
	let cachedBody = $state('');
	let cachedKey = $state('');
	let busy = $state(false);
	let errorKey = $state('');

	const target = $derived(uiLanguage($locale));
	const offer = $derived(
		(title.trim() && shouldOfferTranslation(title, $locale)) ||
			(description.trim() && shouldOfferTranslation(description, $locale))
	);
	const sourceKey = $derived(`${target}\n${title}\n${description}`);

	function fail(error: unknown) {
		errorKey = error instanceof QvacError ? error.code : 'failed';
	}

	function messageKey(code: string): string {
		if (code === 'too_long') return 'common.qvac.too_long';
		if (code === 'unavailable' || code === 'disabled') return 'common.qvac.unavailable';
		return 'common.qvac.failed';
	}

	async function toggle() {
		if (showing) {
			showing = false;
			onchange?.(null);
			return;
		}
		if (cachedKey === sourceKey && (cachedTitle || cachedBody)) {
			showing = true;
			onchange?.({ title: cachedTitle, description: cachedBody });
			return;
		}
		busy = true;
		errorKey = '';
		try {
			const [nextTitle, nextBody] = await Promise.all([
				title.trim() ? translateText(title, target) : Promise.resolve(''),
				description.trim() ? translateText(description, target) : Promise.resolve('')
			]);
			cachedTitle = nextTitle;
			cachedBody = nextBody;
			cachedKey = sourceKey;
			showing = true;
			onchange?.({ title: nextTitle, description: nextBody });
		} catch (error) {
			fail(error);
		} finally {
			busy = false;
		}
	}
</script>

{#if isQvacEnabled() && offer}
	<div class="space-y-1" data-testid="qvac-translate">
		<button
			type="button"
			class="btn btn-sm btn-outline"
			data-testid="qvac-translate-button"
			disabled={busy}
			onclick={toggle}
		>
			{#if busy}
				{$t('common.qvac.translating')}
			{:else if showing}
				{$t('common.qvac.show_original')}
			{:else if target === 'es'}
				{$t('common.qvac.translate_to_es')}
			{:else}
				{$t('common.qvac.translate_to_en')}
			{/if}
		</button>
		{#if errorKey}
			<p class="text-error text-sm">{$t(messageKey(errorKey))}</p>
		{/if}
	</div>
{/if}
