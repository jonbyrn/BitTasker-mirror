<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ChangellyCountry } from '$lib/services/fiat-ramp.service';

	let {
		countries,
		selectedCountry,
		selectedState,
		countriesLoading,
		statesForSelected,
		onCountryChange,
		onStateChange,
		onRefreshOffers
	}: {
		countries: ChangellyCountry[];
		selectedCountry: string;
		selectedState: string;
		countriesLoading: boolean;
		statesForSelected: ChangellyCountry['states'];
		onCountryChange: (code: string) => void;
		onStateChange: (code: string) => void;
		onRefreshOffers: () => void;
	} = $props();
</script>

<div class="space-y-2">
	<div class="form-control">
		<div class="relative">
			<select
				id="country-select"
				class="select border-primary bg-base-100 min-h-[48px] w-full rounded-lg border-2 text-base"
				class:opacity-50={countriesLoading}
				disabled={countriesLoading}
				value={selectedCountry}
				aria-label={$t('wallet.buy_sell.country')}
				onchange={(e) => {
					onCountryChange(e.currentTarget.value);
					onRefreshOffers();
				}}
			>
				{#if countries.length === 0}
					<option value="">{$t('wallet.buy_sell.loading_offers')}</option>
				{/if}
				{#each countries as c (c.code)}
					<option value={c.code}>{c.name} ({c.code})</option>
				{/each}
			</select>
			{#if countriesLoading}
				<span
					class="loading loading-spinner loading-sm text-primary absolute top-1/2 right-3 -translate-y-1/2"
				></span>
			{/if}
		</div>
	</div>

	{#if selectedCountry === 'US' && (statesForSelected ?? []).length > 0}
		<div class="form-control animate-fade-in">
			<select
				id="state-select"
				class="select border-primary bg-base-100 min-h-[48px] w-full rounded-lg border-2 text-base"
				value={selectedState}
				aria-label={$t('wallet.buy_sell.select_state')}
				onchange={(e) => {
					onStateChange(e.currentTarget.value);
					onRefreshOffers();
				}}
			>
				<option value="">{$t('wallet.buy_sell.select_state')}</option>
				{#each statesForSelected as s (s.code)}
					<option value={s.code}>{s.name}</option>
				{/each}
			</select>
		</div>
	{/if}
</div>

<style>
	.animate-fade-in {
		animation: fadeIn 200ms ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
