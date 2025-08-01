<script lang="ts">
	import { goto } from '$app/navigation';
	import { setupMnemonicPasskey } from '$lib/wallet/mnemonicBiometrics';
	import { browser } from '$app/environment';
	import { Buffer } from 'buffer';
	import * as bip39 from 'bip39';

	// Polyfill Buffer for browser environment
	if (browser && typeof window !== 'undefined') {
		(globalThis as any).Buffer = Buffer;
	}

	let mnemonic = $state('');
	let isGenerating = $state(false);
	let error = $state('');
	let isCopied = $state(false);

	function generateNewMnemonic() {
		try {
			isGenerating = true;
			error = '';

			// Only run in browser environment to avoid Buffer issues
			if (browser) {
				mnemonic = bip39.generateMnemonic();
				if (mnemonic) {
					setupMnemonicPasskey(mnemonic);
				}
			} else {
				throw new Error('Wallet generation is only available in browser environment');
			}
		} catch (err) {
			console.error('Error generating mnemonic', err);
			error = err instanceof Error ? err.message : 'Failed to generate mnemonic';
		} finally {
			isGenerating = false;
		}
	}
</script>

<div class="p-8 pb-0">
	<h2 class="mb-6 text-center text-2xl font-bold">Create New Wallet</h2>

	{#if error}
		<div class="alert alert-error mb-6 shadow-md">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="red"
				viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>
			<span class="font-medium">{error}</span>
		</div>
	{/if}

	{#if mnemonic}
		<div class="alert alert-error mb-6 shadow-md">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="red"
				viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>
			<span class="font-medium"
				>Keep your seed phrase safe! Anyone with your seed phrase can access your wallet and
				withdraw your funds.</span
			>
		</div>

		<p class="mb-2 text-sm font-medium">
			Copy the seed phrase to your clipboard by clicking on the text.
		</p>
		<button
			class="seed-phrase-text mb-4 w-full cursor-pointer rounded-lg border-2 border-dashed p-4 text-left font-mono text-sm transition-all duration-300 select-text {isCopied
				? 'border-green-500 bg-green-50 text-green-500'
				: 'bg-base-200 hover:bg-base-300 border-yellow-500'}"
			data-seed-phrase={mnemonic}
			onclick={async () => {
				try {
					await navigator.clipboard.writeText(mnemonic.trim());
					isCopied = true;

					// Reset the copied state after 2 seconds
					setTimeout(() => {
						isCopied = false;
					}, 2000);
				} catch (err) {
					console.error('Failed to copy to clipboard:', err);
					// Fallback for older browsers or when clipboard API fails
					const textArea = document.createElement('textarea');
					textArea.value = mnemonic;
					document.body.appendChild(textArea);
					textArea.select();
					document.execCommand('copy');
					document.body.removeChild(textArea);

					isCopied = true;
					setTimeout(() => {
						isCopied = false;
					}, 2000);
				}
			}}
		>
			<div class="flex items-center justify-between">
				<span class="flex-1">{mnemonic}</span>
				{#if isCopied}
					<div class="ml-2 flex items-center text-green-600">
						<svg
							class="mr-1 h-5 w-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							></path>
						</svg>
						<span class="text-sm font-medium">Copied!</span>
					</div>
				{:else}
					<div class="ml-2 flex items-center text-gray-500">
						<svg
							class="mr-1 h-5 w-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							></path>
						</svg>
						<span class="text-sm">Click to copy</span>
					</div>
				{/if}
			</div>
		</button>
	{/if}

	{#if !mnemonic && !isGenerating}
		<p class="mb-2 text-sm font-medium">Click the button below to generate a new seed phrase.</p>
		<button
			class="btn btn-primary mt-2 w-full"
			onclick={generateNewMnemonic}
			disabled={isGenerating}
			aria-disabled={isGenerating}
		>
			Generate Seed Phrase
		</button>
	{:else if !mnemonic && isGenerating}
		<p class="text-sm font-medium">Generating...</p>
	{:else if mnemonic && !isGenerating}
		<button class="btn btn-primary mt-2 w-full" onclick={() => goto('/dashboard/wallet')}>
			Continue to Wallet
		</button>
	{/if}
</div>
