<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { authState } from '$lib/stores/auth.store';
	import {
		goodsBoard,
		publishListing,
		publishOrder,
		refreshGoodsBoard
	} from '$lib/market/board.svelte';
	import { categoryLabel, conditionLabel, fulfillmentLabel } from '$lib/market/categories';
	import { marketCopy, marketErrorFrom } from '$lib/market/copy';
	import {
		contractForOrder,
		disputeGoodsContract,
		fundGoodsContract,
		releaseGoodsContract
	} from '$lib/market/escrow';
	import { handoverWindowPassed, nowSeconds, priceLabel } from '$lib/market/money';
	import { loadBtcUsd } from '$lib/market/price';
	import {
		buildFundedOrder,
		canBuy,
		canConfirm,
		canDispute,
		disputeOrder,
		markHandedOver,
		markSold,
		ordersForListing,
		rateOrder,
		removeListing
	} from '$lib/market/rules';
	import type { PayAsset } from '$lib/market/types';
	import { isMarketEnabled } from '$lib/services/feature-flags';
	import { pubkeyHex, samePerson } from '$lib/staffing/ids';
	import { getNpub } from '$lib/utils/nostrKeys';

	const enabled = isMarketEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(marketCopy(language));
	const listingId = $derived(page.params.id ?? '');
	const listing = $derived(goodsBoard.listings.find((item) => item.id === listingId));
	const orders = $derived(listing ? ordersForListing(goodsBoard.orders, listing.id) : []);
	const deal = $derived([...orders].sort((left, right) => right.createdAt - left.createdAt)[0]);

	let me = $state('');
	let btcUsd = $state(0);
	let asset = $state<PayAsset>('usdt');
	let invoice = $state('');
	let disputeNote = $state('');
	let stars = $state('5');
	let ratingNote = $state('');
	let error = $state('');
	let notice = $state('');
	let sending = $state(false);

	const seller = $derived(Boolean(listing && samePerson(listing.sellerPubkey, me)));
	const buyer = $derived(Boolean(deal && samePerson(deal.buyerPubkey, me)));
	const openToBuy = $derived(Boolean(listing && canBuy(listing, orders, me)));
	const windowPassed = $derived(Boolean(deal && handoverWindowPassed(deal.fundedAt, nowSeconds())));

	onMount(() => {
		if (!enabled) return;
		getNpub()
			.then((value) => {
				me = pubkeyHex(value);
			})
			.catch(() => {
				me = '';
			});
		refreshGoodsBoard();
		loadBtcUsd().then((price) => {
			btcUsd = price;
		});
	});

	function fail(cause: unknown) {
		error = marketErrorFrom(language, cause);
	}

	async function run(action: () => Promise<void>) {
		error = '';
		notice = '';
		sending = true;
		try {
			await action();
		} catch (cause) {
			fail(cause);
		} finally {
			sending = false;
		}
	}

	function fund() {
		if (!listing) return;
		run(async () => {
			if (!$authState.isAuthenticated || !me) throw new Error('login');
			const order = buildFundedOrder({
				listing,
				orders,
				buyerPubkey: me,
				asset,
				btcUsd,
				now: nowSeconds()
			});
			const rune = contractForOrder(order, listing.title);
			await fundGoodsContract(rune);
			await publishOrder(order);
			notice = copy.fund;
		});
	}

	function handover() {
		if (!listing || !deal) return;
		run(async () => {
			const next = markHandedOver(deal, me, invoice, nowSeconds());
			await publishOrder(next);
		});
	}

	function confirmReceipt() {
		if (!listing || !deal) return;
		run(async () => {
			if (!canConfirm(deal, me)) throw new Error('closed');
			const rune = contractForOrder(deal, listing.title);
			await releaseGoodsContract(
				rune,
				deal.payoutInvoice,
				deal.asset,
				deal.priceUsd,
				deal.amountSats
			);
			await publishOrder({ ...deal, status: 'released', contractStatus: 'released' });
			await publishListing({ ...listing, status: 'sold' });
			notice = copy.released;
		});
	}

	function openDispute() {
		if (!listing || !deal) return;
		run(async () => {
			const next = disputeOrder(deal, me, disputeNote, nowSeconds());
			const rune = contractForOrder(deal, listing.title);
			await disputeGoodsContract(rune, next.disputeNote);
			await publishOrder(next);
			notice = copy.disputed;
		});
	}

	function sold() {
		if (!listing) return;
		run(async () => {
			await publishListing(markSold(listing, orders, me));
		});
	}

	function remove() {
		if (!listing) return;
		run(async () => {
			await publishListing(removeListing(listing, orders, me));
		});
	}

	function rate() {
		if (!deal) return;
		run(async () => {
			await publishOrder(rateOrder(deal, me, Number(stars), ratingNote));
		});
	}
</script>

<svelte:head>
	<title>{listing?.title || copy.title} · BitTasker</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8" data-testid="goods-detail">
	<a class="link mb-4 inline-block text-sm" href={resolve('/(app)/browse/goods')}>{copy.back}</a>
	{#if !enabled}
		<p data-testid="goods-off">{copy.off}</p>
	{:else if !goodsBoard.loaded}
		<p>{copy.loading}</p>
	{:else if !listing || listing.status === 'deleted'}
		<p>{copy.unavailable}</p>
	{:else}
		{#if listing.photos.length > 0}
			<div class="grid gap-2 sm:grid-cols-2">
				{#each listing.photos as photo (photo)}
					<img src={photo} alt="" class="h-48 w-full rounded-xl object-cover" />
				{/each}
			</div>
		{/if}
		<h1 class="mt-4 text-2xl font-semibold">{listing.title}</h1>
		<p class="mt-1 text-lg">{priceLabel(listing.priceUsd, btcUsd)}</p>
		<p class="text-base-content/70 mt-1 text-sm">
			{categoryLabel(listing.category, language)} · {conditionLabel(listing.condition, language)} ·
			{fulfillmentLabel(listing.fulfillment, language)} · {listing.location}
		</p>
		<p class="mt-4 whitespace-pre-wrap">{listing.description}</p>
		<p class="text-base-content/70 mt-4 text-sm">{copy.noKyc}</p>

		{#if error}
			<p class="text-error mt-4 text-sm" data-testid="goods-error">{error}</p>
		{/if}
		{#if notice}
			<p class="mt-4 text-sm" data-testid="goods-notice">{notice}</p>
		{/if}
		{#if deal && windowPassed && deal.status !== 'released'}
			<p class="mt-4 text-sm">{copy.timeout}</p>
		{/if}

		<div class="mt-6 flex flex-col gap-3">
			{#if !seller}
				<a
					class="btn btn-outline btn-sm self-start"
					href={resolve('/(app)/(protected)/messages/to/[pubkey]', {
						pubkey: listing.sellerPubkey
					})}
					data-testid="message-seller"
				>
					{copy.message}
				</a>
			{:else}
				<p class="text-sm">{copy.yourListing}</p>
				<div class="flex flex-wrap gap-2">
					<a
						class="btn btn-outline btn-sm"
						href={resolve('/(app)/browse/goods/[id]/edit', { id: listing.id })}
					>
						{copy.edit}
					</a>
					<button class="btn btn-outline btn-sm" type="button" disabled={sending} onclick={sold}
						>{copy.sold}</button
					>
					<button
						class="btn btn-ghost btn-sm"
						type="button"
						disabled={sending}
						onclick={remove}
						data-testid="delete-goods"
					>
						{copy.remove}
					</button>
				</div>
			{/if}

			{#if openToBuy}
				<label class="flex flex-col gap-1 text-sm">
					{copy.buy}
					<select class="select select-bordered" bind:value={asset}>
						<option value="usdt">{copy.payUsdt}</option>
						<option value="btc" disabled={btcUsd <= 0}>{copy.payBtc}</option>
					</select>
				</label>
				{#if asset === 'btc' && btcUsd <= 0}
					<p class="text-sm">{copy.noPrice}</p>
				{/if}
				<button
					class="btn btn-primary self-start"
					type="button"
					disabled={sending}
					onclick={fund}
					data-testid="fund-goods"
				>
					{copy.fund}
				</button>
				{#if !$authState.isAuthenticated}
					<a class="link text-sm" href={resolve('/(app)/auth/login')}>{copy.loginLink}</a>
				{/if}
			{/if}

			{#if deal && (seller || buyer)}
				<p class="text-sm" data-testid="goods-order">{deal.status}</p>
				{#if seller && deal.status === 'funded'}
					<label class="flex flex-col gap-1 text-sm">
						{copy.invoice}
						<input class="input input-bordered" bind:value={invoice} />
					</label>
					<button
						class="btn btn-primary self-start"
						type="button"
						disabled={sending}
						onclick={handover}
						data-testid="handover-goods"
					>
						{copy.handover}
					</button>
				{/if}
				{#if buyer && canConfirm(deal, me)}
					<button
						class="btn btn-primary self-start"
						type="button"
						disabled={sending}
						onclick={confirmReceipt}
						data-testid="receive-goods"
					>
						{copy.received}
					</button>
				{/if}
				{#if canDispute(deal, me, nowSeconds())}
					<label class="flex flex-col gap-1 text-sm">
						{copy.disputeNote}
						<textarea class="textarea textarea-bordered" rows="3" bind:value={disputeNote}
						></textarea>
					</label>
					<button
						class="btn btn-outline self-start"
						type="button"
						disabled={sending}
						onclick={openDispute}
						data-testid="dispute-goods"
					>
						{copy.dispute}
					</button>
				{/if}
				{#if deal.status === 'released' || deal.status === 'handed_over'}
					<label class="flex flex-col gap-1 text-sm">
						{buyer ? copy.rateSeller : copy.rateBuyer}
						<select class="select select-bordered" bind:value={stars}>
							{#each ['1', '2', '3', '4', '5'] as value (value)}
								<option {value}>{value}</option>
							{/each}
						</select>
					</label>
					<input class="input input-bordered" bind:value={ratingNote} />
					<button
						class="btn btn-outline self-start"
						type="button"
						disabled={sending}
						onclick={rate}
					>
						{buyer ? copy.rateSeller : copy.rateBuyer}
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>
