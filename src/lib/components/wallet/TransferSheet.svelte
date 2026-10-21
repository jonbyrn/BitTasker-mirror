<script lang="ts">
	import { t } from 'svelte-i18n';
	import { formatUsd, transferQuote, type TransferPercent, type TransferSide } from '$lib/stores/wallet/plain-wallet';

	let {
		balanceSats = 0,
		balanceUsd = 0,
		btcUsd = 0,
		onClose = () => {}
	}: {
		balanceSats?: number;
		balanceUsd?: number;
		btcUsd?: number;
		onClose?: () => void;
	} = $props();

	let from = $state<TransferSide>('btc');
	let percent = $state<TransferPercent>(50);
	let reviewed = $state(false);

	const percents: TransferPercent[] = [25, 50, 75, 100];
	const quote = $derived(transferQuote(from, percent, balanceSats, balanceUsd, btcUsd));

	function pick(next: TransferPercent): void {
		percent = next;
		reviewed = false;
	}

	function flip(): void {
		from = from === 'btc' ? 'usd' : 'btc';
		reviewed = false;
	}
</script>

<div class="flex flex-col gap-4" data-testid="transfer-sheet">
	<p class="text-lg font-semibold">{$t('wallet.simple.transfer')}</p>
	<button type="button" class="btn btn-outline min-h-12 w-full" data-testid="transfer-direction" onclick={flip}>
		{from === 'btc' ? $t('wallet.simple.transfer_to_dollars') : $t('wallet.simple.transfer_to_bitcoin')}
	</button>
	<div class="flex gap-2" data-testid="transfer-chips">
		{#each percents as chip (chip)}
			<button
				type="button"
				class="btn min-h-12 flex-1"
				class:btn-primary={percent === chip}
				class:btn-outline={percent !== chip}
				data-testid="transfer-chip-{chip}"
				onclick={() => pick(chip)}
			>
				{chip}%
			</button>
		{/each}
	</div>
	{#if quote}
		<p class="text-center text-2xl font-bold tabular-nums" data-testid="transfer-quote">
			{from === 'btc'
				? `${quote.sats.toLocaleString('en-US')} ${$t('wallet.sats')}`
				: formatUsd(quote.usd)}
		</p>
		<p class="text-base-content/70 text-center text-sm tabular-nums" data-testid="transfer-other">
			{from === 'btc' ? formatUsd(quote.usd) : `${quote.sats.toLocaleString('en-US')} ${$t('wallet.sats')}`}
		</p>
	{/if}
	{#if reviewed}
		<p class="text-center text-sm" data-testid="transfer-held">{$t('wallet.simple.transfer_held')}</p>
	{/if}
	<button
		type="button"
		class="btn btn-primary min-h-12 w-full"
		data-testid="transfer-review"
		disabled={quote === null}
		onclick={() => (reviewed = true)}
	>
		{$t('wallet.simple.transfer_review')}
	</button>
	<button type="button" class="btn btn-ghost min-h-12 w-full" data-testid="transfer-close" onclick={onClose}>
		{$t('common.close')}
	</button>
</div>
