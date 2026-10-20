<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { t as i18nT } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';
	import ProtectedTopBar from '$lib/components/topbar/ProtectedTopBar.svelte';
	import PublicTopBar from '$lib/components/topbar/PublicTopBar.svelte';
	import BitTaskerFooter from '$lib/components/BitTaskerFooter.svelte';

	const { children, data } = $props();

	function delve(obj: unknown, fullKey: string): string | undefined {
		if (!obj || typeof obj !== 'object') return undefined;
		const keys = fullKey.split('.');
		let result: unknown = obj;
		for (const key of keys) {
			if (result && typeof result === 'object') {
				result = (result as Record<string, unknown>)[key];
			} else {
				return undefined;
			}
		}
		return typeof result === 'string' ? result : undefined;
	}

	function t(key: string): string {
		if (browser) {
			const i18nValue = $i18nT(key);
			if (i18nValue && i18nValue !== key) return i18nValue;
		}
		if (data?.translations) {
			const value = delve(data.translations, key);
			if (value) return value;
		}
		return $i18nT(key);
	}

	function label(key: string, fallback: string): string {
		const value = t(key);
		return !value || value === key ? fallback : value;
	}
</script>

<header class="app-shell__header">
	{#if $authState?.isAuthenticated}
		<ProtectedTopBar />
	{:else}
		<PublicTopBar translations={data?.translations} />
	{/if}
</header>

<div class="app-shell__content bg-base-200">
	<div class="bg-base-200 flex shrink-0 grow basis-auto flex-col">
		{@render children?.()}
	</div>

	<div class="tasks-page-footer pt-12 lg:pt-16">
		<section class="bg-primary text-primary-content py-16">
			<div class="container mx-auto px-4 text-center">
				<h2 class="text-4xl font-bold">{t('homepage.v2.finalcta.title')}</h2>
				<p class="mx-auto mt-4 max-w-2xl text-lg">
					{t('homepage.v2.finalcta.description')}
				</p>
				<div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
					<a href={resolve('/tasks')} class="btn btn-lg w-full border-none bg-black text-white shadow-lg sm:w-auto">
						{label('homepage.v2.pitch.find_work', 'Find work')}
					</a>
					<a href={resolve('/auth/signup')} class="btn btn-lg w-full border-none bg-white px-8 text-black shadow-lg sm:w-auto">
						{label('homepage.v2.pitch.hire', 'Hire')}
					</a>
					<a
						href={resolve('/create-service')}
						class="btn btn-lg w-full border-2 border-black bg-transparent text-black sm:w-auto"
					>
						{label('homepage.v2.pitch.offer', 'Offer a service')}
					</a>
				</div>
			</div>
		</section>
		<BitTaskerFooter />
	</div>
</div>
