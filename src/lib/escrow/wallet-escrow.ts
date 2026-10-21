import { get } from 'svelte/store';
import { ContractRune, type ContractRuneSnapshot } from '$lib/runes/contract.svelte';
import { closeEscrowHold, recordEscrowHistory } from '$lib/stores/wallet/escrow-history';
import { state, walletStore } from '$lib/stores/wallet/wallet-state';
import type { PaymentSplitConfig } from '$lib/types/rgb-contract';

export type WalletAsset = 'usdt' | 'btc';

const RELEASED = new Set(['released', 'releasing', 'settled', 'refunded']);

export interface HoldLabel {
	title?: string;
	collectBy?: number;
	language?: string;
}

export function walletSplit(asset: WalletAsset): PaymentSplitConfig {
	if (asset === 'btc') {
		return {
			primaryAsset: 'btc_lightning',
			primaryPercentage: 100,
			secondaryAsset: 'usdt_rgb',
			secondaryPercentage: 0
		};
	}
	return {
		primaryAsset: 'usdt_rgb',
		primaryPercentage: 100,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 0
	};
}

export function heldForLabel(title: string, collectBy: number, language: string): string {
	const spanish = language.startsWith('es');
	const name = title.trim() || (spanish ? 'artículo' : 'item');
	if (!(collectBy > 0)) return spanish ? `Retenido: ${name}` : `Held for: ${name}`;
	const formatted = new Intl.DateTimeFormat(spanish ? 'es' : 'en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(collectBy * 1000));
	return spanish
		? `Retenido: ${name}, recoger antes del ${formatted}`
		: `Held for: ${name}, collect by ${formatted}`;
}

function viewerLanguage(): string {
	if (typeof localStorage === 'undefined') return 'en';
	return localStorage.getItem('CapacitorStorage.locale') || 'en';
}

export function coversWalletPayment(input: {
	asset: WalletAsset;
	amountUsd: number;
	amountSats: number;
	usdtUnits: number;
	sats: number;
}): boolean {
	if (input.asset === 'btc') return input.sats >= Math.max(1, Math.floor(input.amountSats));
	return input.usdtUnits >= Math.max(1, Math.round(input.amountUsd * 1_000_000));
}

export function readWalletBalances(): { usdtUnits: number; sats: number } {
	const totals = get(walletStore).totalBalances;
	return {
		usdtUnits: Number(totals?.usdt) || 0,
		sats: Number(totals?.sats) || 0
	};
}

export function openWalletContract(input: {
	contractId: string;
	title: string;
	amountUsd: number;
	amountSats?: number;
	asset: WalletAsset;
	partyPubkeys: string[];
}): ContractRune {
	const existing = ContractRune.get(input.contractId);
	if (existing) return existing;
	return new ContractRune({
		contractId: input.contractId,
		contractTitle: input.title,
		totalAmountUsd: input.amountUsd,
		amountSats: input.asset === 'btc' ? input.amountSats : undefined,
		lockedAmount: input.amountUsd,
		lockedCurrency: 'USD',
		split: walletSplit(input.asset),
		partyPubkeys: input.partyPubkeys
	});
}

function asWalletError(error: unknown): Error {
	const message = error instanceof Error ? error.message : String(error);
	if (/wallet is not initialized|rgb wallet/i.test(message)) return new Error('wallet-closed');
	return error instanceof Error ? error : new Error(message);
}

function rememberHold(rune: ContractRune, hold?: HoldLabel): void {
	try {
		const contractId = typeof rune.contractId === 'string' ? rune.contractId : '';
		if (!contractId) return;
		const asset: WalletAsset = rune.split?.primaryAsset === 'btc_lightning' ? 'btc' : 'usdt';
		const amountUsd = Number(rune.totalAmountUsd) || 0;
		const amountSats = Number(rune.amountSats) || 0;
		const title = hold?.title?.trim() || rune.contractTitle || contractId;
		recordEscrowHistory({
			contractId,
			title,
			kind: 'lock',
			description: heldForLabel(title, hold?.collectBy ?? 0, hold?.language || viewerLanguage()),
			amountSats: asset === 'btc' ? amountSats : 0,
			assetUnits: asset === 'usdt' ? Math.round(amountUsd * 1_000_000) : undefined
		});
	} catch (error) {
		console.warn(
			'[wallet-escrow] hold was not listed',
			error instanceof Error ? error.message : String(error)
		);
	}
}

/** The only spend from the BitTasker Wallet into escrow. */
export async function payFromWallet(
	rune: ContractRune,
	hold?: HoldLabel
): Promise<ContractRuneSnapshot> {
	try {
		const paid = await rune.payFundingFromWallet();
		if (paid && (paid.status === 'funded' || paid.status === 'locked')) rememberHold(rune, hold);
		return paid;
	} catch (error) {
		throw asWalletError(error);
	}
}

/** Prepare, pay, and confirm one escrow from the open wallet. */
export async function fundFromWallet(
	rune: ContractRune,
	hold?: HoldLabel
): Promise<ContractRuneSnapshot> {
	if (!state.utexoWallet) throw new Error('wallet-closed');
	try {
		if (rune.status === 'draft' || rune.status === 'failed') await rune.prepareFunding();
		if (rune.status === 'funding') await payFromWallet(rune, hold);
		if (rune.status === 'funding' || rune.status === 'locked') await rune.confirmFunding();
	} catch (error) {
		throw asWalletError(error);
	}
	if (rune.status !== 'funded') throw new Error('escrow-pending');
	if (rune.status === 'funded') rememberHold(rune, hold);
	return rune.snapshot;
}

export async function disputeEscrow(rune: ContractRune, reason: string): Promise<void> {
	if (rune.status !== 'funded') throw new Error('fund-first');
	await rune.dispute(reason);
}

/** Release a funded escrow to one invoice. A dispute blocks this. */
export async function releaseEscrow(
	rune: ContractRune,
	invoice: string,
	units: number,
	note: string
): Promise<ContractRuneSnapshot> {
	if (rune.status === 'disputed') throw new Error('disputed');
	const payout = invoice.trim();
	if (!payout) throw new Error('invoice');
	const amount = Math.max(1, Math.floor(units));
	try {
		if (rune.status === 'funded') await rune.startWork();
		if (rune.status === 'work_in_progress') await rune.submitWork(note);
		if (rune.status === 'work_submitted') await rune.approveWork();
		if (rune.status === 'approved') await rune.requestSettlement(payout, amount);
		if (rune.status === 'approved' || rune.status === 'settlement_requested') {
			await rune.releaseEscrow(payout);
		}
	} catch (error) {
		throw asWalletError(error);
	}
	if (!RELEASED.has(rune.status)) throw new Error(rune.error || 'release-failed');
	closeEscrowHold(rune.contractId);
	return rune.snapshot;
}

/** Second payout after the first share has already left escrow. */
export async function refundEscrow(
	rune: ContractRune,
	invoice: string,
	units: number
): Promise<ContractRuneSnapshot> {
	if (rune.status === 'disputed') throw new Error('disputed');
	const paid = await rune.refund(invoice, units);
	closeEscrowHold(rune.contractId);
	return paid;
}
