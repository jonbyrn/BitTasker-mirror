<script lang="ts">
	import { locale, t } from 'svelte-i18n';
	import { isQvacEnabled } from '$lib/services/feature-flags';
	import { suggestCategory } from '$lib/qvac/client';
	import { labelFor } from '$lib/search/taxonomy.js';

	let {
		currentId = '',
		onuse
	}: {
		currentId?: string;
		onuse: (categoryId: string) => void;
	} = $props();

	let suggestion = $state('');
	let busy = $state(false);
	let last = $state('');
	let request = 0;

	const visible = $derived(Boolean(suggestion) && suggestion !== currentId);
	const name = $derived(labelFor(suggestion, String($locale || 'en')));

	export function look(nextTitle: string, nextDetails = '') {
		if (!isQvacEnabled()) return;
		const text = nextTitle.trim();
		if (text.length < 8) {
			suggestion = '';
			last = '';
			return;
		}
		if (text === last) return;
		last = text;
		const token = ++request;
		busy = true;
		suggestCategory(text, nextDetails)
			.then((id) => {
				if (token !== request) return;
				suggestion = id;
			})
			.catch(() => {
				if (token !== request) return;
				suggestion = '';
			})
			.finally(() => {
				if (token === request) busy = false;
			});
	}
</script>

{#if isQvacEnabled() && visible}
	<div class="flex flex-wrap items-center gap-2" data-testid="qvac-category-hint">
		<span class="text-sm">{$t('common.qvac.suggested_category', { values: { name } })}</span>
		<button
			type="button"
			class="btn btn-sm btn-outline"
			data-testid="qvac-use-category"
			disabled={busy}
			onclick={() => onuse(suggestion)}
		>
			{$t('common.qvac.use_category')}
		</button>
	</div>
{/if}
