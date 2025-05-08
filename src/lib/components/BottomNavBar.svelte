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
<!-- <div class="dock-container" class:dock-hidden={!isVisible}>
	<div class="dock">
		{#each sections as section}
			<a
				href={`/dashboard/${section.id}`}
				class="dock-item"
				class:dock-active={currentSection === section.id}
				data-sveltekit-reload="off"
				aria-label={section.label}
			>
				<div class="dock-icon">
					<iconify-icon icon={section.icon} width="24" height="24"></iconify-icon>
				</div>
				<span class="dock-label">{section.label}</span>
			</a>
		{/each}
	</div>
</div> -->
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

<!-- <style>
	.dock-container {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 50;
		transition: transform 0.3s ease;
		padding-bottom: env(safe-area-inset-bottom, 0);
	}
	
	.dock-hidden {
		transform: translateY(100%);
	}
	
	.dock {
		display: flex;
		justify-content: space-around;
		align-items: center;
		background-color: hsl(var(--b-100) / 0.9);
		backdrop-filter: blur(8px);
		border-top: 1px solid hsl(var(--b-300) / 0.5);
		padding: 0.5rem 0;
	}
	
	.dock-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem;
		border-radius: 0.5rem;
		color: hsl(var(--bc) / 0.7);
		transition: all 0.2s ease;
		position: relative;
		text-decoration: none;
		width: 20%;
	}
	
	.dock-active {
		color: hsl(var(--p));
	}
	
	.dock-active::after {
		content: '';
		position: absolute;
		bottom: -0.5rem;
		left: 35%;
		width: 30%;
		height: 3px;
		background-color: hsl(var(--p));
		border-radius: 3px;
	}
	
	.dock-icon {
		margin-bottom: 0.25rem;
	}
	
	.dock-label {
		font-size: 0.75rem;
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style> -->
