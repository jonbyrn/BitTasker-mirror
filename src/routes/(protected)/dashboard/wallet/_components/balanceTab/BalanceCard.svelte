<script lang="ts">
	import { onMount } from 'svelte';
	import { getBalance } from '$lib/wallet/helper';

	let balance = $state<{ btc: number | undefined; sats: number; usdValue: number }>({
		btc: 0,
		sats: 0,
		usdValue: 0
	});

	onMount(async () => {
		balance = await getBalance();
	});
</script>

<div class="card bg-primary text-primary-content">
	<div class="card-body">
		<h3 class="card-title mb-2 text-lg">Total Balance</h3>
		<p class="text-4xl font-bold">{balance.btc?.toFixed(8)} BTC</p>
		<p class="opacity-80">{balance.sats.toLocaleString()} sats</p>
		<p class="opacity-80">≈ ${balance.usdValue.toLocaleString()}</p>
	</div>
</div>
