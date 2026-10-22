<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { publishListing, refreshGoodsBoard } from '$lib/market/board.svelte';
	import {
		categoryLabel,
		conditionLabel,
		fulfillmentLabel,
		isGoodsCategory,
		isRentalCategory,
		isRentPeriod,
		rentPriceHint
	} from '$lib/market/categories';
	import { marketCopy, marketErrorFrom } from '$lib/market/copy';
	import { collectByFromDate } from '$lib/market/collect';
	import { newGoodsId } from '$lib/market/ids';
	import { nowSeconds } from '$lib/market/money';
	import { listingFromDraft, replaceListing } from '$lib/market/rules';
	import {
		GOODS_CATEGORIES,
		GOODS_CONDITIONS,
		GOODS_FULFILLMENTS,
		RENT_PERIODS,
		RENTAL_CATEGORIES,
		type GoodsFormValue,
		type GoodsListing,
		type ListingOffer
	} from '$lib/market/types';
	import { pubkeyHex } from '$lib/staffing/ids';
	import KeyUnlock from '$lib/components/wallet/KeyUnlock.svelte';
	import { walletUnlockRoute } from '$lib/utils/helpers/login-method';
	import { getMnemonic } from '$lib/utils/helpers/mnemonic';
	import { isNsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
	import { SignerLockedError } from '$lib/utils/helpers/passkey-prompt';
	import { getNpub, prepareSigner, signerReady } from '$lib/utils/nostrKeys';

	let {
		value = $bindable(),
		existing = null
	}: {
		value: GoodsFormValue;
		existing?: GoodsListing | null;
	} = $props();

	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(marketCopy(language));
	let error = $state('');
	let sending = $state(false);
	let needsUnlock = $state(false);
	let more = $state(false);
	let shopPubkey = $state('');

	const renting = $derived(value.offer === 'rent');
	const categories = $derived(renting ? RENTAL_CATEGORIES : GOODS_CATEGORIES);
	const rentHint = $derived(renting ? rentPriceHint(value.category, language) : null);
	const choices = $derived(
		value.category === 'digital'
			? (['digital'] as const)
			: GOODS_FULFILLMENTS.filter((item) => item !== 'digital')
	);
	const canCollect = $derived(
		!renting && value.category !== 'digital' && value.fulfillment !== 'shipping'
	);

	function setOffer(next: ListingOffer) {
		value.offer = next;
		if (next === 'rent') {
			if (!isRentalCategory(value.category)) value.category = 'rent-vehicles';
			value.reserve = 'pay';
			const hint = rentPriceHint(value.category, language);
			value.rentPeriod =
				hint?.period || (isRentPeriod(value.rentPeriod) ? value.rentPeriod : 'day');
			return;
		}
		if (!isGoodsCategory(value.category)) {
			value.category = 'electronics';
			value.deposit = '';
		}
	}

	onMount(() => {
		getNpub()
			.then((pubkey) => {
				shopPubkey = pubkeyHex(pubkey);
			})
			.catch(() => {
				shopPubkey = '';
			});
	});

	async function addFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || value.photos.length >= 4) return;
		try {
			const uploaded = await import('$lib/api/services/upload.service');
			const result = await uploaded.default.uploadSingleFile(file, { folder: 'goods' });
			if (result.url.startsWith('https://') && !value.photos.includes(result.url)) {
				value.photos = [...value.photos, result.url];
			}
		} catch {
			error = copy.photoFailed;
		}
	}

	function useHere() {
		if (!navigator.geolocation) {
			error = copy.nearDenied;
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) => {
				value.latitude = position.coords.latitude;
				value.longitude = position.coords.longitude;
			},
			() => {
				error = copy.nearDenied;
			}
		);
	}

	function lockedNsec(): boolean {
		return walletUnlockRoute() === 'nsec' && !signerReady();
	}

	function fail(cause: unknown) {
		if (isNsecUnlockRequired(cause) || cause instanceof SignerLockedError) {
			needsUnlock = true;
			error = '';
			return;
		}
		error = marketErrorFrom(language, cause);
	}

	async function saveGoods(seller: string) {
		const priceUsd = Number(value.price);
		const rent = value.offer === 'rent';
		const collect = !rent && canCollect && value.reserve === 'collect';
		const depositUsd = value.deposit.trim() === '' ? 0 : Number(value.deposit);
		const draft = {
			title: value.title,
			description: value.description,
			category: value.category,
			condition: value.condition,
			priceUsd,
			location: value.location,
			latitude: value.latitude,
			longitude: value.longitude,
			fulfillment: value.category === 'digital' ? 'digital' : value.fulfillment,
			photos: value.photos,
			offer: rent ? 'rent' : 'sell',
			rentPeriod: rent ? value.rentPeriod : '',
			reserve: collect ? 'collect' : 'pay',
			depositUsd: rent ? depositUsd : collect ? (value.holdFull ? priceUsd : depositUsd) : 0,
			collectBy: collect ? collectByFromDate(value.collectBy) : 0,
			noShowPercent: collect ? Number(value.noShow) : 0,
			quantity: value.quantity.trim() === '' ? null : Number(value.quantity),
			variants: value.variants.map((option) => ({
				name: option.name,
				priceUsd: Number(option.price)
			})),
			extraShippingUsd: value.extraShipping.trim() === '' ? 0 : Number(value.extraShipping)
		};
		const next = existing
			? replaceListing(existing, draft, seller)
			: listingFromDraft(draft, seller, newGoodsId(), nowSeconds());
		await refreshGoodsBoard();
		const saved = await publishListing(next);
		goto(resolve('/(app)/browse/goods/[id]', { id: saved.id }));
	}

	function publish() {
		error = '';
		if (lockedNsec()) {
			needsUnlock = true;
			return;
		}
		const unlock = prepareSigner();
		sending = true;
		void unlock
			.then(async ({ npub }) => {
				const seller = pubkeyHex(npub) || pubkeyHex(await getNpub());
				await saveGoods(seller);
				needsUnlock = false;
			})
			.catch((cause: unknown) => fail(cause))
			.finally(() => {
				sending = false;
			});
	}

	function unlockThenPublish(nsec: string) {
		const unlock = lockedNsec() ? null : prepareSigner();
		error = '';
		sending = true;
		void (async () => {
			try {
				if (walletUnlockRoute() === 'nsec') await getMnemonic({ nsec });
				const keys = unlock ? await unlock : await prepareSigner();
				const seller = pubkeyHex(keys.npub) || pubkeyHex(await getNpub());
				await saveGoods(seller);
				needsUnlock = false;
			} catch (cause) {
				fail(cause);
			} finally {
				sending = false;
			}
		})();
	}
</script>

<form
	class="mx-auto flex max-w-xl flex-col gap-4"
	data-testid="goods-form"
	onsubmit={(event) => {
		event.preventDefault();
		publish();
	}}
>
	<div class="flex gap-2" data-testid="goods-offer">
		<button
			type="button"
			class="btn btn-sm {renting ? 'btn-outline' : 'btn-primary'}"
			data-testid="goods-offer-sell"
			onclick={() => setOffer('sell')}
		>
			{copy.offerSell}
		</button>
		<button
			type="button"
			class="btn btn-sm {renting ? 'btn-primary' : 'btn-outline'}"
			data-testid="goods-offer-rent"
			onclick={() => setOffer('rent')}
		>
			{copy.offerRent}
		</button>
	</div>
	{#if renting}
		<p class="listing-body text-base-content/80 text-sm" data-testid="rent-disclaimer">
			{copy.rentDisclaimer}
		</p>
	{/if}
	<label class="flex flex-col gap-1 text-sm">
		{copy.itemTitle}
		<input
			class="input input-bordered"
			bind:value={value.title}
			required
			minlength="3"
			maxlength="120"
		/>
	</label>
	<label class="flex flex-col gap-1 text-sm">
		{copy.description}
		<textarea class="textarea textarea-bordered" rows="4" bind:value={value.description} required
		></textarea>
	</label>
	<label class="flex flex-col gap-1 text-sm">
		{copy.category}
		<select
			class="select select-bordered"
			bind:value={value.category}
			onchange={() => {
				if (renting) {
					const hint = rentPriceHint(value.category, language);
					if (hint) value.rentPeriod = hint.period;
					return;
				}
				if (value.category === 'digital') {
					value.fulfillment = 'digital';
					value.reserve = 'pay';
				}
			}}
		>
			{#each categories as item (item)}
				<option value={item}>{categoryLabel(item, language)}</option>
			{/each}
		</select>
	</label>
	<label class="flex flex-col gap-1 text-sm">
		{copy.condition}
		<select class="select select-bordered" bind:value={value.condition}>
			{#each GOODS_CONDITIONS as item (item)}
				<option value={item}>{conditionLabel(item, language)}</option>
			{/each}
		</select>
	</label>
	{#if renting}
		<label class="flex flex-col gap-1 text-sm">
			{copy.rentPeriod}
			<select
				class="select select-bordered"
				bind:value={value.rentPeriod}
				data-testid="rent-period"
			>
				{#each RENT_PERIODS as period (period)}
					<option value={period}>
						{period === 'hour' ? copy.perHour : period === 'week' ? copy.perWeek : copy.perDay}
					</option>
				{/each}
			</select>
		</label>
	{/if}
	<label class="flex flex-col gap-1 text-sm">
		{renting ? copy.rentPrice : copy.price}
		<input
			class="input input-bordered"
			type="number"
			min="0.01"
			step="0.01"
			bind:value={value.price}
			placeholder={rentHint?.placeholder ?? ''}
			required
			data-testid="goods-price"
		/>
		{#if rentHint}
			<span class="listing-body text-base-content/70" data-testid="rent-price-hint"
				>{rentHint.text}</span
			>
		{/if}
	</label>
	{#if renting}
		<label class="listing-body flex flex-col gap-1 text-sm">
			{copy.depositOptional}
			<input
				class="input input-bordered"
				type="number"
				min="0"
				step="0.01"
				bind:value={value.deposit}
				data-testid="rent-deposit"
			/>
			<span class="text-base-content/70">{copy.depositOptionalHint}</span>
		</label>
	{/if}
	<label class="flex flex-col gap-1 text-sm">
		{copy.location}
		<input class="input input-bordered" bind:value={value.location} />
	</label>
	<label class="flex flex-col gap-1 text-sm">
		{copy.fulfillment}
		<select
			class="select select-bordered"
			bind:value={value.fulfillment}
			disabled={value.category === 'digital'}
			onchange={() => {
				if (value.fulfillment === 'shipping' || value.fulfillment === 'digital')
					value.reserve = 'pay';
			}}
		>
			{#each choices as item (item)}
				<option value={item}>{fulfillmentLabel(item, language)}</option>
			{/each}
		</select>
	</label>
	{#if canCollect}
		<label class="flex flex-col gap-1 text-sm">
			{copy.reserve}
			<select class="select select-bordered" bind:value={value.reserve} data-testid="goods-reserve">
				<option value="pay">{copy.reservePay}</option>
				<option value="collect">{copy.reserveCollect}</option>
			</select>
		</label>
	{/if}
	{#if canCollect && value.reserve === 'collect'}
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={value.holdFull} data-testid="goods-hold-full" />
			{copy.depositFull}
		</label>
		{#if !value.holdFull}
			<label class="flex flex-col gap-1 text-sm">
				{copy.deposit}
				<input
					class="input input-bordered"
					type="number"
					min="0.01"
					step="0.01"
					bind:value={value.deposit}
					data-testid="goods-deposit"
				/>
			</label>
		{/if}
		<label class="flex flex-col gap-1 text-sm">
			{copy.collectBy}
			<input
				class="input input-bordered"
				type="date"
				bind:value={value.collectBy}
				required
				data-testid="goods-collect-by"
			/>
		</label>
		<label class="flex flex-col gap-1 text-sm">
			{copy.noShow}
			<input
				class="input input-bordered"
				type="number"
				min="0"
				max="100"
				step="1"
				bind:value={value.noShow}
				data-testid="goods-noshow"
			/>
			<span class="text-base-content/70">{copy.noShowHint}</span>
		</label>
	{/if}
	<button
		type="button"
		class="btn btn-ghost btn-sm self-start"
		aria-expanded={more}
		data-testid="goods-more-options"
		onclick={() => (more = !more)}
	>
		{copy.moreOptions}
	</button>
	{#if more}
		<label class="flex flex-col gap-1 text-sm">
			{copy.quantity}
			<input
				class="input input-bordered"
				type="number"
				min="1"
				step="1"
				bind:value={value.quantity}
				data-testid="goods-quantity"
			/>
			<span class="text-base-content/70">{copy.quantityHint}</span>
		</label>
		<div class="flex flex-col gap-2 text-sm">
			<span>{copy.options}</span>
			{#each value.variants as option, index (index)}
				<div class="flex gap-2">
					<input
						class="input input-bordered flex-1"
						placeholder={copy.optionName}
						bind:value={option.name}
						data-testid="goods-option-name"
					/>
					<input
						class="input input-bordered w-28"
						type="number"
						min="0.01"
						step="0.01"
						placeholder={copy.optionPrice}
						bind:value={option.price}
						data-testid="goods-option-price"
					/>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={() => {
							value.variants = value.variants.filter((_, item) => item !== index);
						}}
					>
						{copy.remove}
					</button>
				</div>
			{/each}
			<button
				type="button"
				class="btn btn-outline btn-sm self-start"
				onclick={() => {
					value.variants = [...value.variants, { name: '', price: '' }];
				}}
				data-testid="goods-add-option"
			>
				{copy.addOption}
			</button>
		</div>
		<label class="flex flex-col gap-1 text-sm">
			{copy.extraShipping}
			<input
				class="input input-bordered"
				type="number"
				min="0"
				step="0.01"
				bind:value={value.extraShipping}
				data-testid="goods-extra-shipping"
			/>
		</label>
		{#if shopPubkey}
			<a
				class="link text-sm"
				href={resolve('/(app)/browse/goods/shop/[pubkey]', { pubkey: shopPubkey })}
				data-testid="goods-shop-link"
			>
				{copy.yourShop}
			</a>
		{/if}
	{/if}
	<div class="flex flex-col gap-2 text-sm">
		<span>{copy.photos}</span>
		{#each value.photos as photo (photo)}
			<img src={photo} alt="" class="h-32 w-full rounded-lg object-cover" />
		{/each}
		<label class="btn btn-outline btn-sm w-fit">
			{copy.addPhoto}
			<input
				class="hidden"
				type="file"
				accept="image/*"
				onchange={addFile}
				data-testid="goods-photo"
			/>
		</label>
		<button type="button" class="btn btn-ghost btn-sm self-start" onclick={useHere}
			>{copy.near}</button
		>
	</div>
	{#if error}
		<p class="text-error text-sm" data-testid="goods-error">{error}</p>
	{/if}
	{#if needsUnlock}
		<KeyUnlock
			embedded
			testId="goods-unlock"
			passkeyLabel={copy.unlock}
			keyLabel={copy.unlock}
			busy={sending}
			onunlock={unlockThenPublish}
		/>
	{/if}
	<button class="btn btn-primary" type="submit" disabled={sending} data-testid="publish-goods">
		{sending ? copy.saving : copy.save}
	</button>
</form>
