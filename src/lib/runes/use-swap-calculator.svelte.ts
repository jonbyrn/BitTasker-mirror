/**
 * use-swap-calculator.svelte.ts
 *
 * Svelte 5 rune extracting SwapForm.svelte's amount/percent logic (bidirectional sync,
 * applyPercent/setMaxAmount, deriveds, amountSats conversion for routes, balance checks).
 *
 * Phase 1 artifact (first in Phase 0 recommended safe order: calculator → routes → wallets).
 * Base: strictly the design in docs/wallet/swapform-phase1-logic-extraction-design.md (section 2)
 * + current logic in SwapForm.svelte (amountInTokenUnits 440, walletBalance* 340/448,
 * satsUsd 458, applyPercent 466, pct sync $effect 478, amountSats 664, isInsufficient 672,
 * isValidAmount 678, setMax 919, resets 912/983, etc.).
 *
 * Defensive patterns (defi-positions + Phase 0 + bittasker-wallet + CLAUDE):
 * - isFiniteNum guards everywhere (NaN, !finite, <=0, price=0 → safe 0 or early return).
 * - Exact current math/rounding preserved (rbtc: Math.round * 1e8 / /1e8 for display units;
 *   usdt: toFixed(6); amount string holds display units: sats-int-str for rbtc, usd-dec-str for usdt).
 * - Getters for deps (allows calc-first extraction before wallets rune; form provides from
 *   temp sourceRbtcSats etc. or later swapWallets).
 * - isOnline via getter (UI gates; exposed for canSwap parity).
 * - $effect only for bidirectional (single-writer; !== guard before set to avoid loops).
 * - Pure helpers exported (parseAmount, satsUsd) for TDD + reuse.
 * - No side effects (no haptic/Sentry/RPC/gas/mempool — caller or routes rune).
 * - No i18n (hard "sats"; formatUsd/formatSats from store — en-US; full locale/$t stays in caller per design).
 * - <200 LOC target; co-located interfaces; no `any`; runes only.
 *
 * What WILL BE DELETED from SwapForm.svelte later (per design 393 + Phase 0):
 * - amountInTokenUnits $derived.by (L439)
 * - walletBalanceToken $derived (L340; will be in wallets rune or temp getter)
 * - walletBalanceDisplay $derived (L448)
 * - function satsUsd (L458)
 * - function applyPercent (L466)
 * - $effect bidirectional pct sync (L478)
 * - amountSats $derived.by (L664)
 * - isInsufficientBalance $derived (L672)
 * - isValidAmount $derived (L678)
 * - function setMaxAmount (L919; haptic + Sentry breadcrumb move to call site)
 * - Related walletBalanceToken uses in display/insuff (now via rune)
 * - Direct amount='' / swapPercent=0 (use resetAmount)
 * - Inline comments/deriveds around 340-488, 664-678, 919-932
 * - Keep temp thin wrappers (// PHASE1_RUNE_MIGRATE: delete after ...; was: ...) for rollback.
 *
 * Integration: see "Integration Notes" below. Caller provides getters (e.g. from current
 * source* deriveds). Rune owns amount/swapPercent (full encap option per design interface;
 * preferred single-source or caller $state + mutators both supported in shape).
 *
 * Testability (Phase 0 + TDD + design): vitest pure fns + rune (mock opts; 5 edges:
 * empty/0/100%/insuff/offline/price=0/NaN/boundary like 0.0000001/negative). No DOM.
 * Mocks at boundary only (like current SwapForm.test + btcPrice mock 65000).
 *
 * Data deps (via getters): wallets (balanceToken + sourceType), btcPrice or live (for amountSats/usdt→sats),
 * formatSats/formatUsd, network (isOnline opt), (locale formatters opt/inject per design).
 *
 * References (full reads): design doc, Phase 0 subagent 019e856b-..., SwapForm.svelte,
 * btcPrice.svelte.ts, defi-positions.store.svelte.ts, wallet.store.ts, network-status.ts,
 * tryCatch.ts, bittasker-wallet/svelte-runes/gitnexus-impact skills, swap-drawer-audit-report.md.
 */

import { formatSats, formatUsd } from '$lib/stores/wallet.store';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('swap-calculator');

// ---------------------------------------------------------------------------
// Typed Interfaces (public API, co-located, per design + CLAUDE)
export type SwapSourceType =
	| 'rbtc'
	| 'usdt0-arb'
	| 'btc-onchain'
	| 'wbtc-arb'
	| 'tbtc-arb'
	| 'usdt-bsc'
	| 'usdt0-rsk'
	| 'doc-rsk';

export interface UseSwapCalculatorOptions {
	/** From wallets rune (or direct/temporary deriveds in SwapForm for calc-first extraction). In token units (rbtc frac or usdt). */
	getWalletBalanceToken: () => number;
	/** Narrowed for swap (design). */
	getSourceType: () => SwapSourceType;
	/** For usdt→sats in amountSats (local btcUsdPrice or btcPrice.price; caller choice). */
	getBtcUsdPrice: () => number;
	getIsOnline?: () => boolean;
}

export interface UseSwapCalculator {
	// Caller owns or uses rune-provided (design supports both; rune-owned for clean single-source + bind).
	amount: string;
	swapPercent: number;

	// Derived (read-only, reactive)
	amountInTokenUnits: number;
	walletBalanceToken: number; // proxy to getter (num)
	walletBalanceDisplay: string;
	isInsufficientBalance: boolean;
	isValidAmount: boolean;
	amountSats: number; // for routes rune
	isOnline: boolean;

	// Actions (idempotent, trigger haptics? or caller)
	applyPercent(pct: number): void;
	setMaxAmount(): void;
	resetAmount(): void;

	// Pure helpers (testable standalone)
	satsUsd(sats: number, btcPrice: number): string;
	parseAmount(amt: string, sourceType: SwapSourceType): number;
}

// ---------------------------------------------------------------------------
// Pure helpers (defensive, testable; no side effects; extracted from SwapForm 458/441)
function isFiniteNum(n: unknown): n is number {
	return typeof n === 'number' && isFinite(n);
}

/** True for all BTC-denominated source types (amount in sats, not USD). */
function isBtcSourceType(st: SwapSourceType): boolean {
	return st === 'rbtc' || st === 'wbtc-arb' || st === 'tbtc-arb' || st === 'btc-onchain';
}

export function parseAmount(amt: string, sourceType: SwapSourceType): number {
	const n = parseFloat(amt || '0');
	if (!isFiniteNum(n) || n <= 0) return 0;
	if (isBtcSourceType(sourceType)) {
		// All BTC-denominated: input is sats → convert to BTC
		return n / 100_000_000;
	}
	// USDT/USD: enforce 2 decimal places, floor to avoid dust below penny
	const val = Math.floor(n * 100) / 100;
	return val;
}

export function satsUsd(sats: number, btcPrice: number): string {
	const s = formatSats(sats);
	if (!isFiniteNum(btcPrice) || btcPrice <= 0) return `${s} sats`;
	const usd = (sats / 100_000_000) * btcPrice;
	return `${s} sats ≈ ${formatUsd(usd)}`;
}

// ---------------------------------------------------------------------------
// Rune implementation (factory fn per design; $state/$derived/$effect only; class not needed)
export function useSwapCalculator(opts: UseSwapCalculatorOptions): UseSwapCalculator {
	const getWalletBalanceToken = opts.getWalletBalanceToken;
	const getSourceType = opts.getSourceType;
	const getBtcUsdPrice = opts.getBtcUsdPrice;
	const getIsOnline = opts.getIsOnline ?? (() => true);

	// Internal reactive state (rune-owned for encap + bind support; see design "full encapsulation option"
	// + wire example. Caller can destructure + use directly, or keep local $state + thin wrappers.)
	let amount = $state<string>('');
	let swapPercent = $state<number>(0);

	const amountInTokenUnits = $derived.by(() => {
		return parseAmount(amount, getSourceType());
	});

	const walletBalanceToken = $derived.by(() => {
		const bal = getWalletBalanceToken();
		return isFiniteNum(bal) ? bal : 0;
	});

	const walletBalanceDisplay = $derived.by(() => {
		const num = walletBalanceToken;
		if (!isFiniteNum(num) || num <= 0) return '0';
		if (isBtcSourceType(getSourceType())) {
			return formatSats(Math.round(num * 100_000_000));
		}
		return formatUsd(num);
	});

	const isOnline = $derived(getIsOnline());

	const isInsufficientBalance = $derived(
		amountInTokenUnits > 0 && isFiniteNum(walletBalanceToken)
			? amountInTokenUnits > walletBalanceToken
			: false
	);

	const isValidAmount = $derived(amountInTokenUnits > 0 && !isInsufficientBalance);

	const amountSats = $derived.by(() => {
		const units = amountInTokenUnits;
		if (units <= 0) return 0;
		if (isBtcSourceType(getSourceType())) {
			return Math.round(units * 100_000_000);
		}
		const price = getBtcUsdPrice();
		return isFiniteNum(price) && price > 0 ? Math.round((units / price) * 100_000_000) : 0;
	});

	function applyPercent(pct: number): void {
		const bal = walletBalanceToken;
		if (!isFiniteNum(bal) || bal <= 0) {
			d.log('applyPercent skipped (invalid bal)', { pct, bal });
			return;
		}
		swapPercent = pct;
		if (isBtcSourceType(getSourceType())) {
			amount = Math.round((pct / 100) * bal * 100_000_000).toString();
		} else {
			// USDT: 2 decimals, floor dust
			let val = (pct / 100) * bal;
			val = Math.floor(val * 100) / 100;
			amount = val.toFixed(2);
		}
		d.log('applyPercent', { pct, amount, sourceType: getSourceType() });
	}

	function setMaxAmount(): void {
		// NOTE: original (SwapForm L919-932) did triggerHaptic(ImpactStyle.Light) + Sentry.addBreadcrumb
		// (category 'wallet.swap', data with sourceType/balance). Per design ("haptics? or caller")
		// + Phase 0 (UI action layer) + bittasker-wallet safety: those stay at the call site in SwapForm
		// (MAX button handler). Rune = pure logic only. Caller:
		//   triggerHaptic...; Sentry.addBreadcrumb...; calc.setMaxAmount();
		const bal = walletBalanceToken;
		if (!isFiniteNum(bal) || bal <= 0) {
			d.log('setMaxAmount skipped (invalid bal)');
			return;
		}
		swapPercent = 100;
		if (isBtcSourceType(getSourceType())) {
			amount = Math.round(bal * 100_000_000).toString();
		} else {
			// USDT: 2 decimals, floor to avoid sub-penny dust
			let val = bal;
			val = Math.floor(val * 100) / 100;
			amount = val.toFixed(2);
		}
		d.log('setMaxAmount', { amount, sourceType: getSourceType() });
	}

	function resetAmount(): void {
		amount = '';
		swapPercent = 0;
		d.log('resetAmount');
	}

	// Bidirectional sync (amount change → pct; design + SwapForm L478). Single-writer.
	// (pct → amount is via applyPercent only.)
	$effect(() => {
		const bal = walletBalanceToken;
		const units = amountInTokenUnits;
		if (!isFiniteNum(bal) || bal <= 0 || units <= 0) {
			if (swapPercent !== 0) swapPercent = 0;
			return;
		}
		const rawPct = Math.round((units / bal) * 100);
		// Clamp to 100 — when user enters more than balance, slider shows 100%
		const pct = Math.min(100, Math.max(0, rawPct));
		if (pct !== swapPercent) {
			swapPercent = pct;
		}
	});

	// Optional debug breadcrumb (no Sentry; sync only).
	$effect(() => {
		if (import.meta.env.DEV) {
			d.log('state', {
				amount,
				swapPercent,
				units: amountInTokenUnits,
				sats: amountSats,
				insuff: isInsufficientBalance,
				source: getSourceType()
			});
		}
	});

	return {
		// Reactive states (support bind:value + $derived in consumer; rune-owned full encap per interface).
		get amount() {
			return amount;
		},
		set amount(v: string) {
			amount = v;
		},
		get swapPercent() {
			return swapPercent;
		},
		set swapPercent(v: number) {
			swapPercent = v;
		},

		get amountInTokenUnits() {
			return amountInTokenUnits;
		},
		get walletBalanceToken() {
			return walletBalanceToken;
		},
		get walletBalanceDisplay() {
			return walletBalanceDisplay;
		},
		get isInsufficientBalance() {
			return isInsufficientBalance;
		},
		get isValidAmount() {
			return isValidAmount;
		},
		get amountSats() {
			return amountSats;
		},
		get isOnline() {
			return isOnline;
		},

		applyPercent,
		setMaxAmount,
		resetAmount,

		satsUsd, // pure (re-exported)
		parseAmount
	};
}
