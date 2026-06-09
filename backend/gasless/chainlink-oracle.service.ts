// Chainlink Price Oracle Service — Manipulation-resistant token/USD pricing
// Based on plan Section 4.12

import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import {
	ETH_USD_FEED,
	BTC_USD_FEED,
	MAX_ORACLE_STALENESS,
	getTokenInfo,
	ARBITRUM_CHAIN_ID
} from './gasless.config';

// Chainlink Aggregator V3 ABI (minimal)
const AGGREGATOR_ABI = [
	'function latestRoundData() view returns (int256 answer, uint256 startedAt, uint256 updatedAt, uint256 answeredInRound)',
	'function decimals() view returns (uint8)'
];

@Injectable()
export class ChainlinkOracleService {
	private readonly logger = new Logger(ChainlinkOracleService.name);
	private readonly provider: ethers.JsonRpcProvider;
	private readonly ethUsdFeed: ethers.Contract;
	private readonly btcUsdFeed: ethers.Contract;
	private readonly priceCache: Map<string, { price: bigint; timestamp: number }> = new Map();
	private readonly CACHE_TTL = 60_000; // 1 minute cache

	// USDT0 is pegged to $1.00 — constant price, no oracle needed
	private readonly USDT0_PRICE_18_DEC = 1_000_000_000_000_000_000n; // $1.00 in 18 decimals

	constructor() {
		const rpcUrl = process.env['ARBITRUM_RPC_URL'] || 'https://arb1.arbitrum.io/rpc';
		this.provider = new ethers.JsonRpcProvider(rpcUrl);
		this.ethUsdFeed = new ethers.Contract(ETH_USD_FEED, AGGREGATOR_ABI, this.provider);
		this.btcUsdFeed = new ethers.Contract(BTC_USD_FEED, AGGREGATOR_ABI, this.provider);
	}

	async getTokenPriceUSD(tokenAddress: string): Promise<bigint> {
		const token = getTokenInfo(tokenAddress);

		// Check cache first
		const cached = this.priceCache.get(token.symbol);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.price;
		}

		let price: bigint;

		if (token.symbol === 'USDT0') {
			// USDT0 is pegged to $1.00 — return constant price
			// No oracle call needed; avoids staleness risk for stablecoins
			price = this.USDT0_PRICE_18_DEC;
		} else if (token.symbol === 'WBTC' || token.symbol === 'TBTC') {
			price = await this.getBtcPrice();
		} else {
			throw new Error(`Unknown token for price lookup: ${token.symbol}`);
		}

		// Cache the price
		this.priceCache.set(token.symbol, { price, timestamp: Date.now() });
		return price;
	}

	private async getBtcPrice(): Promise<bigint> {
		const roundData = await this.btcUsdFeed.latestRoundData();
		this.checkStaleness(roundData, 'BTC/USD');

		// Chainlink BTC/USD has 8 decimals, normalize to 18 decimals
		// price_18 = answer * 10^10
		const answer = BigInt(roundData[0]);
		return answer * 10_000_000_000n; // * 10^10
	}

	private checkStaleness(data: any, feedName: string): void {
		const updatedAt = Number(data.updatedAt);
		const staleness = Math.floor(Date.now() / 1000) - updatedAt;
		if (staleness > MAX_ORACLE_STALENESS) {
			throw new Error(
				`${feedName} price data is stale (${staleness}s old, max ${MAX_ORACLE_STALENESS}s)`
			);
		}
	}

	// Clear cache (for testing)
	clearCache(): void {
		this.priceCache.clear();
	}
}
