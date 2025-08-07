<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';

	let { class: className = 'block mx-auto mt-8 mb-8 w-full max-w-xs sm:max-w-sm md:max-w-md' } = $props<{ class?: string }>();
	let logoUrl = $state('');

	$effect(() => {
		const theme = $darkMode ? 'dark-mode' : 'light-mode';
		const lang = localStorage.getItem('locale') || 'en';
		const logoLang = lang === 'es' ? '-es' : '';
		logoUrl = `/images/Logos/BitTasker-Logo-${theme}${logoLang}.svg`;
	});
</script>

<img 
	src={logoUrl} 
	alt="BitTasker Logo" 
	class={className}
	width="200"
	height="60"
	style="aspect-ratio: 200/60;"
/>
