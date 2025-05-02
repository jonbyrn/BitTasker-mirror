<!-- 
 Bitcoin Connect
 https://github.com/getAlby/bitcoin-connect?tab=readme-ov-file
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { init } from '@getalby/bitcoin-connect';

	let error = $state('');

	// Initialize Bitcoin Connect
	onMount(async () => {
		try {
			// Initialize Bitcoin Connect with app name and show balance
			init({
				appName: 'BitTasker',
				showBalance: true
			});
		} catch (err) {
			console.error('Error initializing Bitcoin Connect:', err);
			error = 'Failed to initialize Bitcoin Connect';
		}
	});
</script>

<bc-connect></bc-connect>

<style>
	:gloabl(.lightning-wallet-connect) {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		padding: 1rem;
	}

	:global(.bc-button) {
		/* Inherits styles from global bc-button */
		composes: bc-button from global;
	}

	/* Bitcoin Connect Styles */
	:root {
		--bc-color-brand: #ff9315; /* Bitcoin orange */
		--bc-color-brand-dark: #ff9315; /* Same color for dark mode */
		--bc-brand-mix: 100%;
		--bc-color-brand-button-text: #ffffff;
		--bc-color-brand-button-text-dark: #ffffff;
	}

	/* Modal styles */
	:global(.bc-modal) {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgba(0, 0, 0, 0.5);
	}

	:global(.bc-modal-content) {
		background-color: var(--bc-color-background, #ffffff);
		border-radius: 0.5rem;
		padding: 1.5rem;
		max-width: 90%;
		max-height: 90%;
		overflow-y: auto;
	}

	:global(body.bc-modal-open) {
		overflow: hidden;
	}

	/* Bitcoin Connect Component Styles */
	:global(bc-connect) {
		display: block;
		width: 100%;
	}

	:global(bc-button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1rem;
		font-size: 1rem;
		font-weight: 500;
		border-radius: 0.375rem;
		background-color: var(--bc-color-brand);
		color: var(--bc-color-brand-button-text);
		cursor: pointer;
		transition: background-color 0.2s;
	}

	:global(bc-button:hover) {
		opacity: 0.9;
	}

	/* Dark mode styles */
	@media (prefers-color-scheme: dark) {
		:global(bc-button) {
			background-color: var(--bc-color-brand-dark);
			color: var(--bc-color-brand-button-text-dark);
		}
	}
</style>
