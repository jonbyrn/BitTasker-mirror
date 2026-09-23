export const formatSats = (sats: number | bigint = 0): string => Number(sats || 0).toLocaleString();
export const formatUsd = (amount: number = 0): string =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
export const formatAddress = (addr: string = '', start = 6, end = 4): string => {
if (!addr) return '';
if (addr.length <= start + end) return addr;
return `${addr.slice(0, start)}...${addr.slice(-end)}`;
};
