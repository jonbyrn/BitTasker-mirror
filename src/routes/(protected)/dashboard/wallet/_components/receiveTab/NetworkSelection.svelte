<script lang="ts">
	import { wallet } from '$lib/utils/consts';
	let selectedAddress = $state(wallet.addresses[0]);
	let showQR = $state(false);
	let copiedAddress = $state(false);

	const toggleQR = () => {
		showQR = !showQR;
	};

	function copyToClipboard(text: string): void {
		navigator.clipboard.writeText(text).then(() => {
			copiedAddress = true;
			setTimeout(() => {
				copiedAddress = false;
			}, 2000);
		});
	}
</script>

<div class="tabs tabs-boxed">
	{#each wallet.addresses as address}
		<button
			class="tab {selectedAddress.type === address.type ? 'tab-active' : ''}"
			onclick={() => (selectedAddress = address)}
		>
			{address.type}
		</button>
	{/each}
</div>

<!-- Address Display -->
<div class="card bg-base-200">
	<div class="card-body">
		<h4 class="card-title text-base">{selectedAddress.type} Address</h4>
		<div class="bg-base-300 flex items-center justify-between rounded-lg p-3">
			<div class="font-mono text-sm break-all">
				{selectedAddress.address}
			</div>
			<button class="btn btn-ghost btn-sm" onclick={() => copyToClipboard(selectedAddress.address)}>
				{#if copiedAddress}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
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
			</button>
		</div>

		<!-- QR Code Toggle -->
		<div class="mt-4">
			<button class="btn btn-primary btn-block" onclick={toggleQR}>
				{showQR ? 'Hide QR Code' : 'Show QR Code'}
			</button>
		</div>

		{#if showQR}
			<div class="mt-4 flex justify-center">
				<div class="rounded-lg bg-white p-4">
					<!-- In a real implementation, this would be an actual QR code -->
					<div class="bg-base-100 flex h-60 w-60 items-center justify-center">
						<span class="text-base-content">QR Code Placeholder</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
