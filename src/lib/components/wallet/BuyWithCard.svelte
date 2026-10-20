<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import {
		createBtcPurchase,
		isMainnetBtcAddress,
		quoteBtcPurchase,
		type FiatOffer
	} from '$lib/services/fiat-onramp';

	const countries = [
		['US', 'United States'],
		['CA', 'Canada'],
		['GB', 'United Kingdom'],
		['NL', 'Netherlands'],
		['DE', 'Germany'],
		['FR', 'France'],
		['ES', 'Spain'],
		['BR', 'Brazil'],
		['AU', 'Australia'],
		['MX', 'Mexico']
	] as const;

	let amount = $state('50');
	let country = $state('US');
	let region = $state('');
	let currencyFrom = $state('USD');
	let offers = $state<FiatOffer[]>([]);
	let errorMessage = $state('');
	let quoting = $state(false);
	let buyingKey = $state('');
	let redirectUrl = $state('');
	let payoutAddress = $state('');

	const canDeliver = $derived(isMainnetBtcAddress(payoutAddress));

	function translate(key: string, fallback: string): string {
		const value = $t(key);
		if (typeof value !== 'string' || !value.trim() || value === key) return fallback;
		return value;
	}

	function browserUserId(): string {
		const key = 'bittasker.fiat-onramp-user';
		try {
			const existing = sessionStorage.getItem(key);
			if (existing) return existing;
			const created = crypto.randomUUID();
			sessionStorage.setItem(key, created);
			return created;
		} catch {
			return crypto.randomUUID();
		}
	}

	async function resolveAddress(): Promise<void> {
		const stored = $walletStore.rgb?.address;
		if (stored) payoutAddress = stored;
		try {
			const wallet = getUtexoWallet() as { getAddress?: () => Promise<string> } | null;
			const live = await wallet?.getAddress?.();
			if (live) payoutAddress = live.trim();
		} catch (error: unknown) {
			console.error('[buy-with-card] address lookup failed', error);
		}
	}

	onMount(() => {
		void resolveAddress();
	});

	async function quote(): Promise<void> {
		errorMessage = '';
		redirectUrl = '';
		offers = [];
		quoting = true;
		try {
			offers = await quoteBtcPurchase({
				amountFrom: amount,
				country,
				currencyFrom,
				state: country === 'US' ? region : undefined
			});
			if (offers.length === 0) {
				errorMessage = translate(
					'wallet.buy_card.no_offers',
					'No card or bank offer is available for that amount.'
				);
			}
		} catch (error: unknown) {
			errorMessage =
				error instanceof Error
					? error.message
					: translate('wallet.buy_card.failed', 'Quote failed.');
		} finally {
			quoting = false;
		}
	}

	async function buy(offer: FiatOffer, method: string): Promise<void> {
		errorMessage = '';
		redirectUrl = '';
		const key = `${offer.providerCode}:${method}`;
		buyingKey = key;
		try {
			const origin = window.location.origin;
			const order = await createBtcPurchase({
				amountFrom: amount,
				country,
				currencyFrom,
				state: country === 'US' ? region : undefined,
				providerCode: offer.providerCode,
				paymentMethod: method,
				walletAddress: payoutAddress,
				externalOrderId: crypto.randomUUID(),
				externalUserId: browserUserId(),
				returnSuccessUrl: `${origin}/wallet?buy=success`,
				returnFailedUrl: `${origin}/wallet?buy=failed`
			});
			redirectUrl = order.redirectUrl;
			window.open(order.redirectUrl, '_blank', 'noopener,noreferrer');
		} catch (error: unknown) {
			errorMessage =
				error instanceof Error
					? error.message
					: translate('wallet.buy_card.failed', 'Purchase failed.');
		} finally {
			buyingKey = '';
		}
	}
</script>

<div class="flex flex-col gap-3" data-testid="buy-with-card-panel">
	<p class="text-sm">
		{translate(
			'wallet.buy_card.lead',
			'Buy bitcoin with a card or bank transfer. The coins are paid to your own Bitcoin address. BitTasker does not take custody and does not see your card or identity documents.'
		)}
	</p>
	<p class="text-base-content/70 text-sm" data-testid="usdt-ramp-note">
		{translate(
			'wallet.buy_card.usdt',
			'USDT in this wallet is RGB. Changelly can pay USDT only on a public network such as Ethereum or Tron, and those coins would not show up here. This purchase sends Bitcoin instead.'
		)}
	</p>

	{#if payoutAddress}
		<p class="font-mono text-xs break-all" data-testid="payout-address">{payoutAddress}</p>
	{/if}
	{#if !canDeliver}
		<p class="text-warning text-sm" data-testid="payout-warning">
			{translate(
				'wallet.buy_card.signet',
				'Changelly pays real mainnet Bitcoin. A signet address or an RGB invoice cannot receive it, so the purchase stays closed until this wallet has a mainnet address.'
			)}
		</p>
	{/if}

	<label class="form-control w-full">
		<span class="label-text text-sm">{translate('wallet.buy_card.amount', 'Amount')}</span>
		<input
			class="input input-bordered w-full"
			type="text"
			inputmode="decimal"
			bind:value={amount}
			data-testid="buy-amount"
		/>
	</label>
	<label class="form-control w-full">
		<span class="label-text text-sm">{translate('wallet.buy_card.currency', 'You pay in')}</span>
		<input
			class="input input-bordered w-full"
			type="text"
			maxlength="10"
			bind:value={currencyFrom}
			data-testid="buy-fiat"
		/>
	</label>
	<label class="form-control w-full">
		<span class="label-text text-sm">{translate('wallet.buy_card.country', 'Country')}</span>
		<select class="select select-bordered w-full" bind:value={country} data-testid="buy-country">
			{#each countries as [code, name] (code)}
				<option value={code}>{name}</option>
			{/each}
		</select>
	</label>
	{#if country === 'US'}
		<label class="form-control w-full">
			<span class="label-text text-sm">{translate('wallet.buy_card.state', 'State')}</span>
			<input
				class="input input-bordered w-full"
				type="text"
				maxlength="2"
				bind:value={region}
				data-testid="buy-state"
				placeholder="CA"
			/>
		</label>
	{/if}

	<button
		class="btn btn-primary min-h-12"
		type="button"
		disabled={quoting}
		onclick={() => void quote()}
		data-testid="buy-quote"
	>
		{quoting
			? translate('wallet.buy_card.quoting', 'Checking offers…')
			: translate('wallet.buy_card.quote', 'See offers')}
	</button>

	{#if errorMessage}
		<p class="text-error text-sm" role="alert" data-testid="buy-error">{errorMessage}</p>
	{/if}

	{#if offers.length > 0}
		<ul class="flex flex-col gap-2" data-testid="buy-offers">
			{#each offers as offer (offer.providerCode)}
				{#each offer.paymentMethodOffer as method (method.method)}
					<li>
						<button
							class="btn btn-outline h-auto min-h-12 w-full justify-between py-2"
							type="button"
							disabled={!canDeliver || buyingKey !== ''}
							onclick={() => void buy(offer, method.method)}
							data-testid="buy-offer"
						>
							<span class="text-left">
								{offer.providerCode} · {method.methodName}
								<span class="block text-xs"
									>{translate('wallet.buy_card.fee', 'Fee')} {method.fee}</span
								>
							</span>
							<span class="font-mono text-sm">{method.amountExpectedTo} BTC</span>
						</button>
					</li>
				{/each}
			{/each}
		</ul>
	{/if}

	{#if redirectUrl}
		<p class="text-sm" data-testid="buy-redirect">
			<a href={redirectUrl} target="_blank" rel="noopener noreferrer">
				{translate('wallet.buy_card.continue', 'Continue to the payment page')}
			</a>
		</p>
	{/if}
</div>
