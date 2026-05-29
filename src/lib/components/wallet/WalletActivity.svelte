<script lang="ts">
	/**
	 * WalletActivity — compact per-wallet balance history
	 *
	 * Shows 24h/7d/30d sats changes for a single connected wallet address.
	 * Uses direct RPC fetch to the public RSK node — no wallet-core dependency.
	 */
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';

	let {
		address,
		balancesHidden = false
	}: {
		address: string;
		balancesHidden?: boolean;
	} = $props();

	let changes = $state<Array<{ label: string; satsChange: number | null }>>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function fetchChanges() {
		if (!address) return;
		loading = true;
		error = null;

		try {
			const now = Date.now();
			const periods = [
				{ label: '24h', hours: 24 },
				{ label: '7d', hours: 168 },
				{ label: '30d', hours: 720 }
			];

			// Get current balance via direct RPC
			const rpcUrl = 'https://public-node.rsk.co';
			const curRes = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getBalance',
					params: [address, 'latest'],
					id: 1
				})
			});
			const curData = await curRes.json();
			const currentSats = Number(BigInt(curData?.result || '0x0') / BigInt(10_000_000_000n));

			const results: Array<{ label: string; satsChange: number | null }> = [];

			for (const p of periods) {
				// Get block number at that timestamp
				const ts = Math.floor((now - p.hours * 3600 * 1000) / 1000);
				const blockUrl =
					'https://rootstock.blockscout.com/api?module=block&action=getblocknobytime&timestamp=' +
					ts +
					'&closest=before';

				try {
					const blockRes = await fetch(blockUrl, {
						signal: AbortSignal.timeout(10000)
					});
					const blockData = await blockRes.json();
					const bn = parseInt(blockData?.result?.blockNumber || '0', 10);

					if (bn > 0) {
						// Get balance at that block
						const hexBlock = '0x' + bn.toString(16);
						const histRes = await fetch(rpcUrl, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								jsonrpc: '2.0',
								method: 'eth_getBalance',
								params: [address, hexBlock],
								id: 1
							})
						});
						const histData = await histRes.json();
						const histSats = Number(BigInt(histData?.result || '0x0') / BigInt(10_000_000_000n));
						results.push({
							label: p.label,
							satsChange: currentSats - histSats
						});
					} else {
						results.push({ label: p.label, satsChange: null });
					}
				} catch {
					results.push({ label: p.label, satsChange: null });
				}
			}

			changes = results;
		} catch (err) {
			error = err instanceof Error ? err.message : 'N/A';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchChanges();
	});

	function formatChange(sats: number | null): string {
		if (sats === null) return '—';
		const abs = Math.abs(sats);
		const formatted = abs.toLocaleString('en-US');
		if (sats === 0) return '0';
		return sats > 0 ? `+${formatted}` : `-${formatted}`;
	}

	function changeColor(sats: number | null): string {
		if (sats === null || sats === 0) return 'text-base-content/50';
		return sats > 0 ? 'text-success' : 'text-error';
	}
</script>

{#if loading}
	<div class="flex items-center gap-2 text-sm">
		{#each [1, 2, 3] as _ (_.toString())}
			<span class="skeleton h-3 w-12 rounded"></span>
		{/each}
	</div>
{:else if error}
	<span class="text-base-content/50 text-xs">{$t('wallet.balance_history.error')}</span>
{:else if changes.length > 0}
	<div class="flex items-center gap-2 text-xs">
		<span class="text-base-content/50">{$t('wallet.balance_history.label')}</span>
		{#each changes as c (c.label)}
			<span class="font-semibold {changeColor(c.satsChange)}"
				>{balancesHidden ? '•••• Sats' : formatChange(c.satsChange) + ' Sats'}</span
			>
		{/each}
	</div>
{/if}
