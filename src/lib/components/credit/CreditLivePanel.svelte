<script lang="ts">
	import { t } from 'svelte-i18n';
	import { formatCents } from '$lib/credit/money';
	import { assessFullAllocation, type RgbAllocation } from '$lib/rgb';

	let txid = $state('');
	let txMessage = $state('');
	let walletMessage = $state('');
	let coins = $state<RgbAllocation[]>([]);
	let checkingTx = $state(false);
	let checkingWallet = $state(false);

	async function checkTx(): Promise<void> {
		checkingTx = true;
		txMessage = '';
		try {
			const { signetConfirmations } = await import('$lib/rgb/utexo-adapter');
			const count = await signetConfirmations(txid.trim());
			txMessage = count >= 1 ? $t('credit.tx_confirmed') : $t('credit.tx_unconfirmed');
		} catch {
			txMessage = $t('credit.tx_unconfirmed');
		} finally {
			checkingTx = false;
		}
	}

	async function checkWallet(): Promise<void> {
		checkingWallet = true;
		walletMessage = '';
		coins = [];
		try {
			const { getUtexoWallet } = await import('$lib/stores/wallet/wallet-init');
			const wallet = getUtexoWallet();
			if (!wallet) {
				walletMessage = $t('credit.wallet_locked');
				return;
			}
			const { createUtexoCreditAdapter } = await import('$lib/rgb/utexo-adapter');
			const adapter = createUtexoCreditAdapter({
				network: 'signet',
				assetId: 'usdt-rgb',
				wallet
			});
			coins = await adapter.listAllocations('usdt-rgb');
			if (coins.length === 0) walletMessage = $t('credit.wallet_empty');
		} catch (cause) {
			walletMessage = cause instanceof Error ? cause.message : $t('credit.generic_error');
		} finally {
			checkingWallet = false;
		}
	}

	function coinVerdict(coin: RgbAllocation, units: number): string {
		const verdict = assessFullAllocation([coin], coin.id, units);
		return verdict.ok ? $t('credit.coin_exact') : verdict.reason;
	}
</script>

<section class="card bg-base-100 border-base-300 border shadow-sm" data-testid="credit-live">
	<div class="card-body gap-3 p-5">
		<h2 class="text-lg font-semibold">{$t('credit.live_title')}</h2>
		<p class="text-sm">{$t('credit.live_body')}</p>
		<p class="text-sm" data-testid="credit-partial-guard">{$t('credit.partial_guard')}</p>
		<label class="form-control w-full gap-1">
			<span class="label-text">{$t('credit.txid')}</span>
			<input class="input input-bordered w-full" bind:value={txid} data-testid="credit-txid" />
		</label>
		<button
			type="button"
			class="btn btn-outline"
			disabled={checkingTx}
			onclick={checkTx}
			data-testid="credit-check-tx">{$t('credit.check_tx')}</button
		>
		{#if txMessage}
			<p class="text-sm" data-testid="credit-tx-result">{txMessage}</p>
		{/if}
		<button
			type="button"
			class="btn btn-outline"
			disabled={checkingWallet}
			onclick={checkWallet}
			data-testid="credit-check-wallet">{$t('credit.check_wallet')}</button
		>
		{#if walletMessage}
			<p class="text-sm">{walletMessage}</p>
		{/if}
		{#if coins.length > 0}
			<ul class="flex flex-col gap-2 text-sm">
				{#each coins as coin (coin.id)}
					<li>
						{formatCents(Math.floor(coin.units / 10_000))} — {coin.units > 1
							? coinVerdict(coin, coin.units - 1)
							: coinVerdict(coin, coin.units)}
					</li>
				{/each}
			</ul>
		{/if}
		<p class="text-sm">
			<a class="link" href="/credit?creditMock=1">{$t('credit.test_ledger')}</a>
		</p>
	</div>
</section>
