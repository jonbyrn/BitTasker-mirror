/**
 * Blockchain Toast Store — Global persistent toast for all blockchain operations.
 *
 * Tracks pending sends, swaps, and DeFi transactions in a single unified bar.
 * Replaces full-screen PendingTransactionScreen/TransactionSuccessScreen with
 * a floating toast that persists across page navigations.
 */

import { writable } from 'svelte/store';
import type { SwapType } from '$lib/utils/wallet/swapStatusMap';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlockchainToastAction {
	/** i18n key for the button label, e.g. 'wallet.toast.retry' */
	labelKey: string;
	variant: 'primary' | 'ghost' | 'error';
	onClick: () => void;
}

export interface BlockchainToastItem {
	id: string;
	type: 'send' | 'swap' | 'defi';
	status: 'pending' | 'confirming' | 'success' | 'error' | 'stale';
	network: string;
	/** Amount in base units (sats, wei, etc.) */
	amount: number;
	/** USD value at time of creation */
	amountUSD: number;
	/** Display asset name — 'rBTC', 'USDT', 'BTC' */
	asset: string;
	/** Recipient address (shortened for display) */
	recipient: string;
	/** User's wallet address — used for disconnect matching */
	sourceAddress: string | null;
	txHash: string | null;
	swapId: string | null;
	swapType: SwapType | null;
	currentBlock: number | null;
	/** Required confirmations from chain config (not time-derived) */
	requiredConfirmations: number;
	/** i18n key, not raw error message */
	error: string | null;
	/** Interpolation values for the i18n key */
	errorValues: Record<string, unknown> | null;
	createdAt: number;
	/** Internal — auto-dismiss timer handle, cancelled on status change */
	_dismissTimer: ReturnType<typeof setTimeout> | null;
	actions: BlockchainToastAction[];
}

interface BlockchainToastState {
	toasts: BlockchainToastItem[];
	expanded: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TOASTS = 10;
const SUCCESS_AUTO_DISMISS_MS = 8000;
const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─── Store ────────────────────────────────────────────────────────────────────

function createBlockchainToastStore() {
	const state = writable<BlockchainToastState>({ toasts: [], expanded: false });

	return {
		subscribe: state.subscribe,

		/**
		 * Register a new toast item. If an item with the same ID already exists,
		 * it is updated instead of duplicated. Enforces MAX_TOASTS by removing
		 * the oldest completed/errored item.
		 */
		add(item: Omit<BlockchainToastItem, 'createdAt' | '_dismissTimer'>): void {
			state.update((s) => {
				const existingIndex = s.toasts.findIndex((t) => t.id === item.id);

				if (existingIndex !== -1) {
					// Duplicate ID — update existing instead of adding
					const existing = s.toasts[existingIndex];
					const updated: BlockchainToastItem = {
						...existing,
						...item,
						createdAt: existing.createdAt,
						_dismissTimer: existing._dismissTimer
					};
					const toasts = [...s.toasts];
					toasts[existingIndex] = updated;
					return { ...s, toasts };
				}

				// Enforce max items — remove oldest completed/errored first
				const toasts = [...s.toasts];
				if (toasts.length >= MAX_TOASTS) {
					const removableIndex = toasts.findIndex(
						(t) => t.status === 'success' || t.status === 'error' || t.status === 'stale'
					);
					if (removableIndex !== -1) {
						const removable = toasts[removableIndex];
						if (removable._dismissTimer) {
							clearTimeout(removable._dismissTimer);
						}
						toasts.splice(removableIndex, 1);
					} else {
						// All items are active — remove the oldest one
						const oldest = toasts[0];
						if (oldest._dismissTimer) {
							clearTimeout(oldest._dismissTimer);
						}
						toasts.shift();
					}
				}

				const newItem: BlockchainToastItem = {
					...item,
					createdAt: Date.now(),
					_dismissTimer: null
				};
				toasts.push(newItem);

				return { ...s, toasts };
			});
		},

		/**
		 * Patch an existing toast item by ID.
		 * Named `patch` (not `update`) to avoid collision with svelte store's update().
		 * Cancels _dismissTimer if status changes away from 'success'.
		 */
		patch(id: string, changes: Partial<Omit<BlockchainToastItem, '_dismissTimer'>>): void {
			state.update((s) => {
				const toasts = s.toasts.map((t) => {
					if (t.id !== id) return t;

					const patched = { ...t, ...changes };

					// Cancel auto-dismiss timer if status changed away from 'success'
					if (changes.status && changes.status !== 'success' && t._dismissTimer) {
						clearTimeout(t._dismissTimer);
						patched._dismissTimer = null;
					}

					return patched;
				});

				return { ...s, toasts };
			});
		},

		/**
		 * Remove a toast item by ID. Clears any pending dismiss timer.
		 */
		remove(id: string): void {
			state.update((s) => {
				const item = s.toasts.find((t) => t.id === id);
				if (item?._dismissTimer) {
					clearTimeout(item._dismissTimer);
				}
				return { ...s, toasts: s.toasts.filter((t) => t.id !== id) };
			});
		},

		/**
		 * Called by the block watcher when a new block arrives.
		 * Updates currentBlock on matching 'confirming' toasts and
		 * checks for stale transactions (>10 min without block update).
		 */
		onBlock(network: string, blockNumber: number): void {
			state.update((s) => {
				const now = Date.now();
				let changed = false;
				const toasts = s.toasts.map((t) => {
					if (t.network !== network || t.status !== 'confirming') return t;

					changed = true;
					const age = now - t.createdAt;

					// Check stale timeout
					if (age > STALE_TIMEOUT_MS) {
						return { ...t, status: 'stale' as const, currentBlock: blockNumber };
					}

					return { ...t, currentBlock: blockNumber };
				});

				return changed ? { ...s, toasts } : s;
			});
		},

		/**
		 * Mark a toast as successfully confirmed. Starts auto-dismiss timer.
		 * No-op if already 'success' (prevents double-fire).
		 */
		onSuccess(id: string): void {
			state.update((s) => {
				const item = s.toasts.find((t) => t.id === id);
				if (!item || item.status === 'success') return s;

				// Cancel any existing timer
				if (item._dismissTimer) {
					clearTimeout(item._dismissTimer);
				}

				let dismissTimer: ReturnType<typeof setTimeout> | null = null;

				const toasts = s.toasts.map((t) => {
					if (t.id !== id) return t;

					// Start auto-dismiss timer
					dismissTimer = setTimeout(() => {
						state.update((current) => ({
							...current,
							toasts: current.toasts.filter((toast) => toast.id !== id)
						}));
					}, SUCCESS_AUTO_DISMISS_MS);

					return {
						...t,
						status: 'success' as const,
						_dismissTimer: dismissTimer
					};
				});

				return { ...s, toasts };
			});
		},

		/**
		 * Mark a toast as errored. Clears any auto-dismiss timer.
		 */
		onError(id: string, errorKey: string, values?: Record<string, unknown>): void {
			state.update((s) => {
				const item = s.toasts.find((t) => t.id === id);
				if (!item) return s;

				// Cancel any existing timer
				if (item._dismissTimer) {
					clearTimeout(item._dismissTimer);
				}

				const toasts = s.toasts.map((t) => {
					if (t.id !== id) return t;
					return {
						...t,
						status: 'error' as const,
						error: errorKey,
						errorValues: values ?? null,
						_dismissTimer: null
					};
				});

				return { ...s, toasts };
			});
		},

		/**
		 * Stub for checking pending receipts on app resume.
		 * Actual implementation lives in wallet-init.ts (which has provider access).
		 * This method is called by wallet-init.ts's scheduleResumeRefresh.
		 */
		checkPendingReceipts(): void {
			// Implementation lives in wallet-init.ts — the store has no provider access.
			// This stub exists so wallet-init.ts can call it uniformly.
		},

		/**
		 * Collapse the currently expanded toast. Called on Escape key press.
		 */
		dismissActive(): void {
			state.update((s) => {
				if (!s.expanded) return s;
				return { ...s, expanded: false };
			});
		},

		/**
		 * Toggle the expanded/collapsed state of the toast.
		 */
		toggleExpanded(): void {
			state.update((s) => ({ ...s, expanded: !s.expanded }));
		}
	};
}

export const blockchainToastStore = createBlockchainToastStore();
