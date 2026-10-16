/** Keep the previous balance when a scan or asset list failed. */
export function applyBalanceUpdate<T extends { balanceSats: number; assets: readonly unknown[] }>(
	current: T,
	next: { balanceSats: number | null; assets: T['assets'] | null }
): T {
	return {
		...current,
		...(next.balanceSats === null ? {} : { balanceSats: next.balanceSats }),
		...(next.assets === null ? {} : { assets: next.assets })
	};
}
