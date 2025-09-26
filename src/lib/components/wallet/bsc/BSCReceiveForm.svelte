<script lang="ts">
	import { t} from 'svelte-i18n';
	import { bscUsdtWalletStore, bscTokenBalances } from '$lib/stores/bscUsdtWallet.store';
	import { BSC_NETWORKS } from '$lib/stores/bscUsdtWallet.store';
	import QRCode from 'qrcode';

	let selectedToken = $state('USDT');
	let qrCodeDataUrl = $state('');
	let showQRCode = $state(false);

	// Get current network info
	const networkInfo = $derived(BSC_NETWORKS[$bscUsdtWalletStore.network]);
	const usdtToken = $derived(networkInfo.tokens.find(token => token.symbol === 'USDT' || token.symbol === 'tUSDT'));

	// Generate QR code when token selection changes
	$effect(() => {
		if ($bscUsdtWalletStore.address && selectedToken) {
			generateQRCode();
		}
	});

	async function generateQRCode() {
		if (!$bscUsdtWalletStore.address) return;

		try {
			let qrData: string;

			if (selectedToken === 'USDT' && usdtToken) {
				// Generate ERC-20 transfer QR code
				qrData = `ethereum:${usdtToken.address}@${networkInfo.chainId}/transfer?address=${$bscUsdtWalletStore.address}`;
			} else if (selectedToken === 'BNB') {
				// Generate BNB transfer QR code
				qrData = `ethereum:${$bscUsdtWalletStore.address}@${networkInfo.chainId}`;
			} else {
				qrData = $bscUsdtWalletStore.address;
			}

			qrCodeDataUrl = await QRCode.toDataURL(qrData, {
				width: 256,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#FFFFFF'
				}
			});
		} catch (error) {
			console.error('Failed to generate QR code:', error);
		}
	}

	// Copy address to clipboard
	async function copyAddress() {
		if ($bscUsdtWalletStore.address) {
			try {
				await navigator.clipboard.writeText($bscUsdtWalletStore.address);
				// You could show a toast notification here
			} catch (err) {
				console.error('Failed to copy address:', err);
			}
		}
	}

	// Copy QR data to clipboard
	async function copyQRData() {
		if (!$bscUsdtWalletStore.address) return;

		try {
			let qrData: string;

			if (selectedToken === 'USDT' && usdtToken) {
				qrData = `ethereum:${usdtToken.address}@${networkInfo.chainId}/transfer?address=${$bscUsdtWalletStore.address}`;
			} else if (selectedToken === 'BNB') {
				qrData = `ethereum:${$bscUsdtWalletStore.address}@${networkInfo.chainId}`;
			} else {
				qrData = $bscUsdtWalletStore.address;
			}

			await navigator.clipboard.writeText(qrData);
			// You could show a toast notification here
		} catch (err) {
			console.error('Failed to copy QR data:', err);
		}
	}
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<h3 class="card-title mb-4">{$t('wallet.bsc.receive_token', { values: { token: selectedToken } })}</h3>

		<!-- Token Selection -->
		<div class="form-control mb-4">
			<label class="label" for="token-select">
				<span class="label-text">{$t('wallet.bsc.token')}</span>
			</label>
			<select 
				id="token-select"
				bind:value={selectedToken} 
				class="select select-bordered w-full"
			>
				<option value="USDT">USDT</option>
				<option value="BNB">BNB</option>
			</select>
		</div>

		<!-- Address Display -->
		<div class="form-control mb-4">
			<label class="label" for="address-input">
				<span class="label-text">{$t('wallet.bsc.your_address')}</span>
			</label>
			<div class="input-group">
				<input
					id="address-input"
					type="text"
					value={$bscUsdtWalletStore.address || $t('wallet.bsc.not_connected')}
					readonly
					class="input input-bordered flex-1 font-mono text-sm"
				/>
				<button 
					class="btn btn-square btn-outline"
					onclick={copyAddress}
					disabled={!$bscUsdtWalletStore.address}
					aria-label="Copy address to clipboard"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
					</svg>
				</button>
			</div>
		</div>

		<!-- QR Code Toggle -->
		<div class="form-control mb-4">
			<label class="label cursor-pointer">
				<span class="label-text">{$t('wallet.bsc.show_qr_code')}</span>
				<input 
					type="checkbox" 
					bind:checked={showQRCode}
					class="checkbox checkbox-primary" 
				/>
			</label>
		</div>

		<!-- QR Code Display -->
		{#if showQRCode && qrCodeDataUrl}
			<div class="text-center mb-4">
				<div class="bg-white p-4 rounded-lg inline-block">
					<img src={qrCodeDataUrl} alt="QR Code" class="w-64 h-64" />
				</div>
				<div class="mt-2">
					<button 
						class="btn btn-sm btn-outline"
						onclick={copyQRData}
					>
						{$t('wallet.bsc.copy_qr_data')}
					</button>
				</div>
			</div>
		{/if}

		<!-- Instructions -->
		<div class="alert alert-info">
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<div>
				<div class="font-bold">{$t('wallet.bsc.receiving_instructions')}</div>
				<div class="text-xs mt-1">
					{#if selectedToken === 'USDT'}
						<p>• {$t('wallet.bsc.share_address_usdt')}</p>
						<p>• {$t('wallet.bsc.make_sure_bsc')}</p>
						<p>• {$t('wallet.bsc.confirmations_time')}</p>
					{:else if selectedToken === 'BNB'}
						<p>• {$t('wallet.bsc.share_address_bnb')}</p>
						<p>• {$t('wallet.bsc.make_sure_bsc')}</p>
						<p>• {$t('wallet.bsc.confirmations_time')}</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Network Info -->
		<div class="mt-4 text-xs text-base-content/70">
			<div>{$t('wallet.bsc.network_info')}: {networkInfo.name}</div>
			<div>{$t('wallet.bsc.chain_id')}: {networkInfo.chainId}</div>
			{#if selectedToken === 'USDT' && usdtToken}
				<div>{$t('wallet.bsc.usdt_contract')}: {usdtToken.address}</div>
			{/if}
		</div>
	</div>
</div>
