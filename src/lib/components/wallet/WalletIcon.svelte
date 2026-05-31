<script lang="ts">
	let {
		walletType = '',
		className = 'h-5 w-5 shrink-0'
	}: {
		walletType: string;
		className?: string;
	} = $props();
</script>

{#if walletType === 'metamask'}
	<img src="/images/wallets/metamask.svg" alt="MetaMask" class={className} aria-hidden="true" />
{:else if walletType === 'walletconnect'}
	<img
		src="/images/wallets/walletconnect.svg"
		alt="WalletConnect"
		class={className}
		aria-hidden="true"
	/>
{:else if walletType === 'trezor'}
	<img src="/images/wallets/trezor.svg" alt="Trezor" class={className} aria-hidden="true" />
{:else if walletType === 'ledger'}
	<img src="/images/wallets/ledger.svg" alt="Ledger" class={className} aria-hidden="true" />
{:else}
	<div
		class="bg-base-300 flex {className} text-base-content/50 items-center justify-center rounded-full text-xs font-medium"
	>
		?
	</div>
{/if}
