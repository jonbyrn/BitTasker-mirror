<script lang="ts">
	import type { WebLNProvider } from '@webbtc/webln-types';
	import { onMount } from 'svelte';
	import { init, requestProvider, onConnected, onDisconnected, WebLNProviders } from '@getalby/bitcoin-connect';

	let isConnecting = $state(false);
	let isConnected = $state(false);
	let error = $state('');
	let provider = $state<WebLNProvider | null>(null);
	let balance = $state<number | null>(null);

	// Initialize Bitcoin Connect
	onMount(() => {
		try {
			// Initialize Bitcoin Connect with app name and show balance
			init({
				appName: 'BitTasker',
				showBalance: true
			});

			// Set up event listeners
			const unsubConnected = onConnected((p) => {
				provider = p;
				isConnected = true;
				error = '';
				getBalance();
				console.log('Connected to provider:', p);
			});

			const unsubDisconnected = onDisconnected(() => {
				isConnected = false;
				provider = null;
				balance = null;
				console.log('Disconnected from provider');
			});

			// Clean up event listeners on component unmount
			return () => {
				unsubConnected();
				unsubDisconnected();
			};
		} catch (err) {
			console.error('Error initializing Bitcoin Connect:', err);
			error = 'Failed to initialize Bitcoin Connect';
		}
	});

	// Connect to a wallet
	async function connectWallet() {
		isConnecting = true;
		error = '';

		try {
			// Request a provider
			const p = await requestProvider();
			provider = p;
			isConnected = true;
			await getBalance();
			console.log('Connected to provider:', p);
		} catch (err) {
			console.error('Error connecting to wallet:', err);
			error = err instanceof Error ? err.message : 'Failed to connect to wallet';
		} finally {
			isConnecting = false;
		}
	}

	// Get wallet balance
	async function getBalance() {
		if (!provider) return;

		try {
			const info = await provider.getInfo();
			if (info.balance) {
				balance = info.balance.balance;
			}
		} catch (err) {
			console.error('Error getting balance:', err);
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-2">
		<h3 class="text-lg font-semibold">Connect External Lightning Wallet</h3>
		<p class="text-base-content/70 text-sm">
			Connect your existing Lightning wallet to use with BitTasker. We support various wallets
			including Alby, LNbits, and more.
		</p>
	</div>

	{#if !isConnected}
		<button
			onclick={connectWallet}
			disabled={isConnecting}
			class="btn btn-primary w-full {isConnecting ? 'loading' : ''}"
		>
			{#if isConnecting}
				Connecting...
			{:else}
				Connect Wallet
			{/if}
		</button>
	{:else if provider}
		<div class="card bg-base-200">
			<div class="card-body">
				<h3 class="card-title">Connected Wallet</h3>
				<div class="flex flex-col gap-2">
					<p>Provider: {provider.name || 'Unknown'}</p>
					{#if balance !== null}
						<p>Balance: {balance} sats</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}
</div>

<style>
	.lightning-wallet-connect {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		padding: 1rem;
	}

	.bc-button {
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
	.bc-modal {
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
