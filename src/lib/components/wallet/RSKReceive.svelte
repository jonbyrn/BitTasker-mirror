<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import { rskConnection } from '$lib/stores/wallet.store';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

	let amount = $state('');
	let message = $state('');
	let addressCopied = $state(false);
	let qrCodeData = $state('');
	let address = $state($rskConnection.address);
	let isLoading = $state(false);

	async function paymentRequest(): Promise<void> {
		address = $rskConnection.address;

		try {
			isLoading = true;

			if (!address) {
				appStore.showErrorToast('No RSK address available');
				return;
			}

			if (!amount && !message) {
				qrCodeData = await generateQrCodeUrl(address);
				return;
			}

			const params = new URLSearchParams();

			if (amount) {
				params.append('value', (parseFloat(amount) * 1e18).toString()); // Convert to wei
			}
			if (message) {
				params.append('message', message);
			}

			// Add chain ID for RSK
			const chainId = RSK_NETWORKS[$appStore.network]?.chainId || 31;
			params.append('chainId', chainId.toString());

			if (params.toString()) {
				address += `?${params.toString()}`;
			}

			qrCodeData = await generateQrCodeUrl(address);
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			appStore.showErrorToast('Failed to generate QR code');
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		paymentRequest();
	});

	async function copyAddress() {
		if (address) {
			await copyToClipboard(address);
			appStore.showSuccessToast($t('wallet.address_copied'));
			addressCopied = true;
			setTimeout(() => {
				addressCopied = false;
			}, 2000);
		}
	}

	// Debounce function
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}
</script>

<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
	<!-- Payment Request Form -->
	<div class="space-y-4">
		<h4 class="font-semibold">{$t('wallet.payment_request')}</h4>
		<p class="text-sm text-base-content/70">
			{$t('wallet.payment_request_description')}
		</p>

		<!-- Amount Field for RSK -->
		<div class="form-control">
			<label class="label" for="rsk-amount">
				<span class="label-text">
					{$t('wallet.amount_rbtc')}
				</span>
				<span class="label-text-alt">{$t('wallet.optional')}</span>
			</label>
			<input
				id="rsk-amount"
				type="number"
				step="0.000001"
				placeholder="0.0"
				class="input input-bordered w-full"
				bind:value={amount}
				oninput={debounce(() => paymentRequest(), 1000)}
				disabled={!$rskConnection.connected}
			/>
		</div>
		<!-- Message Field for RSK -->
		<div class="form-control">
			<label class="label" for="rsk-message">
				<span class="label-text">{$t('wallet.description')}</span>
				<span class="label-text-alt">{$t('wallet.optional')}</span>
			</label>
			<textarea
				id="rsk-message"
				placeholder={$t('wallet.payment_for_placeholder')}
				class="textarea textarea-bordered w-full"
				rows="3"
				bind:value={message}
				oninput={debounce(() => paymentRequest(), 1000)}
				disabled={!$rskConnection.connected}
			></textarea>
		</div>
	</div>

	<!-- QR Code Display or Testnet Alert -->
	<div class="flex flex-col items-center text-center w-full">
		<h4 class="mb-4 font-semibold w-full text-left sm:text-center">{$t('wallet.receive_rbtc')}</h4>

		{#if $appStore.network !== 'testnet'}
			<!-- Abbreviated testnet warning shown instead of QR on testnet -->
			<div class="alert alert-outline alert-warning w-full max-w-sm">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<div class="text-left">
					<div class="text-warning text-center font-bold">
						{$t('wallet.testnet_warning.title')}
					</div>
					<div class="text-sm">
						<strong>{$t('wallet.testnet_warning.do_not_send_real_assets')}</strong>
					</div>
					<div class="mt-2 text-xs">
						{$t('wallet.testnet_warning.faucet_instruction')}
						<a
							href="https://faucet.rootstock.io/"
							target="_blank"
							rel="noopener noreferrer"
							class="link link-primary font-semibold"
							>{$t('wallet.testnet_warning.faucet_link_text')}</a
						>
						&nbsp;{$t('wallet.testnet_warning.faucet_instruction_end')}
					</div>
				</div>
			</div>
		{:else if !$rskConnection.connected}
			<div class="bg-base-200 flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-lg">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-warning h-8 w-8"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span class="text-warning text-center text-xs">{$t('wallet.rsk_wallet_not_connected')}</span
				>
			</div>
		{:else if isLoading}
			<div class="bg-base-200 flex h-48 w-48 items-center justify-center rounded-lg">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else}
			<div class="rounded-lg bg-white p-2 shadow-lg flex justify-center">
				<div class="w-full max-w-[200px] sm:max-w-[256px]">
					<img src={qrCodeData} alt="Payment QR Code" class="h-full w-full" />
				</div>
			</div>
			{#if $rskConnection.address}
				<div class="mt-4 w-full sm:col-span-2">
					<div class="mb-1 text-xs opacity-70 text-start">{$t('wallet.address')}</div>
					<div class="border-base-300 relative rounded border">
						<button
							class="bg-base-300 hover:bg-base-100 w-full cursor-pointer rounded px-3 py-2 pr-10 text-left transition-colors"
							onclick={copyAddress}
							disabled={!$rskConnection.connected || !$rskConnection.address}
						>
							<code class="overflow-wrap-anywhere text-xs break-all whitespace-normal">
								{$rskConnection.address}
							</code>
						</button>
						<div class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 transform">
							{#if addressCopied}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-success h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 opacity-70"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
							{/if}
						</div>
					</div>
				</div>
			{:else if $rskConnection.connected}
				<div class="mt-4 w-full">
					<div class="text-error text-center text-xs">
						{$t('wallet.no_rsk_address_available')}
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<button class="btn btn-primary w-full sm:col-span-2" onclick={copyAddress} disabled={!address}>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
			/>
		</svg>
		{$t('wallet.copy_payment_link')}
	</button>
</div>
