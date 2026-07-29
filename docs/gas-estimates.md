# Gas estimates for supported swap routes

## Gas Constants

| Chain | Gas Price (default) | Simple Transfer | Contract Swap |
|-------|-------------------|-----------------|---------------|
| **RSK** | 65 gwei | 21,000 gas → **~0.00001365 RBTC** | 500,000 gas → **~0.000325 RBTC** |
| **Arbitrum** | 0.03 gwei | 65,000 gas | 300,000 gas |

Gas prices are fetched live via `eth_gasPrice` RPC (`public-node.rsk.co` and `arb1.arbitrum.io/rpc`) in `src/lib/utils/swap-gas.ts`. The defaults above are fallbacks when RPC is unreachable.

---

## Provider Fee Ranges

| Provider | Fee % | Type |
|----------|-------|------|
| **Direct** | 0% | Same-chain transfer |
| **Boltz** | 0.1–0.5% | Chain swap / submarine / reverse |
| **Symbiosis** | 0.3% | Cross-chain DEX aggregator |
| **LI.FI** | 0.5% | Cross-chain bridge aggregator |
| **Changelly** | 0.25% | CEX exchange |
| **Uniswap V3** | ~0.3% | Same-chain DEX |

---

## All Routes with Fee Estimates

### rBTC Source
| Route | Destination | Providers | Fee % | Est. Time |
|-------|-------------|-----------|-------|-----------|
| `rbtc-to-rbtc-direct` | RSK (same) | direct | 0% | 0-1 min |
| `rbtc-to-lightning-via-boltz` | Lightning | boltz (submarine) | 0.1% | 1-5 min |
| `rbtc-to-btc-via-boltz` | BTC on-chain | boltz (chain) | 0.1% | 1-5 min |
| `rbtc-to-bsc-via-symbiosis` | BSC USDT | symbiosis | 0.3% | 1-5 min |
| `rbtc-to-bsc-via-lifi` | BSC USDT | lifi | 0.5% | 1-5 min |
| `rbtc-to-wbtc-arb-via-boltz-symbiosis` | WBTC Arb | boltz + symbiosis | ~0.4% | 5-15 min |
| `rbtc-to-wbtc-arb-via-boltz-lifi` | WBTC Arb | boltz + lifi | ~0.6% | 5-15 min |
| `rbtc-to-usdt0-arb-via-boltz-symbiosis` | USDT0 Arb | boltz + symbiosis | ~0.4% | 5-15 min |
| `rbtc-to-usdt-tron-via-lifi` | USDT Tron | lifi | 0.5% | 1-5 min |
| `rbtc-to-usdt-tron-via-symbiosis` | USDT Tron | symbiosis | 0.3% | 1-5 min |

### USDT (BSC) Source
| Route | Destination | Providers | Fee % | Est. Time |
|-------|-------------|-----------|-------|-----------|
| `usdt-to-bsc-direct` | BSC (same) | direct | 0% | ~1 sec |
| `usdt-to-rbtc-via-symbiosis` | RSK RBTC | symbiosis | 0.3% | 1-5 min |
| `usdt-to-rbtc-via-lifi` | RSK RBTC | lifi | 0.5% | 1-5 min |
| `usdt-to-lightning-via-changelly-boltz` | Lightning | changelly + boltz | ~1.13% | 5-15 min |
| `usdt-to-btc-via-symbiosis` | BTC on-chain | symbiosis | 0.3% | 1-5 min |
| `usdt-to-btc-via-lifi` | BTC on-chain | lifi | 0.5% | 1-5 min |
| `usdt-to-btc-via-changelly` | BTC on-chain | changelly | 0.25% | 1-5 min |

### USDT0 (RSK) Source
| Route | Destination | Providers | Fee % | Est. Time |
|-------|-------------|-----------|-------|-----------|
| `usdt0-rsk-to-rbtc-via-symbiosis` | RSK RBTC | symbiosis | 0.3% | 1-5 min |
| `usdt0-rsk-to-bsc-via-symbiosis` | BSC USDT | symbiosis | 0.3% | 1-5 min |
| `usdt0-rsk-to-lightning-via-symbiosis-boltz` | Lightning | symbiosis + boltz | ~0.4% | 5-15 min |
| `usdt0-rsk-to-btc-via-symbiosis-boltz` | BTC on-chain | symbiosis + boltz | ~0.4% | 5-15 min |

### USDT0 (Arbitrum) Source
| Route | Destination | Providers | Fee % | Est. Time |
|-------|-------------|-----------|-------|-----------|
| `usdt0-arb-to-usdt0-arb-direct` | Arb (same) | direct | 0% | 0-1 min |
| `usdt0-arb-to-rbtc-via-symbiosis` | RSK RBTC | symbiosis | 0.3% | 1-5 min |
| `usdt0-arb-to-rbtc-via-lifi` | RSK RBTC | lifi | 0.5% | 1-5 min |
| `usdt0-arb-to-rbtc-via-symbiosis-boltz` | RSK RBTC | symbiosis + boltz | ~0.4% | 5-15 min |
| `usdt0-arb-to-btc-via-symbiosis-boltz` | BTC on-chain | symbiosis + boltz | ~0.4% | 5-15 min |

### BTC on-chain Source
| Route | Destination | Providers | Fee % | Est. Time |
|-------|-------------|-----------|-------|-----------|
| `btc-onchain-direct` | BTC (same) | direct | 0% | 10-30 min |
| `btc-to-rbtc-via-boltz` | RSK RBTC | boltz (chain) | 0.5% | 10-30 min |
| `btc-to-usdt0-arb-via-boltz` | USDT0 Arb | boltz + lifi | ~0.8% | 15-45 min |

### WBTC (Arbitrum) Source
| Route | Destination | Providers | Fee % | Est. Time |
|-------|-------------|-----------|-------|-----------|
| `wbtc-to-usdt0-arb-via-symbiosis` | USDT0 Arb | symbiosis | 0.3% | 1-2 min |
| `wbtc-to-tbtc-arb-via-symbiosis` | tBTC Arb | symbiosis | 0.3% | 1-2 min |

### tBTC (Arbitrum) Source
| Route | Destination | Providers | Fee % | Est. Time |
|-------|-------------|-----------|-------|-----------|
| `tbtc-to-wbtc-arb-via-symbiosis` | WBTC Arb | symbiosis | 0.3% | 1-2 min |
| `tbtc-to-usdt0-arb-via-symbiosis` | USDT0 Arb | symbiosis | 0.3% | 1-2 min |
| `tbtc-to-rbtc-via-boltz` | RSK RBTC | boltz (chain) | 0.1% | 1-5 min |

### DOC (RSK) Source
| Route | Destination | Providers | Fee % | Est. Time |
|-------|-------------|-----------|-------|-----------|
| `doc-rsk-to-rbtc-via-symbiosis` | RSK RBTC | symbiosis | 0.3% | 1-5 min |
| `doc-rsk-to-bsc-via-symbiosis` | BSC USDT | symbiosis (2-hop) | ~0.6% | 2-10 min |
| `doc-rsk-to-lightning-via-symbiosis-boltz` | Lightning | symbiosis + boltz | ~0.4% | 5-15 min |
| `doc-rsk-to-btc-via-symbiosis-boltz` | BTC on-chain | symbiosis + boltz | ~0.4% | 5-15 min |

---

## Gas-to-Sats Conversion

- **RSK**: `sats = gasCostWei / 10,000,000,000n` (1 sat = 10^10 wei)
- **Arbitrum**: `sats = (gasCostEth × ethUsdPrice / btcUsdPrice) × 100,000,000` (requires live ETH/BTC prices)

## Route Ranking

Routes are ranked by **total cost in sats**: `totalCost = gasCostSats + bridgeFeeSats`. Tiebreaker: fewer hops wins.

Key source files:
- `src/lib/services/route-resolver.ts` — master route table
- `src/lib/utils/swap-gas.ts` — live gas price fetching
- `src/lib/runes/use-swap-routes.svelte.ts` — gas math + fee derivation
- `src/lib/services/BoltzProvider.ts` — Boltz API integration

---

