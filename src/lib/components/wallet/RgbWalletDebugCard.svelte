<script lang="ts">
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { walletStore } from '$lib/stores/wallet.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

	let qrCodeData = $state('');
	let addressCopied = $state(false);

	const address = $derived($walletStore.wdk?.btcOnchain?.address ?? '');
	const isInitialized = $derived($walletStore.wdk?.initialized ?? false);
	const walletError = $derived($walletStore.wdk?.error ?? null);

	$effect(() => {
		if (!address) {
			qrCodeData = '';
			return;
		}
		generateQrCodeUrl(address)
			.then((url) => (qrCodeData = url))
			.catch((error) => {
				console.error('Failed to generate RGB wallet QR code:', error);
				qrCodeData = '';
			});
	});

	async function copyAddress() {
		if (!address) return;
		await copyToClipboard(address);
		appStore.showSuccessToast($t('wallet.address_copied'));
		addressCopied = true;
		setTimeout(() => (addressCopied = false), 2000);
	}
</script>

<!-- Dev-only debug overlay for testing the UTEXO RGB/Taproot wallet — never shown in production builds. -->
{#if import.meta.env.DEV}
	<div class="border-warning bg-base-200 space-y-3 rounded-lg border-2 border-dashed p-4">
		<div class="flex items-center justify-between">
			<span class="text-base-content text-sm font-semibold">RGB/Taproot Wallet (dev)</span>
			<span class="badge badge-warning badge-sm">DEV</span>
		</div>

		{#if walletError}
			<div class="alert alert-warning py-2 text-xs">{walletError}</div>
		{:else if !isInitialized}
			<div class="alert alert-outline py-2 text-xs">
				Set VITE_BITCOIN_ELECTRUM_URL to initialize the RGB wallet.
			</div>
		{:else if address}
			<div class="flex flex-col items-center gap-3">
				{#if qrCodeData}
					<div class="flex justify-center rounded-lg bg-white p-2 shadow-lg">
						<div class="w-full max-w-[180px]">
							<img src={qrCodeData} alt="RGB wallet address QR code" class="h-full w-full" />
						</div>
					</div>
				{/if}
				<div class="w-full">
					<div class="mb-1 text-start text-xs opacity-70">Taproot address (testnet)</div>
					<button
						type="button"
						class="border-base-300 relative flex w-full items-center justify-between gap-2 rounded border p-2 text-left"
						onclick={copyAddress}
					>
						<code class="truncate text-xs">{address}</code>
						<span class="text-primary shrink-0 text-xs">{addressCopied ? 'Copied' : 'Copy'}</span>
					</button>
				</div>
				<a
					href="https://mempool.space/testnet/faucet"
					target="_blank"
					rel="noopener noreferrer"
					class="link link-primary text-xs"
				>
					Get testnet BTC from a faucet
				</a>
			</div>
		{/if}
	</div>
{/if}
