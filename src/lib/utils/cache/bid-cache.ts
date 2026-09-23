import type { NostrEvent } from 'nostr-tools';

type Entry = { value: NostrEvent[]; expiresAt: number };
const taskBids = new Map<string, Entry>();
const userBids = new Map<string, Entry>();

function get(map: Map<string, Entry>, key: string): NostrEvent[] | null {
	const entry = map.get(key);
	if (!entry || entry.expiresAt < Date.now()) {
		map.delete(key);
		return null;
	}
	return entry.value;
}

function set(
	map: Map<string, Entry>,
	key: string,
	value: NostrEvent[],
	ttlMinutes: number
): NostrEvent[] {
	map.set(key, { value, expiresAt: Date.now() + ttlMinutes * 60_000 });
	return value;
}

export const smartCache = {
	getBidsForTask: (key: string) => get(taskBids, key),
	setBidsForTask: (key: string, value: NostrEvent[], ttl: number) => set(taskBids, key, value, ttl),
	getBidsByUser: (key: string) => get(userBids, key),
	setBidsByUser: (key: string, value: NostrEvent[], ttl: number) => set(userBids, key, value, ttl),
	invalidateTaskBids: (key: string) => taskBids.delete(key),
	clearUserBids: () => userBids.clear(),
	clearBids: () => {
		taskBids.clear();
		userBids.clear();
	}
};

const conversions = new Map<string, number>();
export const currencyCache = {
	getConversion: (usd: number, btcPrice: number): number | null =>
		conversions.get(`${usd}:${btcPrice}`) ?? null,
	setConversion: (usd: number, btcPrice: number): number => {
		const sats = Math.round((usd / btcPrice) * 100_000_000);
		conversions.set(`${usd}:${btcPrice}`, sats);
		return sats;
	},
	batchConvert: (amounts: number[], btcPrice: number): number[] =>
		amounts.map((usd) => {
			const key = `${usd}:${btcPrice}`;
			return conversions.get(key) ?? currencyCache.setConversion(usd, btcPrice);
		}),
	clear: () => conversions.clear()
};
