<script lang="ts">
	import { walletStore } from '$lib/stores/wallet.store';
	import { onMount } from 'svelte';

	const { amount, description, onInvoiceGenerated } = $props<{
		amount: number;
		description: string;
		onInvoiceGenerated: (invoice: string) => void;
	}>();

	let invoice = $state('');
	let isGenerating = $state(false);
	let error = $state('');
	let qrCode = $state('');

	async function generateInvoice() {
		isGenerating = true;
		error = '';

		try {
			const walletState = $walletStore;
			if (!walletState.isInitialized) {
				throw new Error('Wallet is not initialized');
			}

			// Use the generateLightningInvoice method from the wallet store
			const lightningInvoice = await walletStore.generateLightningInvoice(amount, description);
			invoice = lightningInvoice.paymentRequest;
			onInvoiceGenerated(invoice);
			// Here you would typically generate a QR code from the invoice
			// For now, we'll just use the invoice as the QR code text
			qrCode = invoice;
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Failed to generate invoice';
		} finally {
			isGenerating = false;
		}
	}

	onMount(() => {
		if (amount > 0) {
			generateInvoice();
		}
	});
</script>

<div class="p-4">
	<h2 class="mb-4 text-xl font-bold">Lightning Invoice</h2>

	{#if isGenerating}
		<div class="flex items-center justify-center p-4">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
			<span class="ml-2">Generating invoice...</span>
		</div>
	{:else if invoice}
		<div class="rounded border p-4">
			<div class="mb-2">
				<span class="font-medium">Amount:</span> {amount} sats
			</div>
			<div class="mb-2">
				<span class="font-medium">Description:</span> {description}
			</div>
			<div class="mb-4">
				<span class="font-medium">Invoice:</span>
				<div class="mt-1 break-all rounded bg-gray-100 p-2 font-mono text-sm">
					{invoice}
				</div>
			</div>
			{#if qrCode}
				<div class="flex justify-center">
					<!-- Here you would typically render a QR code component -->
					<div class="rounded border p-2">
						<span class="text-sm text-gray-500">QR Code would be displayed here</span>
					</div>
				</div>
			{/if}
		</div>
	{:else if error}
		<div class="rounded bg-red-100 p-4 text-red-700">
			{error}
		</div>
	{:else}
		<div class="text-center text-gray-500">
			No invoice generated yet. Set an amount to generate an invoice.
		</div>
	{/if}
</div>
