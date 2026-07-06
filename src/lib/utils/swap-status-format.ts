/**
 * Swap status formatting utilities for PendingSwaps component.
 * All user-facing strings use the provided translation function.
 */

/** Translation function signature matching svelte-i18n's $t() */
export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/** Formatted status info returned by status formatters */
export interface SwapStatusInfo {
	label: string;
	message: string;
	color: string;
	icon: string;
}

/** Minimal chain swap state for status formatting (avoids coupling to SwapChainState type) */
export interface ChainSwapStatusInput {
	phase: string;
	isFailed: boolean;
	isPartial: boolean;
	error?: string | null;
}

// ── i18n key prefixes ──────────────────────────────────────────────────
const PS = 'wallet.pending_swaps';
const SPS = 'wallet.swap.pending_swaps';

// ── Reverse swap status ────────────────────────────────────────────────

/**
 * Returns display info for a reverse swap status.
 * Uses wallet.swap.pending_swaps.* keys for labels/messages.
 */
export function getReverseSwapStatusInfo(status: string, t: TranslateFn): SwapStatusInfo {
	switch (status) {
		case 'pending':
			return {
				label: t(`${SPS}.status_waiting`),
				message: t(`${SPS}.msg_waiting`),
				color: 'badge-warning',
				icon: 'bg-warning'
			};
		case 'claimable':
			return {
				label: t(`${SPS}.status_claimable`),
				message: t(`${SPS}.msg_claimable`),
				color: 'badge-success',
				icon: 'bg-success'
			};
		case 'claiming':
			return {
				label: t(`${SPS}.status_claiming`),
				message: t(`${SPS}.msg_claiming`),
				color: 'badge-info',
				icon: 'bg-info'
			};
		case 'claimed':
			return {
				label: t(`${SPS}.status_claimed`),
				message: t(`${SPS}.msg_claimed`),
				color: 'badge-success',
				icon: 'bg-success'
			};
		case 'expired':
			return {
				label: t(`${SPS}.status_expired`),
				message: t(`${SPS}.msg_expired`),
				color: 'badge-error',
				icon: 'bg-error'
			};
		case 'failed':
			return {
				label: t(`${SPS}.status_failed`),
				message: t(`${SPS}.msg_failed_generic`),
				color: 'badge-error',
				icon: 'bg-error'
			};
		default:
			return {
				label: t(`${PS}.status_unknown`),
				message: t(`${SPS}.msg_unknown`),
				color: 'badge-ghost',
				icon: 'bg-base-content/30'
			};
	}
}

// ── Chain swap status ──────────────────────────────────────────────────

/**
 * Returns display info for a chain swap state.
 * Uses wallet.swap.pending_swaps.* keys for chain status labels/messages.
 */
export function getChainSwapStatusInfo(
	state: ChainSwapStatusInput,
	t: TranslateFn
): SwapStatusInfo {
	if (state.isFailed) {
		return {
			label: t(`${SPS}.chain_status_failed`),
			message: state.error
				? t(`${SPS}.chain_msg_failed`, { error: state.error })
				: t(`${SPS}.chain_msg_failed_generic`),
			color: 'badge-error',
			icon: 'bg-error'
		};
	}
	if (state.isPartial) {
		return {
			label: t(`${SPS}.chain_status_partial`),
			message: t(`${SPS}.chain_msg_partial`),
			color: 'badge-warning',
			icon: 'bg-warning'
		};
	}
	switch (state.phase) {
		case 'SWAP_1_PENDING':
			return {
				label: t(`${SPS}.chain_status_locking`),
				message: t(`${SPS}.chain_msg_swap_1_pending`),
				color: 'badge-warning',
				icon: 'bg-warning animate-pulse'
			};
		case 'SWAP_1_CONFIRMED':
			return {
				label: t(`${SPS}.chain_status_processing`),
				message: t(`${SPS}.chain_msg_swap_1_confirmed`),
				color: 'badge-info',
				icon: 'bg-info animate-pulse'
			};
		case 'SWAP_2_PENDING':
			return {
				label: t(`${SPS}.chain_status_claiming`),
				message: t(`${SPS}.chain_msg_swap_2_pending`),
				color: 'badge-warning',
				icon: 'bg-warning animate-pulse'
			};
		case 'SWAP_2_CONFIRMED':
			return {
				label: t(`${SPS}.chain_status_swapping`),
				message: t(`${SPS}.chain_msg_swap_2_confirmed`),
				color: 'badge-info',
				icon: 'bg-info animate-pulse'
			};
		default:
			return {
				label: t(`${SPS}.chain_status_in_progress`),
				message: t(`${SPS}.chain_msg_processing`),
				color: 'badge-info',
				icon: 'bg-info animate-pulse'
			};
	}
}

// ── Formatting helpers ─────────────────────────────────────────────────

/**
 * Format satoshis with localized unit.
 */
export function fmtSats(sats: number, t: TranslateFn): string {
	return `${sats.toLocaleString()} ${t(`${PS}.sats_unit`)}`;
}

/**
 * Format a timestamp as a relative time string (e.g. "5m ago", "2h ago").
 */
export function fmtTime(timestamp: number, t: TranslateFn): string {
	const diff = Date.now() - timestamp;
	const min = Math.floor(diff / 60_000);
	if (min < 1) return t(`${SPS}.just_now`);
	if (min < 60) return t(`${SPS}.time_m_ago`, { min: String(min) });
	const hr = Math.floor(min / 60);
	if (hr < 24) return t(`${SPS}.time_h_ago`, { hr: String(hr) });
	const day = Math.floor(hr / 24);
	return t(`${SPS}.time_d_ago`, { day: String(day) });
}
