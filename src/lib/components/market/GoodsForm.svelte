<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { locale } from 'svelte-i18n';
	import { publishListing } from '$lib/market/board.svelte';
	import { categoryLabel, conditionLabel, fulfillmentLabel } from '$lib/market/categories';
	import { marketCopy, marketErrorFrom } from '$lib/market/copy';
	import { collectByFromDate } from '$lib/market/collect';
	import { newGoodsId } from '$lib/market/ids';
	import { nowSeconds } from '$lib/market/money';
	import { listingFromDraft, replaceListing } from '$lib/market/rules';
	import {
		GOODS_CATEGORIES,
		GOODS_CONDITIONS,
		GOODS_FULFILLMENTS,
		type GoodsFormValue,
		type GoodsListing
	} from '$lib/market/types';
	import { pubkeyHex } from '$lib/staffing/ids';
	import { getNpub } from '$lib/utils/nostrKeys';

	let {
		value = $bindable(),
		existing = null
	}: {
		value: GoodsFormValue;
		existing?: GoodsListing | null;
	} = $props();

	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(marketCopy(language));
	let photoLink = $state('');
	let error = $state('');
	let sending = $state(false);

	const choices = $derived(
		value.category === 'digital'
			? (['digital'] as const)
			: GOODS_FULFILLMENTS.filter((item) => item !== 'digital')
	);
	const canCollect = $derived(value.category !== 'digital' && value.fulfillment !== 'shipping');

	function addLink() {
		const link = photoLink.trim();
		if (!link || value.photos.includes(link) || value.photos.length >= 4) return;
		value.photos = [...value.photos, link];
		photoLink = '';
	}

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

	async function publish() {
		error = '';
		sending = true;
		try {
			const seller = pubkeyHex(await getNpub());
			const priceUsd = Number(value.price);
			const collect = canCollect && value.reserve === 'collect';
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
				reserve: collect ? 'collect' : 'pay',
				depositUsd: collect ? (value.holdFull ? priceUsd : Number(value.deposit)) : 0,
				collectBy: collect ? collectByFromDate(value.collectBy) : 0,
				noShowPercent: collect ? Number(value.noShow) : 0
			};
			const next = existing
				? replaceListing(existing, draft, seller)
				: listingFromDraft(draft, seller, newGoodsId(), nowSeconds());
			const saved = await publishListing(next);
			goto(resolve('/(app)/browse/goods/[id]', { id: saved.id }));
		} catch (cause) {
			error = marketErrorFrom(language, cause);
		} finally {
			sending = false;
		}
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
				if (value.category === 'digital') {
					value.fulfillment = 'digital';
					value.reserve = 'pay';
				}
			}}
		>
			{#each GOODS_CATEGORIES as item (item)}
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
	<label class="flex flex-col gap-1 text-sm">
		{copy.price}
		<input
			class="input input-bordered"
			type="number"
			min="0.01"
			step="0.01"
			bind:value={value.price}
			required
		/>
	</label>
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
	<div class="flex flex-col gap-2 text-sm">
		<span>{copy.photos}</span>
		{#each value.photos as photo (photo)}
			<img src={photo} alt="" class="h-32 w-full rounded-lg object-cover" />
		{/each}
		<div class="flex gap-2">
			<input
				class="input input-bordered flex-1"
				placeholder={copy.photoLink}
				bind:value={photoLink}
			/>
			<button type="button" class="btn btn-outline btn-sm" onclick={addLink}>{copy.addPhoto}</button
			>
		</div>
		<input class="file-input file-input-bordered" type="file" accept="image/*" onchange={addFile} />
		<button type="button" class="btn btn-ghost btn-sm self-start" onclick={useHere}
			>{copy.near}</button
		>
	</div>
	{#if error}
		<p class="text-error text-sm" data-testid="goods-error">{error}</p>
	{/if}
	<button class="btn btn-primary" type="submit" disabled={sending} data-testid="publish-goods">
		{sending ? copy.saving : copy.save}
	</button>
</form>
