<script lang="ts">
	import 'iconify-icon';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { sections } from '$lib/utils/consts';

	let currentSection = $state('');
	let lastScrollPosition = $state(0);
	let isScrollingDown = $state(false);
	let isVisible = $state(true);

	$effect.pre(() => {
		const path = page.url.pathname;
		currentSection = path.split('dashboard/')[1] || '';
	});

	// Handle scroll visibility - hide when scrolling down, show when scrolling up
	// TODO: This solution is not working as expected, need to fix
	onMount(() => {
		// Only apply scroll hide on devices with small screens
		if (window.innerWidth <= 768) {
			const handleScroll = () => {
				const currentScroll = window.scrollY;

				if (currentScroll > lastScrollPosition && currentScroll > 50) {
					isScrollingDown = true;
				} else {
					isScrollingDown = false;
				}

				// Add a small delay before actually hiding/showing to prevent flickering
				if (isScrollingDown && isVisible) {
					setTimeout(() => {
						isVisible = false;
					}, 100);
				} else if (!isScrollingDown && !isVisible) {
					setTimeout(() => {
						isVisible = true;
					}, 100);
				}

				lastScrollPosition = currentScroll;
			};

			window.addEventListener('scroll', handleScroll, { passive: true });

			return () => {
				window.removeEventListener('scroll', handleScroll);
			};
		}
	});
</script>

<!-- Dock is fixed at bottom of screen and animates in/out based on scroll -->
<div class="dock" class:hidden={!isVisible}>
	{#each sections as section}
		{#if section.mobile}
			<a
				href={`/dashboard/${section.id}`}
				class={currentSection === section.id ? 'dock-active' : ''}
				data-sveltekit-reload="off"
			>
				<iconify-icon icon={section.icon}></iconify-icon>
				<span class="dock-label">{section.label}</span>
			</a>
		{/if}
	{/each}
</div>
