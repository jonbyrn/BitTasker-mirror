<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { Unspent } from '@utexo/rgb-sdk-web';
	import { appStore } from '$lib/stores/app.store';
	import { walletStore, walletManager } from '$lib/stores/wallet.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

	let qrCodeData = $state('');
	let addressCopied = $state(false);
	let utxos = $state<Unspent[]>([]);
	let isLoadingUtxos = $state(false);

	const address = $derived($walletStore.wdk?.btcOnchain?.address ?? '');
	const isInitialized = $derived($walletStore.wdk?.initialized ?? false);
	const walletError = $derived($walletStore.wdk?.error ?? null);

	async function refreshUtxos() {
		isLoadingUtxos = true;
		try {
			utxos = await walletManager.listWdkUtxos();
		} finally {
			isLoadingUtxos = false;
		}
	}

	let sendAddress = $state('');
	let sendAmountSats = $state('');
	let isSending = $state(false);
	let sendResult = $state<{ txid: string } | { error: string } | null>(null);

	async function handleSendTestSats() {
		const amount = parseInt(sendAmountSats, 10);
		if (!sendAddress.trim() || !Number.isFinite(amount) || amount <= 0) {
			sendResult = { error: 'Enter a destination address and a positive sat amount.' };
			return;
		}
		isSending = true;
		sendResult = null;
		try {
			const txid = await walletManager.sendWdkTestSats(sendAddress.trim(), amount);
			sendResult = { txid };
			sendAddress = '';
			sendAmountSats = '';
			await refreshUtxos();
		} catch (err) {
			sendResult = { error: err instanceof Error ? err.message : 'Send failed' };
		} finally {
			isSending = false;
		}
	}

	$effect(() => {
		if (!isInitialized) {
			utxos = [];
			return;
		}
		void refreshUtxos();
	});

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

				<div class="w-full">
					<div class="mb-1 flex items-center justify-between text-xs opacity-70">
						<span>Unspent outputs ({utxos.length})</span>
						<button type="button" class="link" onclick={refreshUtxos} disabled={isLoadingUtxos}>
							{isLoadingUtxos ? 'Loading…' : 'Refresh'}
						</button>
					</div>
					{#if utxos.length === 0}
						<p class="text-base-content/60 text-xs">
							No confirmed UTXOs yet — fund the address above.
						</p>
					{:else}
						<ul class="space-y-1">
							{#each utxos as unspent (unspent.utxo.outpoint.txid + unspent.utxo.outpoint.vout)}
								<li class="border-base-300 rounded border p-2 text-xs">
									<div class="truncate">
										{unspent.utxo.outpoint.txid}:{unspent.utxo.outpoint.vout}
									</div>
									<div class="text-base-content/60">
										{unspent.utxo.btcAmount.toLocaleString()} sats · {unspent.utxo.colorable
											? 'colorable'
											: 'vanilla'}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<div class="w-full space-y-2 border-t border-dashed pt-3">
					<div class="text-xs opacity-70">Send test sats (testnet only)</div>
					<input
						type="text"
						bind:value={sendAddress}
						placeholder="Destination address (tb1p...)"
						class="input input-bordered input-xs w-full"
						disabled={isSending}
					/>
					<input
						type="number"
						bind:value={sendAmountSats}
						placeholder="Amount (sats)"
						min="1"
						class="input input-bordered input-xs w-full"
						disabled={isSending}
					/>
					<button
						type="button"
						class="btn btn-warning btn-xs w-full"
						onclick={handleSendTestSats}
						disabled={isSending}
					>
						{isSending ? 'Sending…' : 'Send'}
					</button>
					{#if sendResult}
						{#if 'txid' in sendResult}
							<p class="text-success truncate text-xs">Broadcast: {sendResult.txid}</p>
						{:else}
							<p class="text-error text-xs">{sendResult.error}</p>
						{/if}
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}
