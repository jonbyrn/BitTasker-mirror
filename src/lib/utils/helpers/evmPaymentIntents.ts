const WEI_PER_SAT = 10_000_000_000n;
const BSC_USDT_DECIMALS = 6;

type EvmDirectNetwork = 'rootstock-bitcoin' | 'usdt-bsc';

interface BuildDirectPaymentUriParams {
	address: string;
	network: EvmDirectNetwork;
	amount?: number;
	memo?: string;
}

function isQualifiedEvmUri(address: string): boolean {
	return /^(rsk|bsc|ethereum):/i.test(address);
}

export function buildDirectPaymentUri({
	address,
	network,
	amount,
	memo
}: BuildDirectPaymentUriParams): string {
	const trimmedAddress = address.trim();
	if (!trimmedAddress) {
		return '';
	}

	if (isQualifiedEvmUri(trimmedAddress)) {
		return trimmedAddress;
	}

	const scheme = network === 'usdt-bsc' ? 'bsc' : 'rsk';
	const params = new URLSearchParams();

	if (network === 'rootstock-bitcoin' && typeof amount === 'number' && amount > 0) {
		params.set('value', (BigInt(Math.floor(amount)) * WEI_PER_SAT).toString());
	}

	if (network === 'usdt-bsc' && typeof amount === 'number' && amount > 0) {
		params.set('amount', amount.toFixed(BSC_USDT_DECIMALS).replace(/\.?0+$/, ''));
	}

	if (memo) {
		params.set(network === 'usdt-bsc' ? 'memo' : 'message', memo);
	}

	const query = params.toString();
	return query ? `${scheme}:${trimmedAddress}?${query}` : `${scheme}:${trimmedAddress}`;
}
