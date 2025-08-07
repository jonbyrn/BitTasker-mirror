<!--
	Recipient Address Input Component
	Handles address input with type detection and validation
-->
<script lang="ts">
	// Props
	let {
		recipientAddress = $bindable(''),
		addressType = $bindable('unknown'),
		hasMagicRoutingHints = $bindable(false),
		onAddressChange = (event: Event & { currentTarget: EventTarget & HTMLInputElement }) => {}
	} = $props();

	function getAddressTypeIcon(): string {
		switch (addressType) {
			case 'lightning':
				return hasMagicRoutingHints ? '🌊⚡' : '⚡';
			case 'bolt12':
				return '🔗';
			case 'lnurlPay':
				return '📧';
			case 'bitcoin':
				return '₿';
			case 'liquid':
				return '🌊';
			default:
				return '❓';
		}
	}

	function getAddressTypeLabel(): string {
		switch (addressType) {
			case 'lightning':
				return hasMagicRoutingHints ? 'Lightning (MRH)' : 'Lightning';
			case 'bolt12':
				return 'BOLT12 Offer';
			case 'lnurlPay':
				return 'Lightning Address';
			case 'bitcoin':
				return 'Bitcoin';
			case 'liquid':
				return 'Liquid';
			default:
				return 'Unknown';
		}
	}
</script>

<div class="form-control">
	<div class="label">
		<span class="label-text text-sm sm:text-base">Recipient</span>
		{#if addressType !== 'unknown'}
			<span class="label-text-alt flex items-center gap-1 text-xs sm:text-sm">
				<span class="text-lg">{getAddressTypeIcon()}</span>
				<span class="font-medium">{getAddressTypeLabel()}</span>
			</span>
		{/if}
	</div>
	<div class="flex w-full">
		<input
			type="text"
			placeholder="Address, Lightning invoice, or Lightning address"
			class="input input-bordered w-full text-sm sm:text-base"
			bind:value={recipientAddress}
			oninput={(e) => onAddressChange(e)}
		/>
		<!-- TODO: QR Code Scanning - Disabled for now -->
		<!-- 
		<button 
			class="btn btn-square rounded-l-none border-l-0" 
			aria-label="Scan QR"
			title="Scan QR Code (Coming Soon)"
			disabled
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0118.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		</button>
		-->
	</div>
</div>