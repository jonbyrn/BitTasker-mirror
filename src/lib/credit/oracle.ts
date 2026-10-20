/**
 * Phase 2 price source. Escrow advances do not read a BTC price.
 * This stub exists so a later Taproot loan can take an oracle without
 * changing the advance flow.
 */
export interface PriceQuote {
	pair: 'BTC-USD';
	usd: number;
	source: 'simulated';
	asOf: number;
}

export interface PriceOracle {
	pair: 'BTC-USD';
	quote(at: number): PriceQuote;
}

export function simulatedBtcOracle(usd = 100_000): PriceOracle {
	if (!Number.isFinite(usd) || usd <= 0) throw new Error('Simulated BTC price must be positive');
	return {
		pair: 'BTC-USD',
		quote(at: number): PriceQuote {
			return {
				pair: 'BTC-USD',
				usd,
				source: 'simulated',
				asOf: at
			};
		}
	};
}
