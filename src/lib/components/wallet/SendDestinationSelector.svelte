<!--
  SendDestinationSelector — Grouped destination picker for the send payment form.
  Mirrors ReceiveSwapSelector pattern with BTC / USD tabs, no "Other" tab.
-->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	interface Destination {
		id: string;
		asset: string;
		label: string;
		icon: string;
		group: 'btc' | 'usdt';
		recommended?: boolean;
	}

	const DESTINATIONS: Destination[] = [
		// BTC group
		{
			id: 'rootstock-bitcoin',
			asset: 'rBTC',
			label: 'Rootstock Bitcoin',
			icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
			group: 'btc',
			recommended: true
		},
		{
			id: 'lightning-bitcoin',
			asset: 'BTC',
			label: 'Lightning',
			icon: '/images/chains/lightning.svg',
			group: 'btc'
		},
		{
			id: 'bitcoin',
			asset: 'BTC',
			label: 'Bitcoin',
			icon: '/images/chains/Bitcoin.svg',
			group: 'btc'
		},
		// USDT group (Arbitrum first, rest alphabetical)
		{
			id: 'usdt-arbitrum',
			asset: 'USDT',
			label: 'Arbitrum',
			icon: '/images/chains/arbitrum.png',
			group: 'usdt',
			recommended: true
		},
		{
			id: 'usdt-bsc',
			asset: 'USDT',
			label: 'Binance',
			icon: '/images/chains/Binance-logo.svg',
			group: 'usdt'
		},
		{
			id: 'usdt-ethereum',
			asset: 'USDT',
			label: 'Ethereum',
			icon: '/images/chains/ethereum.png',
			group: 'usdt'
		},
		{
			id: 'usdt-polygon',
			asset: 'USDT',
			label: 'Polygon',
			icon: '/images/chains/polygon.png',
			group: 'usdt'
		}
	];

	let {
		selectedId = '',
		onChange = (_id: string) => {},
		locked = false,
		lockedLabel = ''
	}: {
		selectedId?: string;
		onChange?: (id: string) => void;
		locked?: boolean;
		lockedLabel?: string;
	} = $props();

	let expanded = $state(false);
	let activeGroup = $state<'btc' | 'usdt'>('btc');

	let selectedDest = $derived(DESTINATIONS.find((d) => d.id === selectedId));

	let filteredDestinations = $derived(DESTINATIONS.filter((d) => d.group === activeGroup));

	function selectGroup(group: 'btc' | 'usdt') {
		activeGroup = group;
	}

	function selectDestination(id: string) {
		expanded = false;
		// Sync group tab to match the selected destination
		const dest = DESTINATIONS.find((d) => d.id === id);
		if (dest) {
			activeGroup = dest.group;
		}
		onChange(id);
	}
</script>

<div class="form-control">
	<div
		class="border-primary bg-base-100 overflow-hidden rounded-lg border-2"
		class:opacity-70={locked}
	>
		<button
			type="button"
			class="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 pr-10 text-sm font-medium transition-colors sm:pr-12 {locked
				? 'cursor-not-allowed'
				: 'hover:bg-base-200 cursor-pointer'}"
			onclick={() => {
				if (!locked) expanded = !expanded;
			}}
			disabled={locked}
			aria-expanded={expanded}
		>
			<span class="text-base-content/60">{$t('wallet.to')}:</span>
			{#if locked && lockedLabel}
				<span class="text-base-content/40 text-xs">{lockedLabel}</span>
			{:else if selectedDest}
				<img src={selectedDest.icon} alt={selectedDest.label} class="h-5 w-5" />
				<span>{selectedDest.asset} ({selectedDest.label})</span>
			{:else}
				<span class="text-base-content/40 text-xs">{$t('wallet.send.select_destination')}</span>
			{/if}
			{#if !locked}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/40 ml-auto h-4 w-4 shrink-0 transition-transform duration-200 {expanded
						? 'rotate-180'
						: ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			{/if}
		</button>

		{#if expanded && !locked}
			<div
				transition:slide={{ duration: 250, easing: quintOut }}
				class="border-base-300 border-t px-2 py-1"
			>
				<div class="space-y-2">
					<!-- Group tabs -->
					<div class="flex gap-1" role="tablist" aria-label="Destination groups">
						<button
							type="button"
							role="tab"
							aria-selected={activeGroup === 'btc'}
							class="btn btn-sm min-h-[44px] flex-1 text-sm {activeGroup === 'btc'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => selectGroup('btc')}>₿ BTC</button
						>
						<button
							type="button"
							role="tab"
							aria-selected={activeGroup === 'usdt'}
							class="btn btn-sm min-h-[44px] flex-1 text-sm {activeGroup === 'usdt'
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => selectGroup('usdt')}>$ USD</button
						>
					</div>

					<!-- Destination list -->
					<div class="max-h-48 space-y-1 overflow-y-auto">
						{#each filteredDestinations as dest (dest.id)}
							<button
								type="button"
								class="hover:border-primary flex min-h-[44px] w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 text-left text-xs transition-colors {selectedId ===
								dest.id
									? 'bg-primary/10'
									: ''}"
								onclick={() => selectDestination(dest.id)}
							>
								<img src={dest.icon} alt={dest.label} class="h-5 w-5 shrink-0" />
								<div class="min-w-0 flex-1">
									<span class="font-medium">{dest.asset}</span>
									<span class="text-base-content/70"> ({dest.label})</span>
								</div>
								{#if dest.recommended}
									<span class="badge badge-primary badge-xs shrink-0 text-[10px]"
										>{$t('wallet.recommended')}</span
									>
								{/if}
								{#if selectedId === dest.id}
									<span class="text-primary ml-auto shrink-0 text-xs">●</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
