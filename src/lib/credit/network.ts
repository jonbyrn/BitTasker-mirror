import type { CreditNetwork } from './types';

const ALLOWED: readonly CreditNetwork[] = ['mock', 'regtest', 'signet'];

export function isCreditNetwork(value: string): value is CreditNetwork {
	return (ALLOWED as readonly string[]).includes(value);
}

/** Mainnet, and any other name, is refused. This beta never moves real funds. */
export function assertCreditNetwork(value: string): asserts value is CreditNetwork {
	if (!isCreditNetwork(value)) {
		throw new Error('BitTasker Credit runs on signet, regtest, or the test ledger only');
	}
}

export type CreditSurface = 'off' | 'live' | 'mock';

/**
 * The test ledger is available in dev, and on the sandbox host when the flag is on.
 * It stays closed on the production hostname.
 */
export function creditSurface(input: {
	enabled: boolean;
	dev: boolean;
	host: string;
	search: string;
}): CreditSurface {
	const mock = new URLSearchParams(input.search).get('creditMock') === '1';
	const host = input.host.toLowerCase();
	const sandboxHost = host === 'rgb.bittasker.com' || host === 'localhost' || host === '127.0.0.1';
	if (mock && (input.dev || (input.enabled && sandboxHost))) return 'mock';
	if (input.enabled) return 'live';
	return 'off';
}
