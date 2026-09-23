<script lang="ts">
	/**
	 * UnknownTokensCard — Collapsible card displaying Tier 2 verified stablecoin
	 * balances across chains. These tokens are informational only and NOT counted
	 * in the total wallet balance.
	 *
	 * Tier 2 tokens use the key format `chainId-SYMBOL` (e.g., "56-USDT", "137-USDC").
	 * Known native asset keys (btc, btc_lightning, usdt_rgb) are explicitly excluded.
	 *
	 * Hidden when no Tier 2 tokens are detected.
	 */
	import { t } from 'svelte-i18n';

	const TIER2_KEY_RE = /^\d+-[A-Z]+$/;
	const TIER1_KEYS = new Set(['btc', 'btc_lightning', 'usdt_rgb']);

	let {
		wallets
	}: {
		wallets: Array<{
			id: string;
			balances?: Record<string, { raw: string; formatted: string; loading: boolean }>;
		}>;
	} = $props();

	let tier2Tokens = $derived.by(() => {
		const tokens: Array<{ key: string; formatted: string }> = [];
		for (const w of wallets) {
			const balances = w.balances;
			if (!balances) continue;
			for (const [key, val] of Object.entries(balances)) {
				if (!TIER2_KEY_RE.test(key)) continue;
				if (TIER1_KEYS.has(key)) continue;
				const raw = Number(val.raw ?? 0);
				if (raw <= 0) continue;
				tokens.push({ key, formatted: val.formatted || key });
			}
		}
		return tokens;
	});

	let hasTier2Tokens = $derived(tier2Tokens.length > 0);
	let tier2Count = $derived(tier2Tokens.length);

	let expanded = $state(false);
</script>

{#if hasTier2Tokens}
	<div class="mb-4">
		<button
			class="btn btn-ghost btn-sm text-base-content/50 w-full justify-start gap-2"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
		>
			<svg
				class="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
				class:rotate-180={expanded}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
			<span class="text-xs italic">{tier2Count} {$t('wallet.tier2_tokens_title')}</span>
		</button>

		{#if expanded}
			<div class="border-base-300 bg-base-200/50 mt-2 flex flex-col gap-1 rounded-lg border p-3">
				{#each tier2Tokens as token (token.key)}
					<div class="text-base-content/60 flex items-center justify-between px-2 text-sm italic">
						<span>{token.formatted}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
