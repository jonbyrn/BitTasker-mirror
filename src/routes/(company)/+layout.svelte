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
				<div class="mt-8 flex flex-col items-center space-y-6">
					<div class="flex flex-wrap justify-center gap-4">
						<a
							href={resolve('/tasks')}
							class="btn btn-lg border-none bg-black text-white shadow-lg transition-all duration-300 ease-in-out hover:bg-gray-800"
						>
							{t('homepage.v2.finalcta.tasker_cta')}
						</a>
					</div>
					<div>
						<a
							href={resolve('/auth/signup')}
							class="btn hover:bg-primary btn-lg border-none bg-white px-8 text-black shadow-lg transition-all duration-300 ease-in-out hover:text-white"
						>
							{t('homepage.v2.finalcta.get_started')}
						</a>
					</div>
				</div>
			</div>
		</section>
		<BitTaskerFooter />
	</div>
</div>
