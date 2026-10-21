/** Public BTC price for the sats line. Failure leaves the price in USD only. */
export async function loadBtcUsd(): Promise<number> {
	try {
		const response = await fetch('https://mempool.space/api/v1/prices');
		if (!response.ok) return 0;
		const body = (await response.json()) as { USD?: unknown };
		const usd = Number(body.USD);
		return Number.isFinite(usd) && usd > 0 ? usd : 0;
	} catch {
		return 0;
	}
}
