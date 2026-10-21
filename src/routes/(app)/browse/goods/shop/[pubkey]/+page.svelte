<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import {
		goodsBoard,
		publishStall,
		refreshForeignGoods,
		refreshGoodsBoard,
		stallForSeller
	} from '$lib/market/board.svelte';
	import { marketCopy, marketErrorFrom } from '$lib/market/copy';
	import { askingLabel, nowSeconds } from '$lib/market/money';
	import { stallFromDraft } from '$lib/market/rules';
	import { SHIPPING_SERVICES, type ShippingService } from '$lib/market/types';
	import { isMarketEnabled } from '$lib/services/feature-flags';
	import { pubkeyHex, samePerson } from '$lib/staffing/ids';
	import { getNpub } from '$lib/utils/nostrKeys';

	const enabled = isMarketEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(marketCopy(language));
	const sellerKey = $derived(pubkeyHex(page.params.pubkey ?? ''));
	const stall = $derived(sellerKey ? stallForSeller(sellerKey) : undefined);
	const items = $derived(
		goodsBoard.listings.filter(
			(item) => item.status === 'active' && samePerson(item.sellerPubkey, sellerKey)
		)
	);

	const serviceLabels: Record<ShippingService, { en: string; es: string }> = {
		standard: { en: 'Standard', es: 'Estándar' },
		express: { en: 'Express', es: 'Exprés' },
		overnight: { en: 'Overnight', es: 'Al día siguiente' },
		pickup: { en: 'Pickup', es: 'Recoger' },
		digital: { en: 'Digital', es: 'Digital' }
	};

	let me = $state('');
	let name = $state('');
	let description = $state('');
	let zones = $state([
		{
			id: 'pickup',
			name: 'Pickup',
			cost: '0',
			regions: 'Local pickup',
			service: 'pickup' as ShippingService
		}
	]);
	let error = $state('');
	let notice = $state('');
	let sending = $state(false);
	let ready = $state(false);

	const mine = $derived(Boolean(sellerKey && samePerson(sellerKey, me)));

	function serviceName(service: ShippingService): string {
		const row = serviceLabels[service];
		return language === 'es' ? row.es : row.en;
	}

	function fillFromBoard(): boolean {
		const current = sellerKey ? stallForSeller(sellerKey) : undefined;
		if (!current) return false;
		name = current.name;
		description = current.description;
		zones = current.shipping.map((zone) => ({
			id: zone.id,
			name: zone.name,
			cost: String(zone.costUsd),
			regions: zone.regions.join(', '),
			service: zone.service
		}));
		return true;
	}

	onMount(() => {
		if (!enabled) return;
		getNpub()
			.then((value) => {
				me = pubkeyHex(value);
			})
			.catch(() => {
				me = '';
			});
		let filled = false;
		refreshGoodsBoard()
			.then(() => {
				filled = fillFromBoard();
				if (!name) name = language === 'es' ? 'Tienda' : 'Shop';
				ready = true;
				return refreshForeignGoods();
			})
			.then(() => {
				if (!filled) fillFromBoard();
			})
			.catch(() => {
				ready = true;
			});
	});

	function addZone() {
		zones = [
			...zones,
			{
				id: `zone-${zones.length + 1}`,
				name: '',
				cost: '0',
				regions: '',
				service: 'standard' as ShippingService
			}
		];
	}

	function zoneDraft() {
		return zones.map((zone) => ({
			id: zone.id,
			name: zone.name,
			costUsd: Number(zone.cost),
			regions: zone.regions
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean),
			service: zone.service
		}));
	}

	function save() {
		error = '';
		notice = '';
		sending = true;
		try {
			const next = stallFromDraft(
				{ name, description, shipping: zoneDraft() },
				me,
				stall?.createdAt || nowSeconds()
			);
			publishStall(next)
				.then(() => {
					notice = next.name;
				})
				.catch((cause) => {
					error = marketErrorFrom(language, cause);
				})
				.finally(() => {
					sending = false;
				});
		} catch (cause) {
			error = marketErrorFrom(language, cause);
			sending = false;
		}
	}
</script>

<svelte:head>
	<title>{stall?.name || copy.shop} · BitTasker</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8" data-testid="goods-shop">
	<a class="link mb-4 inline-block text-sm" href={resolve('/(app)/browse/goods')}>{copy.back}</a>
	{#if !enabled}
		<p data-testid="goods-off">{copy.off}</p>
	{:else if !ready}
		<p>{copy.loading}</p>
	{:else if !sellerKey}
		<p>{copy.unavailable}</p>
	{:else}
		<h1 class="text-2xl font-semibold">{stall?.name || copy.shop}</h1>
		{#if stall?.description}
			<p class="mt-2 whitespace-pre-wrap">{stall.description}</p>
		{/if}
		{#if stall}
			<ul class="mt-4 flex flex-col gap-2 text-sm" data-testid="shop-zones">
				{#each stall.shipping as zone (zone.id)}
					<li>
						{zone.name} · {zone.regions.join(', ')} · {askingLabel(zone.costUsd, 0, 0)} · {serviceName(
							zone.service
						)}
					</li>
				{/each}
			</ul>
		{/if}

		{#if mine}
			<form
				class="mt-6 flex flex-col gap-3"
				data-testid="shop-form"
				onsubmit={(event) => {
					event.preventDefault();
					save();
				}}
			>
				<h2 class="text-lg font-medium">{copy.yourShop}</h2>
				<label class="flex flex-col gap-1 text-sm">
					{copy.shopName}
					<input
						class="input input-bordered"
						bind:value={name}
						required
						minlength="2"
						data-testid="shop-name"
					/>
				</label>
				<label class="flex flex-col gap-1 text-sm">
					{copy.shopAbout}
					<textarea class="textarea textarea-bordered" rows="3" bind:value={description}></textarea>
				</label>
				<p class="text-sm font-medium">{copy.zones}</p>
				{#each zones as zone, index (zone.id)}
					<div class="border-base-300 grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
						<label class="flex flex-col gap-1 text-sm">
							{copy.zoneName}
							<input class="input input-bordered" bind:value={zone.name} data-testid="zone-name" />
						</label>
						<label class="flex flex-col gap-1 text-sm">
							{copy.zoneCost}
							<input
								class="input input-bordered"
								type="number"
								min="0"
								step="0.01"
								bind:value={zone.cost}
								data-testid="zone-cost"
							/>
						</label>
						<label class="flex flex-col gap-1 text-sm sm:col-span-2">
							{copy.zoneRegions}
							<input
								class="input input-bordered"
								bind:value={zone.regions}
								data-testid="zone-regions"
							/>
						</label>
						<label class="flex flex-col gap-1 text-sm">
							{copy.zoneService}
							<select class="select select-bordered" bind:value={zone.service}>
								{#each SHIPPING_SERVICES as service (service)}
									<option value={service}>{serviceName(service)}</option>
								{/each}
							</select>
						</label>
						<button
							type="button"
							class="btn btn-ghost btn-sm self-end"
							onclick={() => {
								zones = zones.filter((_, item) => item !== index);
							}}
						>
							{copy.remove}
						</button>
					</div>
				{/each}
				<button
					type="button"
					class="btn btn-outline btn-sm self-start"
					onclick={addZone}
					data-testid="add-zone"
				>
					{copy.addZone}
				</button>
				{#if error}
					<p class="text-error text-sm" data-testid="shop-error">{error}</p>
				{/if}
				{#if notice}
					<p class="text-sm" data-testid="shop-notice">{notice}</p>
				{/if}
				<button class="btn btn-primary self-start" type="submit" disabled={sending}
					>{copy.save}</button
				>
			</form>
		{/if}

		<ul class="mt-8 grid gap-3 sm:grid-cols-2">
			{#each items as item (item.id)}
				<li>
					<a
						class="border-base-300 hover:border-primary block rounded-xl border p-4"
						href={resolve('/(app)/browse/goods/[id]', { id: item.id })}
						data-testid="shop-item"
					>
						<span class="font-medium">{item.title}</span>
						<span class="mt-1 block text-sm">{askingLabel(item.priceUsd, item.priceSats, 0)}</span>
					</a>
				</li>
			{/each}
		</ul>
		{#if items.length === 0}
			<p class="mt-6 text-sm">{copy.empty}</p>
		{/if}
	{/if}
</div>
