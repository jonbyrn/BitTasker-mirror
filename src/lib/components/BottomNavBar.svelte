<script lang="ts">
	import 'iconify-icon';
	import { page } from '$app/state';
	import { sections } from '$lib/utils/consts';
	
	let currentSection = $state('');

	$effect.pre(() => {
		const path = page.url.pathname;
		currentSection = path.split('dashboard/')[1] || '';
	});
</script>

<div class="dock">
	{#each sections as section}
		<a
			href={`/dashboard/${section.id}`}
			class={currentSection === section.id ? 'dock-active' : ''}
			data-sveltekit-reload="off"
		>
			<iconify-icon icon={section.icon}></iconify-icon>
			<span class="dock-label">{section.label}</span>
		</a>
	{/each}
</div>
