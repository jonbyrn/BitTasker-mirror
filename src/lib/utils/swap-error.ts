/**
 * Sanitize swap error messages for user display.
 * Strips raw transaction hex, RPC error codes, and internal details.
 * Returns a translation key for known errors, or the sanitized raw message for unknown errors.
 */
export function sanitizeSwapError(raw: string | undefined | null): string {
	if (!raw) return '';
	let msg = raw.replace(/\s*\(transaction="[^"]*"\)/g, '');
	msg = msg.replace(/\s*\(code=\d+[^)]*\)/g, '');
	if (/insufficient rbtc for gas/i.test(msg)) return 'wallet.swap.error.insufficient_rsk_gas';
	if (/insufficient funds/i.test(msg)) return 'wallet.swap.error.insufficient_funds';
	if (/nonce too (low|high)/i.test(msg)) return 'wallet.swap.error.nonce_conflict';
	if (/replacement transaction underpriced/i.test(msg))
		return 'wallet.swap.error.network_congestion';
	if (/user rejected|user denied/i.test(msg)) return 'wallet.swap.error.user_rejected';
	if (/timeout|timed out/i.test(msg)) return 'wallet.swap.error.timed_out';
	if (/unsupported swap/i.test(msg)) return 'wallet.swap.error.unsupported_pair';
	if (/out of gas/i.test(msg)) return 'wallet.swap.error.out_of_gas';
	if (/insufficient allowance/i.test(msg)) return 'wallet.swap.error.insufficient_allowance';
	if (/deadline exceeded|deadline passed/i.test(msg)) return 'wallet.swap.error.deadline_exceeded';
	if (/slippage/i.test(msg)) return 'wallet.swap.error.slippage_exceeded';
	if (/liquidity/i.test(msg) && /insufficient|not enough/i.test(msg))
		return 'wallet.swap.error.insufficient_liquidity';
	msg = msg.trim();
	if (msg.length > 120) {
		msg = msg.slice(0, 117) + '...';
	}
	return msg;
}
