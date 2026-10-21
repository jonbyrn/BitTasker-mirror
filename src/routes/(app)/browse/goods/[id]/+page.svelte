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
		refreshGoodsBoard,
		stallForSeller
	} from '$lib/market/board.svelte';
	import { sendCustomerOrder, sendMerchantStatus } from '$lib/market/checkout';
	import { categoryLabel, conditionLabel, fulfillmentLabel } from '$lib/market/categories';
	import {
		hashCollectionCode,
		newCollectionCode,
		readCollectionCode,
		saveCollectionCode
	} from '$lib/market/collect';
	import { marketCopy, marketErrorFrom } from '$lib/market/copy';
	import {
		contractForOrder,
		disputeGoodsContract,
		fundGoodsContract,
		releaseGoodsContract
	} from '$lib/market/escrow';
	import {
		askingLabel,
		handoverWindowPassed,
		nowSeconds,
		priceLabel,
		usdToSats
	} from '$lib/market/money';
	import { zonesFor } from '$lib/market/nip15';
	import { loadBtcUsd } from '$lib/market/price';
	import {
		acceptCollection,
		buildFundedOrder,
		canBuy,
		quotePurchase,
		canConfirm,
		canDispute,
		disputeOrder,
		markHandedOver,
		markSharePaid,
		markSold,
		ordersForListing,
		rateOrder,
		removeListing,
		shareUnits,
		stockLeft,
		uncollectedShares
	} from '$lib/market/rules';
	import type { PayAsset } from '$lib/market/types';
	import WebQrCodeScanner from '$lib/components/WebQrCodeScanner.svelte';
	import {
		coversWalletPayment,
		heldForLabel,
		readWalletBalances,
		refundEscrow
	} from '$lib/escrow/wallet-escrow';
	import PartialSendWarning from '$lib/components/wallet/PartialSendWarning.svelte';
	import { partialUsdtPolicy, stuckChangeRefusal } from '$lib/stores/wallet/prepare-rgb-send';
	import { isMarketEnabled } from '$lib/services/feature-flags';
	import { pubkeyHex, samePerson } from '$lib/staffing/ids';
	import { state as walletState } from '$lib/stores/wallet/wallet-state';
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
	let acceptPartial = false;
	let partialRetry = $state<(() => void) | null>(null);
	let sending = $state(false);
	let short = $state(false);
	let code = $state('');
	let qrUrl = $state('');
	let scanning = $state(false);
	let shareInvoice = $state('');
	let variantId = $state('');
	let quantity = $state('1');
	let shippingId = $state('');
	let address = $state('');

	const seller = $derived(Boolean(listing && samePerson(listing.sellerPubkey, me)));
	const buyer = $derived(Boolean(deal && samePerson(deal.buyerPubkey, me)));
	const openToBuy = $derived(Boolean(listing && canBuy(listing, orders, me)));
	const windowPassed = $derived(Boolean(deal && handoverWindowPassed(deal.fundedAt, nowSeconds())));
	const buyerCode = $derived(deal ? readCollectionCode(deal.id) : '');
	const holdText = $derived(
		deal && deal.status === 'funded'
			? heldForLabel(listing?.title || '', deal.collectBy, language)
			: ''
	);
	const collectOpen = $derived(
		Boolean(
			deal &&
				deal.reserve === 'collect' &&
				deal.status === 'funded' &&
				deal.collectedAt === 0 &&
				nowSeconds() <= deal.collectBy
		)
	);
	const stall = $derived(listing ? stallForSeller(listing.sellerPubkey) : undefined);
	const zones = $derived(listing ? zonesFor(listing, stall) : []);
	const chosenZone = $derived(zones.find((zone) => zone.id === shippingId) ?? zones[0]);
	const preview = $derived.by(() => {
		if (!listing) return null;
		try {
			return quotePurchase({
				listing,
				orders,
				zones,
				variantId: variantId || listing.variants[0]?.id || '',
				quantity: Number(quantity) || 1,
				shippingId: shippingId || zones[0]?.id || ''
			});
		} catch {
			return null;
		}
	});
	const needsAddress = $derived(
		Boolean(chosenZone && chosenZone.service !== 'pickup' && chosenZone.service !== 'digital')
	);
	const stock = $derived(listing ? stockLeft(listing, orders) : null);
	const collectLate = $derived(
		Boolean(
			deal &&
				deal.reserve === 'collect' &&
				deal.status === 'funded' &&
				deal.collectedAt === 0 &&
				deal.collectBy > 0 &&
				nowSeconds() > deal.collectBy
		)
	);

	onMount(() => {
		if (!enabled) return;
		getNpub()
			.then((value) => {
				me = pubkeyHex(value);
			})
			.catch(() => {
				me = '';
			});
		loadBtcUsd().then((price) => {
			btcUsd = price;
		});
		refreshGoodsBoard().then(() => {
			const order = goodsBoard.orders.find((item) => item.listingId === listingId);
			if (order) showQr(readCollectionCode(order.id));
		});
	});

	async function showQr(saved: string) {
		if (!saved) {
			qrUrl = '';
			return;
		}
		try {
			const module = await import('$lib/utils/helpers/generateQrCodeUrl');
			qrUrl = await module.default(saved);
		} catch {
			qrUrl = '';
		}
	}

	function fail(cause: unknown) {
		error = marketErrorFrom(language, cause);
	}

	async function run(action: () => Promise<void>) {
		error = '';
		partialRetry = null;
		notice = '';
		sending = true;
		try {
			await action();
			acceptPartial = false;
		} catch (cause) {
			if (partialUsdtPolicy() === 'warn' && stuckChangeRefusal(cause) && !acceptPartial) {
				partialRetry = () => {
					acceptPartial = true;
					void run(action);
				};
				return;
			}
			acceptPartial = false;
			fail(cause);
		} finally {
			sending = false;
		}
	}

	function fund() {
		if (!listing) return;
		run(async () => {
			if (!$authState.isAuthenticated || !me) throw new Error('login');
			if (!walletState.utexoWallet) throw new Error('wallet-closed');
			const quoted = quotePurchase({
				listing,
				orders,
				zones,
				variantId: variantId || listing.variants[0]?.id || '',
				quantity: Number(quantity) || 1,
				shippingId: shippingId || zones[0]?.id || ''
			});
			const amountSats =
				asset === 'btc'
					? quoted.priceSats > 0 && quoted.unitUsd <= 0
						? quoted.priceSats * quoted.quantity + usdToSats(quoted.shippingUsd, btcUsd)
						: usdToSats(quoted.holdUsd, btcUsd)
					: 0;
			const balances = readWalletBalances();
			if (!coversWalletPayment({ asset, amountUsd: quoted.holdUsd, amountSats, ...balances })) {
				short = true;
				return;
			}
			short = false;
			const plainCode = quoted.collect ? newCollectionCode() : '';
			const codeHash = plainCode ? await hashCollectionCode(plainCode) : '';
			const order = buildFundedOrder({
				listing,
				orders,
				buyerPubkey: me,
				asset,
				btcUsd,
				now: nowSeconds(),
				codeHash,
				zones,
				variantId: quoted.variantId,
				quantity: quoted.quantity,
				shippingId: quoted.shippingId
			});
			const rune = contractForOrder(order, listing.title);
			await fundGoodsContract(rune, {
				title: listing.title,
				collectBy: order.collectBy,
				language
			});
			await publishOrder(order);
			const zoneName = zones.find((zone) => zone.id === order.shippingId)?.name || order.shippingId;
			const orderLine =
				language === 'es'
					? `Pedido de ${listing.title}. ${order.quantity} artículo. Envío: ${zoneName}. El dinero está en la garantía de BitTasker.`
					: `Order for ${listing.title}. ${order.quantity} item. Shipping: ${zoneName}. The money is in BitTasker escrow.`;
			await sendCustomerOrder(
				listing.sellerPubkey,
				{
					productId: order.variantId ? `${listing.id}--${order.variantId}` : listing.id,
					quantity: order.quantity,
					shippingId: order.shippingId,
					address: needsAddress ? address : '',
					message: orderLine
				},
				order.id,
				me
			);
			if (plainCode) {
				saveCollectionCode(order.id, plainCode);
				await showQr(plainCode);
			}
			notice = copy.payWallet;
		});
	}

	function handover() {
		if (!listing || !deal) return;
		run(async () => {
			const next = markHandedOver(deal, me, invoice, nowSeconds());
			await publishOrder(next);
			await sendMerchantStatus(
				deal.buyerPubkey,
				deal.id,
				language === 'es'
					? 'Entregado. El pago sigue en la garantía hasta que el comprador confirme.'
					: 'Handed over. Payment stays in escrow until the buyer confirms.',
				true
			);
		});
	}

	function collect() {
		if (!listing || !deal) return;
		run(async () => {
			const hash = await hashCollectionCode(code);
			const accepted = acceptCollection(deal, me, hash, nowSeconds());
			const rune = contractForOrder(accepted, listing.title);
			await releaseGoodsContract(
				rune,
				invoice,
				accepted.asset,
				accepted.holdUsd,
				accepted.amountSats,
				acceptPartial
			);
			await publishOrder({ ...accepted, status: 'released', contractStatus: 'released' });
			await publishListing({ ...listing, status: 'sold' });
			await sendMerchantStatus(
				deal.buyerPubkey,
				deal.id,
				language === 'es' ? 'Recogido. Pago liberado.' : 'Collected. Payment released.',
				true
			);
			notice = copy.collected;
		});
	}

	function settleShare(who: 'seller' | 'buyer') {
		if (!listing || !deal) return;
		run(async () => {
			const shares = uncollectedShares(deal, nowSeconds());
			const usd = who === 'seller' ? shares.sellerUsd : shares.buyerUsd;
			if (!(usd > 0)) throw new Error('closed');
			const units = shareUnits(deal, usd);
			const rune = contractForOrder(deal, listing.title);
			if (rune.status === 'released' || rune.status === 'released_pending') {
				await refundEscrow(rune, shareInvoice, units, acceptPartial);
			} else {
				await releaseGoodsContract(
					rune,
					shareInvoice,
					deal.asset,
					usd,
					deal.asset === 'btc' ? units : 0,
					acceptPartial
				);
			}
			await publishOrder(markSharePaid(deal, who));
			notice = who === 'buyer' && deal.noShowPercent === 0 ? copy.refunded : copy.released;
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
				deal.holdUsd > 0 ? deal.holdUsd : deal.priceUsd,
				deal.amountSats,
				acceptPartial
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
		<p class="mt-1 text-lg">{askingLabel(listing.priceUsd, listing.priceSats, btcUsd)}</p>
		<p class="text-base-content/70 mt-1 text-sm">
			{#if stock === null}
				{copy.unlimited}
			{:else if stock === 0}
				{copy.soldOut}
			{:else}
				{copy.inStock}: {stock}
			{/if}
		</p>
		<a
			class="link mt-2 inline-block text-sm"
			href={resolve('/(app)/browse/goods/shop/[pubkey]', { pubkey: listing.sellerPubkey })}
			data-testid="seller-shop"
		>
			{seller ? copy.yourShop : copy.shop}
		</a>
		{#if listing.reserve === 'collect' && (!chosenZone || chosenZone.service === 'pickup')}
			<p class="mt-1 text-sm" data-testid="goods-terms">
				{heldForLabel(listing.title, listing.collectBy, language)}. {copy.deposit} ${listing.depositUsd.toFixed(
					2
				)}.
				{copy.noShow}
				{listing.noShowPercent}%.
			</p>
		{/if}
		<p class="text-base-content/70 mt-1 text-sm">
			{categoryLabel(listing.category, language)} · {conditionLabel(listing.condition, language)} ·
			{fulfillmentLabel(listing.fulfillment, language)} · {listing.location}
		</p>
		<p class="mt-4 whitespace-pre-wrap">{listing.description}</p>
		<p class="text-base-content/70 mt-4 text-sm">{copy.noKyc}</p>

		{#if partialRetry}
			<div class="mt-4">
				<PartialSendWarning pending={sending} onsend={partialRetry} />
			</div>
		{/if}
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
				{#if listing.variants.length > 0}
					<label class="flex flex-col gap-1 text-sm">
						{copy.options}
						<select
							class="select select-bordered"
							value={variantId || listing.variants[0]?.id || ''}
							onchange={(event) => {
								variantId = (event.currentTarget as HTMLSelectElement).value;
							}}
							data-testid="goods-variant"
						>
							{#each listing.variants as option (option.id)}
								<option value={option.id}
									>{option.name} · {priceLabel(option.priceUsd, btcUsd)}</option
								>
							{/each}
						</select>
					</label>
				{/if}
				<label class="flex flex-col gap-1 text-sm">
					{copy.quantity}
					<input
						class="input input-bordered"
						type="number"
						min="1"
						step="1"
						bind:value={quantity}
						data-testid="goods-buy-quantity"
					/>
				</label>
				{#if zones.length > 0}
					<label class="flex flex-col gap-1 text-sm">
						{copy.shipping}
						<select
							class="select select-bordered"
							value={shippingId || zones[0]?.id || ''}
							onchange={(event) => {
								shippingId = (event.currentTarget as HTMLSelectElement).value;
							}}
							data-testid="goods-shipping"
						>
							{#each zones as zone (zone.id)}
								<option value={zone.id}>
									{zone.name} · {zone.regions.join(', ')} · {priceLabel(zone.costUsd, btcUsd)}
								</option>
							{/each}
						</select>
					</label>
				{/if}
				{#if needsAddress}
					<label class="flex flex-col gap-1 text-sm">
						{copy.address}
						<textarea
							class="textarea textarea-bordered"
							rows="2"
							bind:value={address}
							data-testid="goods-address"
						></textarea>
						<span class="text-base-content/70">{copy.addressHint}</span>
					</label>
				{/if}
				{#if preview}
					<p class="text-sm" data-testid="goods-total">
						{copy.total}
						{priceLabel(preview.holdUsd > 0 ? preview.holdUsd : preview.totalUsd, btcUsd)}
					</p>
				{/if}
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
					{copy.payWallet}
				</button>
				{#if short}
					<p class="text-sm" data-testid="pay-short">{copy.short}</p>
					<div class="flex gap-2">
						<a
							class="btn btn-outline btn-sm"
							href={resolve('/(app)/(protected)/wallet')}
							data-testid="pay-receive"
							onclick={() => {
								sessionStorage.setItem('bittasker.checkout-return', `/browse/goods/${listing.id}`);
								sessionStorage.setItem('bittasker.checkout-sheet', 'receive');
							}}
						>
							{copy.receive}
						</a>
						<a
							class="btn btn-outline btn-sm"
							href={resolve('/(app)/(protected)/wallet')}
							data-testid="pay-buy"
							onclick={() => {
								sessionStorage.setItem('bittasker.checkout-return', `/browse/goods/${listing.id}`);
								sessionStorage.setItem('bittasker.checkout-sheet', 'buy');
							}}
						>
							{copy.buyCard}
						</a>
					</div>
				{/if}
				{#if !$authState.isAuthenticated}
					<a class="link text-sm" href={resolve('/(app)/auth/login')}>{copy.loginLink}</a>
				{/if}
			{/if}

			{#if deal && (seller || buyer)}
				<p class="text-sm" data-testid="goods-order">{deal.status}</p>
				{#if holdText}
					<p class="text-sm" data-testid="goods-hold">{holdText}</p>
				{/if}
				{#if buyer && buyerCode && collectOpen}
					<p class="text-sm">{copy.showCode}</p>
					<p class="font-mono text-2xl" data-testid="collection-code">{buyerCode}</p>
					{#if qrUrl}
						<img src={qrUrl} alt="" class="h-40 w-40" data-testid="collection-qr" />
					{/if}
				{/if}
				{#if seller && collectOpen}
					<label class="flex flex-col gap-1 text-sm">
						{copy.enterCode}
						<input class="input input-bordered" bind:value={code} data-testid="collection-entry" />
					</label>
					<button
						class="btn btn-outline btn-sm self-start"
						type="button"
						onclick={() => (scanning = true)}
					>
						{copy.scan}
					</button>
					<label class="flex flex-col gap-1 text-sm">
						{copy.invoice}
						<input class="input input-bordered" bind:value={invoice} />
					</label>
					<button
						class="btn btn-primary self-start"
						type="button"
						disabled={sending}
						onclick={collect}
						data-testid="collect-goods"
					>
						{copy.received}
					</button>
				{/if}
				{#if collectLate && (seller || buyer)}
					<p class="text-sm">{copy.errors.late}</p>
					<label class="flex flex-col gap-1 text-sm">
						{copy.invoice}
						<input
							class="input input-bordered"
							bind:value={shareInvoice}
							data-testid="share-invoice"
						/>
					</label>
					{#if seller && deal && deal.noShowPercent > 0 && !deal.sellerPaid}
						<button
							class="btn btn-primary self-start"
							type="button"
							disabled={sending}
							onclick={() => settleShare('seller')}
							data-testid="claim-noshow"
						>
							{copy.claimNoShow}
						</button>
					{/if}
					{#if buyer && deal && deal.noShowPercent < 100 && !deal.buyerPaid}
						<button
							class="btn btn-primary self-start"
							type="button"
							disabled={sending}
							onclick={() => settleShare('buyer')}
							data-testid="refund-deposit"
						>
							{copy.refundDeposit}
						</button>
					{/if}
				{/if}
				{#if seller && deal.status === 'funded' && deal.reserve !== 'collect'}
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
		{#if scanning}
			<WebQrCodeScanner
				mode="modal"
				onScan={(value) => {
					code = value.trim();
					scanning = false;
				}}
				onClose={() => (scanning = false)}
			/>
		{/if}
	{/if}
</div>
