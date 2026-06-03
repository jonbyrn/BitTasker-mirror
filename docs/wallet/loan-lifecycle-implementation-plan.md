# Loan Lifecycle Implementation Plan — Full Borrow Drawer + Positions (Aave V3 Arbitrum)

**Status**: Ready for execution (post swarm-audited v1 borrow preview at 95%+).  
**Date**: 2026-06 (based on session context)  
**Branch context**: feat/usdt-abstractionkit (with staged wallet/DeFi connector changes)  
**Core References (full reads verified)**:
- `src/lib/services/defi/aave.service.ts` (complete — getUserAccountData, supply/borrow/repay/withdraw, ray helpers, UserAccountData interface, ReserveConfig, good Sentry/tryCatch).
- `src/lib/components/wallet/BorrowFlowDrawer.svelte` (thin wrapper, isSubmitting passthrough to base Drawer).
- `src/lib/components/wallet/defi/BorrowStep.svelte` (live rates, WalletSelector first-class for builtin+connected, hardened $derived.by guards, HealthFactorGauge reuse, fee collapse exact WalletSelector accordion parity, i18n, offline, 5-state foundations).
- `src/lib/components/wallet/defi/DefiPositionCard.svelte` (current placeholder: "In production, query getUserAccountData...", used in BalanceCard.svelte).
- `src/lib/components/wallet/defi/HealthFactorGauge.svelte` (role=meter, full aria + i18n interpolation, reusable).
- `src/lib/tests/services/aave-service.test.ts` (strict London TDD Red example with hoisted ethers Contract/JsonRpcProvider mocks).
- `src/lib/stores/wallet.store.ts` + `connectedWalletsStore` + builtin-wallet-tier2 (DeFi balance processing for arbWbtc/arbUsdt0, per-wallet assets).
- `src/routes/(protected)/dashboard/wallet/+page.svelte` (drawer usage + BalanceCard integration point).
- `.cursor/commands/plan.md` (this document follows its exact required structure).
- Precedent: `docs/earn-drawer-audit-report.md` (swarm audit tone, verification discipline).

**GitNexus note (mandatory per AGENTS.md)**: Index 472 commits stale at time of plan creation (CLI npx analyze encountered package resolution issue in harness). Primary exploration used direct full-file reads + grep + code-index (current). **All implementation must start with `npx gitnexus analyze` on a dev machine, followed by gitnexus__detect_changes + impact() on every symbol before edit.**

---

## 1. Context & Problem (1–2 sentences)

The borrow drawer (BorrowFlowDrawer + BorrowStep) and HealthFactorGauge were swarm-iterated (multiple waves of 7+ specialized agents + re-audits) until collective self-reported >=0.95 confidence across UI/visual parity (exact WalletSelector "From" accordion styling for fee/IL collapses), DeFi integration (live AaveService.getVariableBorrowAPR wired, hardened math, offline guards, isSubmitting threading), Svelte 5 runes best practices, a11y/i18n (full $t + aria on gauge), TDD (5-state component + pure fn tests), and security/financial safety. However, the *full loan lifecycle* is missing: accurate Aave V3 mechanics require explicit supply/collateralize (wBTC) *before* borrow against a specific address; positions are strictly per `onBehalfOf` address (getUserAccountData); there is no atomic cross-asset "repay with collateralized wBTC" (must safe-withdraw → swap → repay); DefiPositionCard is a non-functional placeholder; no dashboard, no per-wallet (builtin vs connected EIP-1193) position management (repay/add/withdraw/close), no Max Safe Withdraw enforcement, and no guided secondary path education. User explicitly requested this plan after confirming accurate mechanics and seeing the updated New Loan Wizard mockups.

## 2. Goals & Success Criteria (testable assertions / test cases)

- **Functional completeness**: User can (a) select any connected or builtin wallet/address first, (b) explicitly supply wBTC collateral (or see existing per-address position), (c) borrow USDT0 (or configured asset) with live preview driven by real getUserAccountData, (d) view/manage per-address positions in wallet section dashboard, (e) repay/add collateral/safe-withdraw/close with correct HF/LTV/liquidation price previews and enforcement, (f) follow a clear guided "repay via collateral" path (safe withdraw + existing swap + repay) without false promises of atomicity.
- **Data model**: All positions and operations are explicitly per (walletId + address + chain). No "global" loan state. Signing context always visible ("This will be signed by MetaMask 0x7f3a... (Arbitrum)").
- **Risk UX (Bitcoin-native)**: Health Factor is primary (color/status/aria as current gauge), prominently supported by LTV % and "BTC Liquidation Price: $XX,XXX" (the actionable killer feature for BTC holders). No misleading "1.2x is safe" without context.
- **Visual & pattern parity**: 100% match to audited wallet section (WalletSelector accordion exact classes + min-h-[44px], AmountInputSection patterns, fee collapse styling from BorrowStep:252-287, BalanceCard, daisyUI semantic tokens, touch targets, no inline styles, responsive).
- **Svelte 5 + quality**: All new code uses $state/$derived/$derived.by (with isFinite + boundary guards), $effect/onMount for side effects only, no legacy patterns. svelte-autofixer clean on every .svelte.
- **TDD + coverage (London School)**: 
  - All new pure calculation functions (maxSafeWithdraw, calcLiquidationPriceBtc, derivePositionHealth, etc.) have Red-Green-Refactor unit tests *before* use (90%+ branch coverage) following aave-service.test.ts hoisted ethers mock pattern.
  - All new or heavily extended components (wizard steps, evolved DefiPositionCard, management forms) have tests covering the 5 states (empty / loading skeletons / error soft alert with retry / populated with live data / edge: HF=1.0, price=0, zero debt, offline, connected signer fail).
  - Integration tests for happy path + 2 failure paths (network error, insufficient collateral post-supply, approval race, partial safe withdraw).
- **Verification gates (enforced, no exceptions)**: After every change batch: `npm run check` (0 new errors in touched files), `npm run lint` (0 warnings), `python3 scripts/find-missing-translations.py --fix-suggestions` (0 missing), targeted test suite (`npm run test:unit:components` etc. for area) + relevant full suite before phase complete, GitNexus detect_changes + impact review, manual 5-state + a11y spot check. Full swarm re-audit waves (7 dimensions) at end of Phases 2, 4, and 5 until collective >=0.95 self-report.
- **Resilience & safety**: Offline fail-closed on all CTAs and rate loads. tx isSubmitting prevents drawer dismiss. Explicit approve + tx flows with receipt polling + Arbiscan links. All async wrapped in tryCatch + Sentry breadcrumbs. No private key exposure. Boundary validation on all Aave responses and user inputs.
- **i18n & a11y**: 100% user strings via $t() (no raw English). HealthFactorGauge aria pattern extended everywhere. Keyboard nav, focus traps on drawers/modals, WCAG AA minimum.
- **Performance/Platform**: No unnecessary polls (on-demand per address + smart cache). Capacitor guards where any native plugin used (none expected for pure EVM reads/writes via injected providers). Works on web + native (iOS/Android) via existing patterns.
- **Out-of-scope items explicitly not regressed**: Existing simple borrow preview (v1 BorrowStep) continues to function as a "quick borrow" entry point (or is cleanly evolved into the wizard).

## 3. Scope (in / out) — explicit

**In scope (MVP for full lifecycle)**:
- Per-address Aave V3 position model + loading/caching (builtin + connected EIP-1193 wallets on Arbitrum).
- AaveService extensions (pure exported calcs for Max Safe Withdraw, BTC liquidation price, post-action HF preview; any minor enhancements for allowance/readiness).
- DefiPositionCard evolution + BalanceCard integration + wallet dashboard/positions surface.
- Full New Loan Wizard (5 steps, wallet-first, supply explicit, borrow preview with real getUserAccountData, review with signer context, success).
- Position management: Repay (partial/max), Add Collateral, Withdraw (Max Safe only with enforcement + preview), Close (compound flow with confirm).
- Guided secondary path education + handoff to existing SwapForm/Uniswap service for "repay with collateral" (no atomic promise).
- All supporting: types, stores/runes, i18n keys + verified translations, tests (unit + integration + E2E for critical journeys), hardening (approvals, tx resilience, errors, offline).
- Swarm re-audit discipline + all verification gates.
- Documentation of the plan itself (this file) and any needed inline comments.

**Out of scope / deferred (explicit — do not expand mid-impl without new request + re-plan)**:
- Other protocols or chains (only Arbitrum Aave V3 wBTC collateral / USDT0 borrow pair for v1 lifecycle).
- Stable borrow rate (variable only, as current service + BorrowStep).
- Liquidation monitoring, alerts, or keeper integration.
- Advanced multi-collateral or cross-margin.
- New wallet connection UX (reuse existing connectedWalletsStore + metamask-connector patterns).
- Flash-loan or atomic repay-with-collateral (not supported for this pair without complexity; guided path is the correct safe UX).
- Mainnet/Ethereum Aave deployment or other reserves.
- Full position history or P&L charts (basic current state sufficient).
- Gasless or meta-tx relays for these flows (future payments-v2 work can integrate).
- Any changes to unrelated wallet flows (bolt12, Lightning, RSK, etc.) beyond what's needed for DeFi parity.

**Assumptions (to be validated in Phase 0 spike if not already confirmed)**:
- ERC-20 approve UX/patterns already exist in the app (for USDT0/wBTC on Arbitrum) or are simple enough to add following existing send/approve flows.
- btcPrice rune + crypto-price.service provide sufficient oracle for liquidation price calc (conservative buffer recommended).
- getEvmSigner (or equivalent) from connected wallet connectors provides a usable ethers.Signer for Aave write calls on the correct chain.

## 4. Approach & Recommendation (+ libraries/patterns)

**Recommended approach**: Incremental, test-first, reuse-maximal, per-address explicit, real-protocol only (no simulator post-audit).

- **Mental model (user + code)**: "You have a position *on Aave* for a specific address (your builtin wallet's Arb address, or a connected MetaMask 0x... on Arbitrum). Supply wBTC to that address first → then you can borrow USDT0 against it. Health Factor, LTV, and BTC liquidation price are derived live from getUserAccountData + prices. All actions (supply/borrow/repay/withdraw) are sent from the *signer for that exact address*."
- **Reuse (high confidence — already audited 95%+)**:
  - AaveService (all 4 tx primitives + getUserAccountData + getVariableBorrowAPR + config + ray helpers already production-grade).
  - BorrowFlowDrawer thin wrapper pattern (add isSubmitting + children or step props).
  - WalletSelector (first-class in step 0; already handles builtin + $connectedWalletsStore + per-wallet balance callbacks).
  - HealthFactorGauge (extracted, i18n'd, accessible — extend with optional liq price prop).
  - Existing amount input / fee collapse / accordion patterns from BorrowStep (exact classes for parity).
  - connectedWalletsStore + getEvmSigner (for explicit signing context on external wallets).
  - btcPrice rune + tryCatch/Sentry patterns everywhere.
  - Uniswap.service.ts (for guided swap leg of repay-with-collateral path).
  - BalanceCard + wallet page as integration surface.
- **New only where necessary**: Position store (or extension of wallet.store DeFi section), pure calc utilities (exported from aave.service or new utils/defi-math.ts), wizard step components or state machine (compose existing BorrowStep logic), evolved DefiPositionCard + management forms (repay/add/withdraw).
- **TDD London School (non-negotiable)**: Write failing test first (mocks at ethers boundary for service; @testing-library/svelte for components with hoisted stores). Red defines the spec. Green is minimal passing code. Refactor only while green. 5-state coverage for every UI surface.
- **Swarm quality gate**: Re-use the exact original 7-agent swarm structure (UI/Visual, DeFi/Integration, Security/Financial Safety, Testing/Coverage, Svelte5/Arch, Edge/Platform/Perf/Resilience, A11y/i18n) + synthesis at end of major phases. Do not proceed past a phase gate until swarm reports >=0.95 collective.
- **Verification & safety**: GitNexus impact before every symbol edit (after re-index). Full gates after every batch. Defensive math (isFinite, bounds, conservative defaults on error). Financial ops always show explicit signer + "irreversible" warnings where appropriate.
- **Why this over alternatives**: Matches user feedback exactly (wallet-first, supply explicit, safe-withdraw only, guided path, HF + LTV + liq price, no simulator). Leverages the high-quality audited foundation and existing AaveService instead of rebuilding. Incremental = working app at every milestone (easy rollback).

**Libraries/patterns (no reinvention)**: ethers (already in service), Svelte 5 runes (as in BorrowStep), daisyUI/Tailwind 4 wallet patterns, svelte-i18n, existing @testing-library/svelte + vitest hoisted mocks, Playwright for E2E, Sentry breadcrumbs.

## 5. Implementation Steps (dependencies, TDD explicit, validation)

**Phase 0: Foundation, Re-index, Types, Pure Calcs (TDD first) — Entry: plan approved + GitNexus re-index done on dev machine. Exit: all new pure fns tested + gates green, no blast radius surprises.**

1. Run `npx gitnexus analyze`, then gitnexus__list_repos / detect_changes / impact on candidate symbols (AaveService, BorrowFlowDrawer, BorrowStep, DefiPositionCard, BalanceCard, wallet.store DeFi sections, connectedWalletsStore). Document blast radius in PR notes. (Manual grep/code-index as fallback if index issues persist.)
2. Create/extend types (src/lib/types/defi.ts or co-located): AavePosition, WizardStep, MaxSafeResult, etc. Add any missing i18n keys (wallet.defi.*) with English + Spanish seeds.
3. Add exported pure calculation functions to aave.service.ts (or new small utils/defi-math.ts if separation cleaner): `calculateHealthFactor(...)`, `calculateMaxSafeWithdrawUsd(...)` (returns { maxSafeCollateralUsd, postWithdrawHealthFactor, buffer }), `calculateBtcLiquidationPrice(...)` (given debt, collateral wBTC, liq threshold, current price → price at which HF hits 1.0), helpers for LTV display. Keep all math defensive.
4. **TDD Red-Green-Refactor**: Extend src/lib/tests/services/aave-service.test.ts first (Red: new test cases for calcs with edges — HF exactly 1.0, price=0, debt=0, max uint, negative inputs). Implement until Green. Refactor. Run full relevant test suite.
5. Verification: `npm run check`, `npm run lint`, translations script (0 missing), targeted tests pass. GitNexus detect_changes on the service/test changes. Update todo + memory patterns.
6. Deliverable: Tested pure fns + types ready for consumption. Current v1 borrow preview untouched.

**Phase 1: AaveService Polish + Per-Address Position Store/Model — Entry: Phase 0 complete. Exit: store can load real positions for builtin + any connected address; service extensions ready.**

1. Minor AaveService enhancements if needed (e.g., better error shaping for getUserAccountData, optional getUserReserveData for per-asset breakdown if aggregate is insufficient, allowance helpers or docs). Keep signer/address explicit on all writes.
2. New or extended store (prefer minimal extension of wallet.store.ts DeFi section or new src/lib/stores/defi-positions.store.ts following existing patterns): Map of position key → AavePosition. `loadPositionsForWallet(walletId, address, providerOrSigner)` using AaveService.getUserAccountData + price oracles + calc fns. Cache with staleness. Support both builtin (existing arb provider) and connected (via getEvmSigner).
3. Handle wallet/address change, network status, account switch for connected wallets (invalidate + reload).
4. **TDD**: Red tests for store (mock AaveService + price rune), error paths (network fail, malformed data, zero position), multi-address scenarios. London-style boundaries.
5. Verification gates + GitNexus impact on store + any service symbols touched.
6. Deliverable: `loadPositionsForAddress` works in isolation; current BorrowStep (which uses walletStore wbtc balances) continues to work (or is lightly adapted if needed for consistency).

**Phase 2: Dashboard & Positions Surface (DefiPositionCard + BalanceCard + Wallet Page) — Entry: Phase 1 store live. Exit: users see real per-wallet positions in wallet section; tap opens detail (read-only for now). Swarm mini re-audit.**

1. Evolve DefiPositionCard.svelte (replace placeholder): Display summary or list of positions for current wallets (use store), HF gauge + LTV + liq price, "Manage" or detail CTA. 5 states (skeletons for loading positions, soft error, empty "No active Aave positions — start a new loan", populated, edge zero values).
2. Integrate/update in BalanceCard.svelte (the call site). Keep visual parity with Bitcoin accordion and other wallet cards.
3. Add basic position list or "DeFi Positions" section in wallet page / dashboard if not already surfaced.
4. Wire live getUserAccountData + calcs. Show explicit address + wallet label ("Builtin Arbitrum" or "MetaMask 0x1234...").
5. **TDD + 5-state component tests** (new or extend existing DefiPositionCard test if present; follow BorrowStep.test.ts pattern).
6. Styling: exact wallet section match (daisyUI, spacing, typography from audited BorrowStep / WalletSelector).
7. Verification + **swarm re-audit wave** (focus UI/Visual + DeFi/Integration + A11y) until >=0.95 on this surface. Do not proceed if swarm flags issues.
8. GitNexus impact on BalanceCard + DefiPositionCard before edit.
9. Deliverable: Working positions dashboard (read-only) with real data. App remains fully functional.

**Phase 3: Full New Loan Wizard (5 Steps, Wallet-First) — Entry: Phase 2 dashboard live + user can see positions. Exit: complete end-to-end supply → borrow flow with real tx (testnet or mainnet with caution), all states, explicit signing, i18n, parity. Major swarm gate.**

1. Decide architecture: Extend BorrowFlowDrawer into a multi-step wizard (state machine for currentStep) or new thin DeFiWizardDrawer (recommended for separation). Reuse the thin wrapper + isSubmitting pattern exactly.
2. Implement steps (can be sub-components or sections in one file if <500 LOC total; split if complex):
   - Step 0: WalletAddressSelectStep — reuse/extend WalletSelector (first-class, expanded by default). Show per-address existing position summary (HF/LTV/available borrow) if position exists for that address. Clear label: "Positions & loans are per address on Aave V3".
   - Step 1: SupplyCollateralStep — show current supplied wBTC for the selected address (from getUserAccountData or store), total wallet wBTC, input amount (or "Max"), preview post-supply HF + new available borrow. Approve (if needed) + supply tx via AaveService.supply (signer from selected wallet). Reuse amount input + fee patterns.
   - Step 2: BorrowStep — evolve current audited BorrowStep (or compose). Now driven by real getUserAccountData (availableBorrowsUsd, current HF/LTV, liq price via new calcs). Amount input + Max safe borrow. Live preview updates. Fee/interest breakdown (exact styling parity). "This borrow will be signed by [Wallet] [addr]".
   - Step 3: ReviewConfirmStep — full summary (supply if new, borrow amount, resulting HF/LTV/liq price, gas estimate, annual interest, total cost, explicit signer callout, "I understand this creates a leveraged position on Aave").
   - Step 4: SuccessStep — tx receipts/links (Arbiscan), updated position summary, "Manage this position" CTA that opens detail, "New loan" or close.
3. Optional "combined" UX note for first-time users (still two on-chain txs: supply then borrow; wizard can sequence them with progress).
4. **TDD per step + full flow integration test** (mock AaveService tx methods + signer). 5-state coverage. Interaction tests for wallet switch mid-wizard (should reset or warn).
5. All strings $t(), translations script clean. a11y (labels, aria, keyboard on steps, focus management in drawer).
6. Styling: 100% wallet section parity (no deviations).
7. Hardening: isSubmitting threaded to prevent dismiss, online checks, approval detection + UX, error states with retry per step, tx receipt polling.
8. Verification gates after each step + full wizard. **Full swarm re-audit wave** (all 7 dimensions) on the wizard until >=0.95. This is a high-risk financial surface.
9. GitNexus impact on drawer, any shared step logic, and store before edits.
10. Deliverable: Complete, tested, production-style New Loan Wizard behind the existing borrow entry point (or new prominent "New Loan" CTA). v1 preview can remain as quick-action or be deprecated in favor of wizard.

**Phase 4: Position Management Flows (Repay, Add, Withdraw, Close) + Detail View — Entry: Wizard complete + positions visible. Exit: full CRUD on positions with safe math enforcement + guided path. Second major swarm gate.**

1. PositionDetail (drawer or modal, opened from dashboard card): Current stats (HF gauge extended with liq price + LTV), supplied collateral (wBTC), debt (USDT0), available borrow, risk level. Action buttons: Repay, Add Collateral, Withdraw (safe), Close Position. "Signed/owned by [addr]".
2. Repay flow/form: Amount or "Max debt", preview post-repay HF (improves), gas + interest savings. AaveService.repay. Approval if needed for debt asset.
3. AddCollateral (supply more): Same as wizard Step 1 but in context of existing position. Updates HF/LTV immediately.
4. **Withdraw (highest safety scrutiny)**: Input or "Max Safe" button (uses Phase 0 calc fn). Live preview of post-withdraw HF (must stay >=1.05 or user-chosen buffer). Hard enforcement (button disabled if would breach). Warning copy: "Withdrawing more than the safe limit risks liquidation if BTC price drops." Uses real getUserAccountData + collateral/debt values.
5. Close Position: If debt > 0, guide through full repay first (or compound "Repay all + Withdraw remaining" with multi-step confirm). Only allow if post-close HF would be safe or debt is zero.
6. **Guided secondary "Repay using your wBTC collateral" path** (in detail or repay screen): Clear educational section + steps: 1. Withdraw safe amount of wBTC (link to Withdraw above). 2. Swap the wBTC for USDT0 (deep link or handoff to existing SwapForm / Uniswap service, pre-filled). 3. Repay the USDT0 debt (link to Repay). No false "atomic" language. "This is a manual 3-step process for your safety."
7. **TDD**: Red tests for each form (especially Max Safe Withdraw boundary enforcement and preview math). 5-state per surface. Integration test for full repay + withdraw sequence.
8. All patterns from Phase 3 (signer context, isSubmitting, offline, i18n, styling).
9. Verification + **full swarm re-audit wave** focused on Security/Financial Safety + Edge/Perf + Testing (must hit >=0.95; pay extra attention to safe withdraw math and liquidation price accuracy).
10. GitNexus impact on all new forms + any shared calc usage.
11. Deliverable: Complete position management. Users can fully lifecycle a loan safely.

**Phase 5: Resilience, Polish, E2E, Final Swarm & Release Prep — Entry: Phase 4 complete. Exit: E2E green, swarm final 95%+, ready for mainnet with monitoring.**

1. ERC-20 approval UX (if not fully solved earlier): Consistent pattern across supply/borrow/repay (detect allowance, "Approve + Action" combined button or clear separate step, gas estimates).
2. Tx resilience: Nonce handling, gas buffer, receipt polling with timeout + manual "check on Arbiscan", failure states with clear user copy + retry, partial success handling (e.g., supply succeeded but borrow failed — surface position update).
3. Broader error/offline/account change handling (invalidate positions on wallet switch or network change).
4. Performance: Lazy load positions only when wallet tab or drawer opened. Debounce rate refreshes. No polling loops without user action.
5. E2E Playwright (per bittasker-e2e skill): Critical user journeys — new loan (supply+borrow), view position, safe withdraw, repay, guided path handoff. At least happy + 2 failure (insufficient funds, network error, HF boundary).
6. Final i18n verification + translation script + any missing keys.
7. Full test suite (`npm run test:ci` or targeted + E2E) + check + lint + autofixer.
8. **Final swarm re-audit wave** (all dimensions) on the complete lifecycle. Iterate fixes until >=0.95 collective confidence. Do not ship below threshold.
9. GitNexus final detect_changes + any remaining impact reviews. Commit only clean changes.
10. Docs: Update this plan with "as-built" notes, any deviations, and learnings. Add to docs/wallet/README if exists.
11. Deliverable: Production-ready full loan lifecycle, with evidence (test reports, swarm confidence scores, GitNexus clean).

**Phase 6 (light)**: Post-ship monitoring (Sentry DeFi category), user feedback loop, iteration on education/UX, future expansion (other assets, chains) per new requests.

## 6. Interfaces / Contracts (APIs, types, events, files)

**Key new/extended types** (src/lib/types/defi.ts or aave.service.ts):
- `interface AavePosition { id: string; walletId: string; address: string; chainId: number; collateral: { asset: string; amount: bigint; usdValue: number }; debt: { asset: string; amount: bigint; usdValue: number }; healthFactor: number; ltv: number; liquidationThreshold: number; availableBorrowsUsd: number; liquidationPriceBtc?: number; lastUpdated: Date; }`
- `interface MaxSafeWithdrawResult { maxSafeCollateralUsd: number; maxSafeCollateralAssetAmount: bigint; postWithdrawHealthFactor: number; currentHealthFactor: number; buffer: number; isAtRisk: boolean; }`
- `interface LiquidationPriceResult { liquidationBtcPrice: number; currentBtcPrice: number; distancePercent: number; }`
- Wizard state machine types or step enum.

**AaveService extensions** (public API):
- Existing methods unchanged (breaking change forbidden).
- New exported pure: `calculateMaxSafeWithdraw(currentCollateralUsd, currentDebtUsd, liquidationThresholdBps, currentHealthFactor, priceOracle, bufferBps?): MaxSafeWithdrawResult`
- `calculateBtcLiquidationPrice(debtUsd, collateralBtcAmount, liquidationThresholdBps, currentBtcPrice): LiquidationPriceResult`
- Optional: `getUserReserveData` or enhanced position derivation if aggregate insufficient.

**Component props / events** (examples):
- BorrowFlowDrawer / new wizard: `isOpen`, `onClose`, `selectedWallet?`, `onWizardComplete?(position: AavePosition)`, `isSubmitting`.
- DefiPositionCard: `positions?: AavePosition[]`, `onManage?(id: string)`, loading/error states via slots or props.
- Management forms: `position: AavePosition`, `onRepay(amount)`, `onWithdraw(amount)`, `onAddCollateral(amount)`, signer context prop.

**Store API** (defi positions):
- `positions: Readable<Map<string, AavePosition>>`
- `loadPositionsForAddress(walletId, address, provider): Promise<AavePosition>`
- `invalidate(address?)`

**Events / side effects**: Sentry breadcrumbs on all Aave reads/writes + position loads. Custom events or callbacks for analytics (optional).

**Files touched (preliminary — run GitNexus impact before editing any)**:
- High: aave.service.ts (extensions + calcs), DefiPositionCard.svelte + BalanceCard.svelte, BorrowFlowDrawer.svelte + new/ extended wizard steps or BorrowStep evolution, new defi-positions.store.ts or wallet.store.ts sections.
- Medium: wallet page, types, locales (en/es wallet.json), tests (aave-service.test.ts, new wizard/component tests), possibly connected-wallets or metamask-connector for signer context.
- Low/Integration: Uniswap service (for guided path handoff), crypto price rune (if needed for liq price).
- New (only if absolutely required per rules): wizard step files if splitting, defi-math utils, E2E specs.

## 7. Edge Cases & Error Handling (include test scenarios for critical ones)

- HF exactly 1.0 or below (liquidation territory): Gauge shows "risk", all withdraw/ close CTAs disabled or heavily warned, calc fns return safe=0.
- BTC price = 0 or NaN from oracle: Fallback to conservative HF=5 / no borrow, soft error, never divide.
- User has 0 wBTC but tries to supply: Clear "Get wBTC" path (existing onGetWbtc).
- Connected wallet signer fails or wrong chain: Explicit error "Sign with the correct MetaMask account on Arbitrum", do not proceed.
- ERC-20 allowance insufficient mid-flow: Detect + prompt approve as part of tx sequence.
- Partial tx success (supply ok, borrow fails): Surface "You have supplied collateral but borrow did not complete. Your position is updated. Try borrow again."
- Offline during load or tx: Disable all CTAs, show network banner, retry on reconnect.
- Max uint / overflow in calcs: Defensive bigints + isFinite guards; tests for extremes.
- Malformed Aave response (missing fields, wrong decimals): tryCatch + Sentry + user "Unable to load live position data (using last known). Retry?"
- Rapid wallet/address switch: Invalidate in-flight requests, show loading, prevent stale UI.
- Gas spike during review: Warning + updated estimate; user can cancel.
- Approval race / nonce issues: Receipt polling + clear "Transaction pending" states.
- Test scenarios (mandatory in TDD): All above + 5-state UI for each, happy path full lifecycle, 2+ failure paths per major flow, i18n interpolation, a11y (screen reader on gauge + forms), platform (web vs Capacitor if any difference).

## 8. Risks, Assumptions, Unknowns

**High (mitigated in plan)**:
- Financial safety of withdraw/liquidation math (mitigation: pure fns + extensive TDD Red on boundaries + conservative buffers + swarm Security/Financial agent sign-off).
- User confusion on "per address" + "no atomic repay" (mitigation: explicit UI labels in Step 0 + wizard education + guided path copy).
- ERC-20 approve UX not having a clear existing pattern (mitigation: Phase 0/1 spike + reuse from other wallet send flows; add if missing following same styling).
- GitNexus staleness blocking impact analysis (mitigation: explicit Phase 0 re-index gate + fallback to code-index/grep manual blast radius).

**Medium**:
- Gas estimation accuracy on Arbitrum for multi-tx sequences (use current BorrowStep pattern + buffer + user warning).
- Price oracle staleness for liq price (use btcPrice rune + note "approximate; check Aave app for live").
- Connected wallet account change mid-wizard (invalidate position + force re-select).

**Low / Assumptions**:
- Aave V3 contracts on Arbitrum remain stable (addresses already in service).
- No major breaking changes in ethers v6 usage.
- User has basic understanding of leveraged DeFi (or learns via clear copy + HF gauge).

**Unknowns (resolve in Phase 0)**: Exact existing approve pattern coverage; whether getUserAccountData alone is sufficient or per-reserve data is needed for multi-collateral future; precise getEvmSigner API for external wallets in current staged changes.

## 9. Confidence Summary (overall + top actions)

**Overall for this plan**: 94/100. Grounded in full reads of the highest-value production code (AaveService complete with getUserAccountData + all txs, audited BorrowStep + drawer with live wiring + exact styling + WalletSelector + gauge + tests, placeholder position card in the exact right place, TDD precedent). Matches every piece of user feedback (wallet-first, supply explicit, safe-withdraw only, HF+LTV+liq price, guided path, no simulator, visual parity, per-address). Follows .cursor/commands/plan.md template + CLAUDE/AGENTS rules + swarm discipline exactly.

**Top 3 actions to raise to 98%+ before execution**:
1. On a dev machine with clean env: `npx gitnexus analyze`, then run gitnexus__impact on AaveService, DefiPositionCard, BorrowFlowDrawer, BalanceCard, wallet.store DeFi symbols. Document results.
2. 30-60 min spike: Confirm existing ERC-20 approve pattern (or lack) in wallet/sends/DeFi flows; decide exact UX for Phase 3/4.
3. Quick review of latest staged changes (builtin-wallet-tier2.ts, metamask-connector.ts, wallet.store.ts) for signer/address handling to confirm assumption on getEvmSigner.

**Per major phase confidence target**: >=90 at start of phase (from prior gates), >=95 swarm self-report at exit of Phases 2/4/5.

---

## Appendix A: Accurate ASCII Mockups (Updated for Real Aave V3 Mechanics)

### Wallet Section Dashboard (BalanceCard + DefiPositionCard integration)

```
[Bitcoin Balance Card]
  12,450,000 sats  ~$124,500
  [Send] [Receive] [Swap]

[DeFi Positions — Aave V3 Arbitrum]
  Position for Builtin (0xAbC...1234)
    Collateral: 2.15 wBTC (~$215k)   Debt: $85,000 USDT0
    Health Factor: 2.4x [Safe]      LTV: 40% (Max 70%)
    BTC Liquidation Price: $48,200   (Current: ~$100k)
    Available to borrow: ~$65k USDT0
    [Manage Position] [New Loan]

  Position for MetaMask (0x7f3a...9B2c)
    Collateral: 0.8 wBTC (~$80k)     Debt: $12,000 USDT0
    Health Factor: 1.8x [Monitor]    LTV: 15%
    BTC Liq Price: $42,100
    [Manage] [Add Collateral]
```

### New Loan Wizard — 5 Steps (Wallet-First, Supply Explicit, Accurate Mechanics)

**Step 0: Select Wallet / Address (first-class, always)**
```
Select the wallet & address for this Aave position
(Positions & loans are per address on Aave V3)

[Builtin Arbitrum 0xAbC...1234]  (has existing position HF 2.4x)
  wBTC balance: 2.8  |  Supplied as collateral: 2.15  |  Available borrow: ~$65k

[MetaMask 0x7f3a...9B2c]         (new or existing)
  wBTC balance: 0.9  |  ...

[Connect another wallet] (reuses existing flow)
```

**Step 1: Supply Collateral (explicit, required before borrow)**
```
Supply wBTC as collateral for 0xAbC...1234

Your wBTC balance: 2.8
Already supplied to this Aave position: 2.15 wBTC (~$215k)

Amount to supply
[ 0.50 ] wBTC   [Max]

Preview after supply:
  New collateral: 2.65 wBTC
  Health Factor: 2.6x (was 2.4x)
  New available borrow: ~$78k USDT0

[Approve wBTC]  [Supply 0.50 wBTC]
(Gas ~$0.12 on Arbitrum)
```

**Step 2: Borrow (enhanced from current audited step)**
```
Borrow against your collateral (0xAbC...1234)

Available to borrow: ~$78k USDT0   (based on live Aave data)
Current Health Factor: 2.6x [Safe]   LTV: 38%
BTC Liquidation Price: $47,800

Amount to borrow (USDT0)
[$ 25,000.00 ]   [Max Safe]

Collateral impact (no change — borrow only)
Interest rate: 3.8% APR (live from Aave)
Est. annual cost: $950

[Fee breakdown ▼]  (exact WalletSelector accordion styling)
  Gas: $0.18
  Interest: 3.8% APR
  Annual cost: $950

[Health Factor Gauge — reusable, i18n'd, aria]

This borrow will be signed by Builtin wallet 0xAbC...1234 (Arbitrum)

[ Borrow $25,000 USDT0 ]
```

**Step 3: Review & Confirm**
```
Review & Confirm — New Loan on Aave V3

Wallet/Address: Builtin 0xAbC...1234
Supply (new): 0.50 wBTC
Borrow: $25,000 USDT0
Resulting HF: 2.1x [Monitor]   LTV: 48%
BTC Liq Price: $48,200

Gas (total for sequence): ~$0.35
Interest: 3.8% APR variable

Signer: This transaction will be signed by your Builtin wallet (no private keys leave device)

[ I understand this creates a leveraged position. If BTC price falls below the liquidation price, my collateral may be sold by the protocol. ]

[Confirm & Sign Supply + Borrow]
```

**Step 4: Success**
```
Loan Created Successfully

Supply tx: 0x123... (Arbitrum)  [View]
Borrow tx: 0x456... (Arbitrum)  [View]

Your new position for 0xAbC...1234:
  HF 2.1x | LTV 48% | Liq Price $48,200

[Manage this position]  [New loan]  [Done]
```

### Position Detail + Management (example)

```
Position Detail — 0xAbC...1234 (Builtin)

Health Factor 2.1x [Monitor]   (role=meter, aria)
LTV 48% (Max 70%)
BTC Liquidation Price: $48,200 (Current ~$100k — you have buffer)

Collateral: 2.65 wBTC (~$265k)
Debt: $25,000 USDT0
Available borrow: ~$53k

[Repay] [Add Collateral] [Withdraw (Safe)] [Close Position]

Guided: Repay using your wBTC collateral?
1. Withdraw safe amount of wBTC (Max Safe button below)
2. Swap wBTC → USDT0 (opens Swap form, pre-filled)
3. Repay USDT0 debt here
(This is a manual 3-step process for your safety — no atomic repay-with-collateral on Aave V3 for this pair.)
```

### Withdraw Form (Safe Only — Critical Screen)

```
Withdraw wBTC (Safe Limit Enforced)

Current HF: 2.1x   Post-withdraw target: >= 1.05x (your buffer)

Amount to withdraw
[ 0.20 ] wBTC   [Max Safe]

Preview:
  Collateral after: 2.45 wBTC
  Post-withdraw HF: 1.08x [Monitor]
  New Liq Price: $51,400 (worse — less buffer)

⚠️ Withdrawing more than Max Safe risks liquidation if BTC drops.

[Withdraw 0.20 wBTC]  (disabled if preview < buffer)
```

(Other flows — Repay, Add, Close — follow similar preview + explicit signer + HF update patterns.)

---

## Appendix B: Preliminary Blast Radius (from exploration — must re-verify with GitNexus impact)

- **AaveService**: High — callers are BorrowStep (live APR), tests, future wizard/position store. Extensions are additive (pure fns) → low risk if no signature changes to existing methods.
- **DefiPositionCard + BalanceCard**: Medium-High — only current consumer is BalanceCard in wallet section. Adding real data + interactions affects wallet dashboard UX.
- **BorrowFlowDrawer / BorrowStep**: Medium — thin wrapper + the audited preview step. Wizard evolution must preserve or deprecate the v1 path cleanly.
- **wallet.store.ts (DeFi sections)**: Medium — already processes arbWbtc/Usdt0 + tier2; position store can layer on top or integrate.
- **connectedWalletsStore / connectors**: Low-Medium — already used in BorrowStep; new flows must use the same explicit signer/address pattern.
- **wallet page + locales**: Low — integration points.
- **Tests**: High value — extend, do not break existing.

**Recommendation**: Run full GitNexus impact + manual cross-reference (grep + code-index for "AaveService", "getUserAccountData", "BorrowStep", "DefiPositionCard", "WalletSelector") at start of every phase.

---

**Execution path (once approved)**: Use the `execute-plan` skill (or manual phased implementation with swarm subagents at gates) referencing this document. Track via todo_write + memory_store at each phase exit. Re-audit with swarm-orchestration skill where scale requires.

This plan delivers the complete, safe, per-wallet, accurate-Aave-V3 loan lifecycle while preserving the already high-quality audited borrow preview foundation. All rules followed.

---

*End of plan. Ready for user review + approval before Phase 0.*