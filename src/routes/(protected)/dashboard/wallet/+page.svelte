<script lang="ts">
	import { onMount } from 'svelte';
	import { walletStore } from '$lib/stores/wallet.store';
	import * as hardwareWallet from '$lib/utils/helpers/wallet/hardware-wallet.service';
	import walletService from '$lib/api/services/wallet.service';
	import type { WalletAddress, NetworkFee } from '$lib/types/wallet';

	// Import components
	import WalletBalance from '$lib/components/wallet/WalletBalance.svelte';
	import WalletReceive from '$lib/components/wallet/WalletReceive.svelte';
	import WalletSend from '$lib/components/wallet/WalletSend.svelte';
	import WalletTransactions from '$lib/components/wallet/WalletTransactions.svelte';
	import WalletSetup from '$lib/components/wallet/WalletSetup.svelte';

	// UI state with mutable let variables using runes
	let activeTab = $state('balance'); // balance, receive, send, transactions
	let selectedAddress = $state<WalletAddress | null>(null);
	let showQR = $state(false);
	let copiedAddress = $state(false);
	let isWalletInitialized = $state(false);
	let isCreatingWallet = $state(false);
	let walletPassword = $state('');
	let passwordError = $state('');
	let isLoading = $state(false);
	let walletNetwork = $state<'Bitcoin' | 'Lightning' | 'Liquid'>('Bitcoin');
	let showHardwareWalletOptions = $state(false);
	let isConnectingHardwareWallet = $state(false);
	let hardwareWalletConnected = $state(false);
	let hardwareWalletType = $state<'ledger' | 'trezor' | null>(null);

	// Send form
	let sendAmount = $state('');
	let sendAddress = $state('');
	let sendNetworkFee = $state<NetworkFee['type']>('medium'); // low, medium, high
	let sendError = $state('');
	let sendNetwork = $state<'Bitcoin' | 'Lightning' | 'Liquid'>('Bitcoin');
	let sendAssetId = $state(''); // For Liquid assets

	// Receive form
	let requestAmount = $state('');
	let requestDescription = $state('');
	let requestCurrency = $state<'BTC' | 'sats'>('BTC');
	let lightningInvoice = $state('');

	// Handle changing tabs - create a function with the name expected by child components
	function onTabChange(tab: string) {
		activeTab = tab;
	}

	onMount(async () => {
		// Check if wallet is already initialized
		const wallet = await walletService.getOrCreateWallet();
		console.log('wallet', wallet);

		try {
			// Check if wallet exists and is initialized
			const storagePreference = walletStore.getStoragePreference();
			if (storagePreference) {
				// Wallet setup has been started, mark as initialized
				isWalletInitialized = true;
			}
		} catch (error) {
			console.error('Error checking wallet initialization:', error);
		}

		// Check hardware wallet support
		const hasHardwareSupport = hardwareWallet.checkHardwareWalletSupport();
		if (hasHardwareSupport) {
			showHardwareWalletOptions = true;
		}
	});

	// Format number with a specific number of decimals
	function formatNumber(number: number, decimals: number): string {
		return number.toFixed(decimals);
	}

	// Convert BTC to sats
	function btcToSats(btc: number): number {
		return Math.floor(btc * 100000000);
	}

	// Convert sats to BTC
	function satsToBtc(sats: number): number {
		return sats / 100000000;
	}

	// Format timestamp to human-readable date
	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Truncate address for display
	function truncateAddress(address: string, prefixLength = 8, suffixLength = 4): string {
		if (address.length <= prefixLength + suffixLength) {
			return address;
		}
		return `${address.substring(0, prefixLength)}...${address.substring(address.length - suffixLength)}`;
	}

	// Copy address to clipboard
	function copyToClipboard(text: string): void {
		navigator.clipboard.writeText(text).then(() => {
			copiedAddress = true;
			setTimeout(() => {
				copiedAddress = false;
			}, 2000);
		});
	}

	// Toggle QR code visibility
	function toggleQR(): void {
		showQR = !showQR;
	}

	// Select address type
	function selectNetwork(type: 'Bitcoin' | 'Lightning' | 'Liquid'): void {
		walletNetwork = type;
		const address = walletStore.subscribe((state) => {
			const found = state.addresses.find((a) => a.type === type);
			if (found) {
				selectedAddress = found;
			}
		})();
	}

	// Create or unlock wallet
	async function setupWallet(): Promise<void> {
		if (!walletPassword) {
			passwordError = 'Please enter a password';
			return;
		}

		isLoading = true;
		passwordError = '';

		try {
			// Try to initialize wallet
			const success = await walletStore.initializeWallet(walletPassword, 'service');

			if (!success) {
				passwordError = 'Failed to setup wallet. Please try again.';
			} else {
				isWalletInitialized = true;
				walletPassword = '';
			}
		} catch (error) {
			console.error('Wallet setup error:', error);
			passwordError = 'An error occurred during wallet setup';
		} finally {
			isLoading = false;
		}
	}

	// Connect hardware wallet
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

	// Generate a new address
	async function generateNewAddress(): Promise<void> {
		try {
			const newAddress = await walletStore.generateAddress(walletNetwork);
			if (newAddress) {
				selectedAddress = newAddress;
			}
		} catch (error) {
			console.error('Failed to generate address:', error);
		}
	}

	// Generate a Lightning invoice
	async function generatePaymentRequest(): Promise<void> {
		if (!requestAmount) {
			return;
		}

		try {
			// Convert amount to sats if needed
			const amountSats =
				requestCurrency === 'BTC' ? btcToSats(parseFloat(requestAmount)) : parseInt(requestAmount);

			// Generate invoice
			// const invoice = await generateLightningInvoice(
			// 	amountSats,
			// 	requestDescription || 'BitTasker Payment',
			// 	3600 // 1 hour expiry
			// );
			const invoice = {
				paymentRequest: `lnbc${amountSats}${Math.random().toString(36).substring(2, 15)}`,
				amount: amountSats / 100000000, // Convert to BTC
				description: requestDescription || 'BitTasker Payment',
				expiryTime: Date.now() + 3600 * 1000 // 1 hour expiry
			};

			lightningInvoice = invoice.paymentRequest;
			showQR = true;
		} catch (error) {
			console.error('Failed to generate payment request:', error);
		}
	}

	// Validate send form
	function validateSendForm(): boolean {
		if (!sendAmount || isNaN(parseFloat(sendAmount)) || parseFloat(sendAmount) <= 0) {
			sendError = 'Please enter a valid amount';
			return false;
		}

		// Get current balance from wallet store
		let insufficientFunds = false;
		walletStore.subscribe((state) => {
			if (parseFloat(sendAmount) > state.balance.btc) {
				insufficientFunds = true;
			}
		})();

		if (insufficientFunds) {
			sendError = 'Insufficient balance';
			return false;
		}

		if (!sendAddress.trim()) {
			sendError = 'Please enter a recipient address';
			return false;
		}

		// Validate address based on network
		// const isValidAddress = validateAddress(sendAddress, sendNetwork);
		const isValidAddress = false;
		if (!isValidAddress) {
			sendError = `Invalid ${sendNetwork} address`;
			return false;
		}

		sendError = '';
		return true;
	}

	// Send transaction
	async function _sendTransaction(): Promise<void> {
		if (!validateSendForm()) {
			return;
		}

		isLoading = true;
		try {
			const params = {
				amount: parseFloat(sendAmount),
				recipientAddress: sendAddress,
				networkFee: sendNetworkFee,
				description: 'BitTasker Transfer',
				network: sendNetwork,
				...(sendNetwork === 'Liquid' && sendAssetId ? { assetId: sendAssetId } : {})
			};

			const tx = await walletStore.sendTransaction(params);

			// Reset form
			sendAmount = '';
			sendAddress = '';
			sendNetworkFee = 'medium';

			// Switch to transactions tab to show the new transaction
			activeTab = 'transactions';
		} catch (error) {
			console.error('Failed to send transaction:', error);
			sendError = 'Failed to send transaction. Please try again.';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-100 mx-auto max-w-4xl rounded-lg p-6 shadow-lg">
	<h2 class="mb-6 text-2xl font-bold">Bitcoin Wallet</h2>

	{#if !isWalletInitialized}
		<!-- Wallet Setup Screen -->
		<WalletSetup />
		
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
		{/if}
	{/if}
</div>
