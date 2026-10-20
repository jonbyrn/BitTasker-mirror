# BitTasker Credit MVP

This file marks the Phase 1 sandbox slice. The design, threat model, and limits are in [CREDIT.md](./CREDIT.md). Event kinds are in [credit-events.md](./credit-events.md).

This is not production. It is signet, regtest, or an in-browser test ledger. It is behind `VITE_CREDIT_ENABLED`, which defaults to off and is set only on the sandbox deploy. The screen says Beta test.

Out of scope: BTC-collateral Taproot loans (a stub only), mainnet, fiat, KYC collection, and any custody of keys or USDT. Whether a KYC-free launch is legal in El Salvador is a question for Jon, not a claim this MVP makes.
