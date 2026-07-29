<script lang="ts">
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { slide } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconCheck from '~icons/mdi/check';
	import IconChevronDown from '~icons/mdi/chevron-down';

	interface Props {
		address: string;
		explorerUrl?: string | null;
		label?: string;
	}

	const props: Props = $props();

	let addressExpanded = $state(false);
	let addressCopied = $state(false);

	// Format address (truncate for display)
	function formatAddress(address: string): string {
		if (address.length <= 30) return address;
		return `${address.slice(0, 30)}...${address.slice(-8)}`;
	}

	// Copy address
	async function copyAddress() {
		if (props.address) {
			await copyToClipboard(props.address);
			appStore.showSuccessToast($t('wallet.address_copied'));
			addressCopied = true;
			triggerHaptic(ImpactStyle.Light);
			setTimeout(() => {
				addressCopied = false;
			}, 2000);
		}
	}
</script>

<div class="space-y-1">
	{#if props.label}
		<div class="text-sm font-medium opacity-70">{props.label}</div>
	{/if}
	<div class="border-primary bg-base-100 rounded-lg border-2">
		<!-- One-line address display -->
		<div class="flex items-center gap-2 p-2">
			<!-- Copy icon on the left -->
			<button
				class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
				style="-webkit-tap-highlight-color: transparent;"
				onclick={copyAddress}
				aria-label={$t('wallet.copy_address')}
			>
				{#if addressCopied}
					<IconCheck class="text-success h-5 w-5" />
				{:else}
					<IconContentCopy class="h-5 w-5" />
				{/if}
			</button>

			<!-- Compressed address in the middle -->
			{#if props.explorerUrl}
				<a
					href={props.explorerUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="min-w-0 flex-1 text-left hover:underline"
				>
					<code class="block truncate font-mono text-xs">
						{addressExpanded ? props.address : formatAddress(props.address)}
					</code>
				</a>
			{:else}
				<button
					class="min-w-0 flex-1 touch-manipulation text-left transition-transform duration-100 select-none active:scale-95"
					style="-webkit-tap-highlight-color: transparent;"
					onclick={copyAddress}
					aria-label={$t('wallet.copy_address')}
				>
					<code class="block truncate font-mono text-xs">
						{addressExpanded ? props.address : formatAddress(props.address)}
					</code>
				</button>
			{/if}

			<!-- Dropdown button on the right -->
			<button
				class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-200 select-none active:scale-95"
				style="-webkit-tap-highlight-color: transparent;"
				onclick={() => (addressExpanded = !addressExpanded)}
				aria-label={addressExpanded
					? $t('wallet.address_accordion.collapse')
					: $t('wallet.address_accordion.expand')}
			>
				<div class="transition-transform duration-200" class:rotate-180={addressExpanded}>
					<IconChevronDown class="h-5 w-5" />
				</div>
			</button>
		</div>

		<!-- Expanded full address (shown when expanded) -->
		{#if addressExpanded}
			<div
				class="border-primary/20 border-t px-2 py-2"
				in:slide={{ duration: 200, easing: linear }}
				out:slide={{ duration: 200, easing: linear }}
			>
				{#if props.explorerUrl}
					<a
						href={props.explorerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline"
					>
						<code class="block font-mono text-xs break-all whitespace-normal">
							{props.address}
						</code>
					</a>
				{:else}
					<code class="block font-mono text-xs break-all whitespace-normal">
						{props.address}
					</code>
				{/if}
			</div>
		{/if}
	</div>
</div>
