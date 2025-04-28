<script lang="ts">
	import { onMount } from 'svelte';
	import WalletBalance from '$lib/components/wallet/WalletBalance.svelte';
	import WalletReceive from '$lib/components/wallet/WalletReceive.svelte';
	import WalletSend from '$lib/components/wallet/WalletSend.svelte';
	import WalletTransactions from '$lib/components/wallet/WalletTransactions.svelte';
	import WalletSetup from '$lib/components/wallet/WalletSetup.svelte';
	import LightningConnect from '$lib/components/wallet/lightning/LightningConnect.svelte';
	import LightningInvoice from '$lib/components/wallet/lightning/LightningInvoice.svelte';
	import LightningPay from '$lib/components/wallet/lightning/LightningPay.svelte';
	import BitcoinConnect from '$lib/components/wallet/lightning/BitcoinConnect.svelte';
	import EscrowContract from '$lib/components/wallet/escrow/EscrowContract.svelte';
	import LiquidAssetManager from '$lib/components/wallet/escrow/LiquidAssetManager.svelte';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import type {
		EscrowContractEvents,
		LiquidAssetManagerEvents,
		BitcoinPaymentEvents
	} from '$lib/types/wallet';
	import BitcoinPayment from '$lib/components/wallet/BitcoinPayment.svelte';
	import { generateMnemonic } from '$lib/utils/helpers/wallet';

	// UI state with mutable let variables using runes
	let activeTab = $state<
		| 'balance'
		| 'receive'
		| 'send'
		| 'transactions'
		| 'lightning'
		| 'payment'
		| 'escrow'
		| 'liquid-escrow'
	>('balance');
	let activeLightningTab = $state('connect'); // connect, invoice, pay, bitcoin-connect
	let isWalletInitialized = $state(false);
	let showHardwareWalletOptions = $state(false);
	let isConnectingHardwareWallet = $state(false);
	let lightningInvoice = $state('');

	// Payment
	let paymentAmount = $state(0);
	let paymentDescription = $state('');
	let paymentRecipient = $state('');
	// Escrow
	let escrowAmount = $state(0);
	let escrowDescription = $state('');
	let escrowRecipient = $state('');
	let escrowTimeLock = $state(144); // 24 hours in blocks
	let escrowSignatures = $state(2);
	let liquidAssetId = $state('');
	let liquidAmount = $state(0);
	let liquidDescription = $state('');

	// Handle changing tabs - create a function with the name expected by child components
	function onTabChange(tab: string) {
		activeTab = tab as typeof activeTab;
	}

	function onLightningTabChange(tab: string) {
		activeLightningTab = tab;
	}

	// Handle invoice generation
	function handleInvoiceGenerated(invoice: string) {
		lightningInvoice = invoice;
	}

	// Handle payment completion
	function handlePaymentComplete(event: CustomEvent) {
		console.log('Payment completed:', event.detail);
		// You can add additional logic here, like showing a success message
		// or updating the transaction list
	}

	// Handle escrow events
	function handleEscrowCreated(event: EscrowContractEvents['escrowCreated']) {
		console.log('Escrow created:', event);
	}

	function handleEscrowReleased(event: EscrowContractEvents['escrowReleased']) {
		console.log('Escrow released:', event);
	}

	function handleEscrowDisputed(event: EscrowContractEvents['escrowDisputed']) {
		console.log('Escrow disputed:', event);
	}

	// Handle liquid escrow events
	function handleLiquidEscrowCreated(event: LiquidAssetManagerEvents['liquidEscrowCreated']) {
		console.log('Liquid escrow created:', event);
	}

	// TODO: Check hardware wallet support
	function checkHardwareWalletSupport(): boolean {
		const hasWebUSB = typeof navigator !== 'undefined' && 'usb' in navigator;
		const hasWebHID = typeof navigator !== 'undefined' && 'hid' in navigator;

		return hasWebUSB || hasWebHID;
	}

	onMount(async () => {
		try {
			// Check if wallet exists and is initialized
			const { value: storagePreference } = await Preferences.get({
				key: StorageKeys.WALLET_STORAGE_PREFERENCE
			});
			const { value: walletCredentialId } = await Preferences.get({
				key: StorageKeys.WALLET_AUTHN_CREDENTIAL_ID
			});

			if (storagePreference && walletCredentialId) {
				// Wallet setup has been started, mark as initialized
				isWalletInitialized = true;
			}
		} catch (error) {
			console.error('Error checking wallet initialization:', error);
		}

		// TODO: Check hardware wallet support
		// const hasHardwareSupport = checkHardwareWalletSupport();
		// if (hasHardwareSupport) {
		// 	showHardwareWalletOptions = true;
		// }
	});

	// TODO: Connect hardware wallet
	async function connectHardwareWallet(type: 'ledger' | 'trezor'): Promise<void> {
		return console.warn('Hardware wallet not implemented');
		// isConnectingHardwareWallet = true;

		// try {
		// 	const connected = await connectHardwareWallet(type);
		// 	if (connected) {
		// 		hardwareWalletConnected = true;
		// 		hardwareWalletType = type;
		// 	}
		// } catch (error) {
		// 	console.error(`Failed to connect ${type}:`, error);
		// } finally {
		// 	isConnectingHardwareWallet = false;
		// }
	}
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Bitcoin Wallet</h2>

	{#if !isWalletInitialized}
		<!-- Wallet Setup Screen -->
		<WalletSetup bind:isWalletInitialized />

		{#if showHardwareWalletOptions}
			<div class="divider">OR</div>

			<div class="flex gap-2">
				<button
					class="btn flex-1"
					onclick={() => connectHardwareWallet('ledger')}
					disabled={isConnectingHardwareWallet}
				>
					Connect Ledger
				</button>
				<button
					class="btn flex-1"
					onclick={() => connectHardwareWallet('trezor')}
					disabled={isConnectingHardwareWallet}
				>
					Connect Trezor
				</button>
			</div>
		{/if}
	{:else}
		<!-- Tabs -->
		<div class="tabs tabs-boxed mb-6">
			<button
				class="tab {activeTab === 'balance' ? 'tab-active' : ''}"
				onclick={() => onTabChange('balance')}
			>
				Balance
			</button>
			<button
				class="tab {activeTab === 'receive' ? 'tab-active' : ''}"
				onclick={() => onTabChange('receive')}
			>
				Receive
			</button>
			<button
				class="tab {activeTab === 'send' ? 'tab-active' : ''}"
				onclick={() => onTabChange('send')}
			>
				Send
			</button>
			<button
				class="tab {activeTab === 'transactions' ? 'tab-active' : ''}"
				onclick={() => onTabChange('transactions')}
			>
				Transactions
			</button>
			<button
				class="tab {activeTab === 'lightning' ? 'tab-active' : ''}"
				onclick={() => onTabChange('lightning')}
			>
				Lightning
			</button>
			<button
				class="tab {activeTab === 'payment' ? 'tab-active' : ''}"
				onclick={() => onTabChange('payment')}
			>
				Pay
			</button>
			<button
				class="tab {activeTab === 'escrow' ? 'tab-active' : ''}"
				onclick={() => onTabChange('escrow')}
			>
				Escrow
			</button>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'balance'}
			<WalletBalance {onTabChange} />
		{:else if activeTab === 'receive'}
			<WalletReceive />
		{:else if activeTab === 'send'}
			<WalletSend {onTabChange} />
		{:else if activeTab === 'transactions'}
			<WalletTransactions />
		{:else if activeTab === 'lightning'}
			<div class="tabs tabs-boxed mb-6">
				<button
					class="tab {activeLightningTab === 'connect' ? 'tab-active' : ''}"
					onclick={() => onLightningTabChange('connect')}
				>
					Connect
				</button>
				<button
					class="tab {activeLightningTab === 'invoice' ? 'tab-active' : ''}"
					onclick={() => onLightningTabChange('invoice')}
				>
					Invoice
				</button>
				<button
					class="tab {activeLightningTab === 'pay' ? 'tab-active' : ''}"
					onclick={() => onLightningTabChange('pay')}
				>
					Pay
				</button>
				<button
					class="tab {activeLightningTab === 'bitcoin-connect' ? 'tab-active' : ''}"
					onclick={() => onLightningTabChange('bitcoin-connect')}
				>
					Bitcoin Connect
				</button>
			</div>

			{#if activeLightningTab === 'connect'}
				<LightningConnect />
			{:else if activeLightningTab === 'invoice'}
				<LightningInvoice
					amount={1000}
					description="Test invoice"
					onInvoiceGenerated={handleInvoiceGenerated}
				/>
			{:else if activeLightningTab === 'pay'}
				<!-- <LightningPay /> -->
			{:else if activeLightningTab === 'bitcoin-connect'}
				<BitcoinConnect />
			{/if}
		{:else if activeTab === 'payment'}
			<div class="mb-6">
				<h3 class="mb-4 text-xl font-semibold">Pay with Bitcoin</h3>
				<BitcoinPayment
					amount={paymentAmount}
					description={paymentDescription}
					recipient={paymentRecipient}
					onPaymentComplete={handlePaymentComplete}
				/>
			</div>
		{:else if activeTab === 'escrow' || activeTab === 'liquid-escrow'}
			<div class="mb-6">
				<h3 class="mb-4 text-xl font-semibold">Escrow Services</h3>

				<div class="tabs tabs-boxed mb-6">
					<button
						class="tab {activeTab === 'escrow' ? 'tab-active' : ''}"
						onclick={() => onTabChange('escrow')}
					>
						Bitcoin Escrow
					</button>
					<button
						class="tab {activeTab === 'liquid-escrow' ? 'tab-active' : ''}"
						onclick={() => onTabChange('liquid-escrow')}
					>
						Liquid Escrow
					</button>
				</div>

				{#if activeTab === 'escrow'}
					<EscrowContract
						amount={escrowAmount}
						description={escrowDescription}
						recipient={escrowRecipient}
						timeLockDuration={escrowTimeLock}
						requiredSignatures={escrowSignatures}
						onEscrowCreated={handleEscrowCreated}
						onEscrowReleased={handleEscrowReleased}
						onEscrowDisputed={handleEscrowDisputed}
					/>
				{:else if activeTab === 'liquid-escrow'}
					<LiquidAssetManager
						assetId={liquidAssetId}
						amount={liquidAmount}
						description={liquidDescription}
						onLiquidEscrowCreated={handleLiquidEscrowCreated}
					/>
				{/if}
			</div>
		{/if}
	{/if}
</div>
