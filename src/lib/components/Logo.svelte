<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	import { locale, t } from 'svelte-i18n';

	let { class: className = 'block mx-auto mt-8 mb-8 w-full max-w-xs sm:max-w-sm md:max-w-md' } =
		$props<{ class?: string }>();
	let logoUrl = $state('');

	$effect(() => {
		const themeKey = $darkMode ? 'dark' : 'light';
		const lang = $locale;
		const logoLang = lang === 'es' ? '-es' : '';
		logoUrl = `/images/_logos_tmp/bittasker-logo-${themeKey}${logoLang}.svg`;
	});
</script>

<img
	src={logoUrl}
	alt={$t('common.components.logo.alt')}
	class={className}
	width="200"
	height="60"
	style="aspect-ratio: 200/60;"
/>
