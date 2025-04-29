<script lang="ts">
	import { onMount } from 'svelte';
	import { requestProvider, onConnected, onDisconnected, onModalOpened, onModalClosed } from '@getalby/bitcoin-connect';

	let isConnecting = $state(false);
	let isConnected = $state(false);
	let error = $state('');
	let provider = $state<any>(null);
	let modalOpen = $state(false);

	// Initialize Bitcoin Connect
	onMount(() => {
		try {
			// Set up event listeners
			const unsubConnected = onConnected((p) => {
				provider = p;
				isConnected = true;
				error = '';
				console.log('Connected to provider:', p);
			});

			const unsubDisconnected = onDisconnected(() => {
				isConnected = false;
				provider = null;
				console.log('Disconnected from provider');
			});

			const unsubModalOpened = onModalOpened(() => {
				modalOpen = true;
				console.log('Modal opened');
			});

			const unsubModalClosed = onModalClosed(() => {
				modalOpen = false;
				console.log('Modal closed');
			});

			// Clean up event listeners on component unmount
			return () => {
				unsubConnected();
				unsubDisconnected();
				unsubModalOpened();
				unsubModalClosed();
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
			console.log('Connected to provider:', p);
		} catch (err) {
			console.error('Error connecting to wallet:', err);
			error = err instanceof Error ? err.message : 'Failed to connect to wallet';
		} finally {
			isConnecting = false;
		}
	}

	// Generate a Lightning invoice
	async function generateInvoice() {
		if (!provider) {
			error = 'No wallet connected';
			return;
		}

		try {
			// Check if the provider supports makeInvoice
			if (typeof provider.makeInvoice === 'function') {
				const invoice = await provider.makeInvoice({
					amount: 1000, // 1000 sats
					defaultMemo: 'BitTasker Test Invoice'
				});
				console.log('Generated invoice:', invoice);
				return invoice;
			} else {
				error = 'Provider does not support invoice generation';
				return null;
			}
		} catch (err) {
			console.error('Error generating invoice:', err);
			error = err instanceof Error ? err.message : 'Failed to generate invoice';
			return null;
		}
	}

	// Pay a Lightning invoice
	async function payInvoice(invoice: string) {
		if (!provider) {
			error = 'No wallet connected';
			return;
		}

		try {
			// Check if the provider supports sendPayment
			if (typeof provider.sendPayment === 'function') {
				const result = await provider.sendPayment(invoice);
				console.log('Payment result:', result);
				return result;
			} else {
				error = 'Provider does not support sending payments';
				return null;
			}
		} catch (err) {
			console.error('Error paying invoice:', err);
			error = err instanceof Error ? err.message : 'Failed to pay invoice';
			return null;
		}
	}

	// Get wallet info
	async function getWalletInfo() {
		if (!provider) {
			error = 'No wallet connected';
			return;
		}

		try {
			// Check if the provider supports getInfo
			if (typeof provider.getInfo === 'function') {
				const info = await provider.getInfo();
				console.log('Wallet info:', info);
				return info;
			} else {
				error = 'Provider does not support getting wallet info';
				return null;
			}
		} catch (err) {
			console.error('Error getting wallet info:', err);
			error = err instanceof Error ? err.message : 'Failed to get wallet info';
			return null;
		}
	}
</script>

<div class="p-4">
	<h2 class="mb-4 text-xl font-bold">Bitcoin Connect Integration</h2>

	<div class="mb-6">
		<button 
			onclick={connectWallet} 
			disabled={isConnecting || isConnected} 
			class="btn btn-primary"
		>
			{#if isConnecting}
				Connecting...
			{:else if isConnected}
				Connected
			{:else}
				Connect Wallet
			{/if}
		</button>
	</div>

	{#if isConnected && provider}
		<div class="card bg-base-200 mb-6">
			<div class="card-body">
				<h3 class="card-title">Connected Wallet</h3>
				<p>Provider: {provider.name || 'Unknown'}</p>
				<p>Node: {provider.node || 'Unknown'}</p>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title">Generate Invoice</h3>
					<button onclick={generateInvoice} class="btn btn-secondary">
						Generate Test Invoice
					</button>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title">Pay Invoice</h3>
					<div class="form-control">
						<input 
							type="text" 
							placeholder="lnbc..." 
							class="input input-bordered mb-2" 
							id="invoice-input"
						/>
						<button 
							onclick={() => {
								const invoice = (document.getElementById('invoice-input') as HTMLInputElement).value;
								if (invoice) payInvoice(invoice);
							}} 
							class="btn btn-secondary"
						>
							Pay Invoice
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if error}
		<div class="mt-4 rounded bg-red-100 p-2 text-red-700">
			{error}
		</div>
	{/if}

	{#if modalOpen}
		<div class="mt-4 rounded bg-blue-100 p-2 text-blue-700">
			Bitcoin Connect modal is open
		</div>
	{/if}
</div>

<style>
	:global(body.bc-modal-open) {
		overflow: hidden;
	}
</style> 