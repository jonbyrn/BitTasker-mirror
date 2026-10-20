# Replacing dev.bittasker.com with sandbox/rgb-wasm-phase0

This branch is prepared so a later merge into `dev` replaces the site that is live on https://dev.bittasker.com. Do not merge, open a merge request, or deploy until Jon says so.

## What is live today

| Item | Value |
| --- | --- |
| Hostname | https://dev.bittasker.com |
| Git branch | `dev` (GitLab default branch). There is no `develop` branch. |
| CI jobs | `build-development`, then `deploy-development` |
| Deploy command | `npx wrangler deploy --env dev` |
| Worker | `bittasker-dev-worker` |
| Route | `dev.bittasker.com/*` (zone in `wrangler.toml`) |
| Cache purge | `ENVIRONMENT=dev node scripts/purge-cache.js` |

`deploy-development` runs only when `CI_COMMIT_BRANCH == "dev"`. The sandbox hostname is a different job: `deploy-sandbox` runs only on `sandbox/rgb-wasm-phase0` and deploys worker `bittasker-sandbox` to https://rgb.bittasker.com. That job must keep using public relays. It is not the dev replacement.

The last **successful** deploy of `dev` is GitLab pipeline [2723239414](https://gitlab.com/bittasker/BitTasker/-/pipelines/2723239414) (2026-08-01), commit `d8f357d29728215d2ae44aa195124f6600ef2404`. Both `build-development` and `deploy-development` succeeded.

The current `dev` tip is `7173dacacab4edbabcc2a4d8ed47e091964b8f12` (2026-09-23). Pipelines [2876338491](https://gitlab.com/bittasker/BitTasker/-/pipelines/2876338491) and [2876533721](https://gitlab.com/bittasker/BitTasker/-/pipelines/2876533721) failed, so that tip is **not** what users see. `7173dacac` is an ancestor of this sandbox branch (zero commits on `dev` are missing here). The gap that matters is the **tree** of the August deploy versus this branch, because later sandbox commits removed the old wallet stack.

## Gap table

| Gap | Status | Why |
| --- | --- | --- |
| Public `/learn` and `/learn/[slug]` | Ported | The pages had been moved into the private `_taproot` folder, so SvelteKit did not route them. Article pages also rendered “temporarily disabled”. They are public again and render `LearnPageLayout`. |
| Learn articles still linked from the hub, footer, and slug map | Ported | Each slug-map key again has an English article under `src/lib/content/taproot/`, including the bitcoin pillar. Spanish files were restored from `d8f357d` when the live site had them. |
| `$lib/types/learn` | Ported | Content files import this path. The definitions had been renamed to `src/lib/types/taproot.ts` with no re-export, so the articles did not typecheck. |
| Service-contract preflight **error codes** | Ported | `preflight-feedback.ts` still imports the code union. The Rootstock preflight implementation (about 13 KB of EVM checks) was not restored. |
| Acceptance ambiguity labels (`timeout`, `nonce`, `rpc`) | Ported | `ambiguity-reason.ts` was a re-export of the deleted Rootstock `finality.ts`. It now classifies the error string only. It does not submit a transaction. |
| `build-development` / `deploy-development` RGB asset id | Ported | Both jobs export `VITE_RGB_USDT_ASSET_ID` when GitLab has not set one (`rgb:2s69152-rg39309-8438210-usdt_testnet`). They do **not** override `VITE_NOSTR_RELAY_URL` or `VITE_API_URL`. `[env.dev.vars]` records the same asset id. |
| App routes other than learn (tasks, bids, services, messages, wallet, settings, reviews, notifications, auth) | Already on this branch | Page routes match the live site, plus contract detail routes the sandbox added. |
| Passkey session reuse and the DM-until-escrow gate | Already on this branch | Leave those rules in place. This plan does not weaken them. |
| RGB WASM wallet, signet escrow, payout invoices | Already on this branch | This is the payment rail the replacement ships. |
| Rootstock escrow v1/v2, contract rune, NDK contract drawers | Not ported | Retired. Escrow is RGB. Putting the EVM contracts back would give dev two payment rails. |
| Gasless EIP-7702, DeFi/Aave loans, Boltz / LI.FI / Changelly / OpenOcean / Symbiosis swaps, Breez send/receive | Not ported | Those screens talk to the old wallet. The RGB wallet does not share their balances, routes, or contract addresses. |
| `/learn/rootstock/*` (DeFi, RBTC, “what is Rootstock”) | Not ported | Removed from the slug map on purpose. The articles describe Rootstock as the product escrow. Old URLs will 404. |
| `debug-swaps`, `debug-wallet` and `debug-smart-contract` screens | Not ported | Debug-only. `debug-wallet` and `debug-smart-contract` still have a `+page.ts` that redirects production visitors to `/hiring`. |
| `bittasker-nestjs` submodule | Not ported | Removed from this branch earlier. The API stays the external `api-dev` service. |
| `src/lib/api/services/notification.service.ts` | Not ported | The notification center uses `notificationCenter.service.ts`. Unread-count skip (`sandboxPagesHost`) applies to `rgb.bittasker.com` only, so `dev.bittasker.com` will call api-dev. Reviews, notifications, and Services are also in progress on this branch by other agents; this change does not redo that work. |
| `src/lib/utils/reviews/attestation.ts` and `contractAdapter.ts` | Not ported | The `/reviews` route is still here. Attestation wiring belongs with the reviews work already on this branch. |
| EVM `service-contract/create.ts`, `finality.ts`, `recover.ts` | Not ported | Service quotes now record native RGB finality (`SERVICE_ACCEPTANCE_FINALITY_POLICY_VERSION = native-rgb-v1` in `protocol.ts`). Restoring the RSK waiter would fight that. |
| `LoginQrCodeScannerModal.svelte` | Not ported | Login still scans with `QrCodeScanner` and `WebQrCodeScanner`. |

## Data and migration

Nothing in this branch copies or deletes server data. A deploy only changes the static app on `dev.bittasker.com`.

### People and passkeys

Passkeys are bound to the site hostname. Credentials created on `dev.bittasker.com` keep working when this code is served from that host. Credentials created on `rgb.bittasker.com` do not log into dev, and the reverse is also true. `webAuthnCredentialId`, `access_token`, `refresh_token`, and `npub` in local storage stay the same keys (`src/lib/utils/constants/storage.ts`).

The passkey session stores the login seed in IndexedDB database `bittasker-wallet-session` under `bittasker.mnemonic.cipher` and `bittasker.signer.cipher`. Routine Nostr signing reuses that signer. A rollback of the website does not delete those browser records.

### Wallets

The August site’s wallet is the old stack (Breez, Liquid, Lightning, Rootstock, BSC). This branch opens an RGB WASM wallet on the signet network (`utexo`) and the signet USDT asset above. The same mnemonic does **not** make old Liquid, Lightning, or Rootstock balances appear.

Before the cutover, anyone with spendable funds in the old dev wallet has to move them with the **current** site. After the cutover the old send screens are gone, and a rollback of the website does not restore coins that were already moved. The RGB stash on the device also stays if you roll the website back; the old UI will not show it.

### Nostr

Live tasks, bids, profiles, and messages are on:

- `wss://relay1-dev.bittasker.com` (general)
- `wss://relay2-dev.bittasker.com` (tasks)
- API `https://api-dev.bittasker.com`

`rgb.bittasker.com` is different on purpose (`wss://nos.lol`, `wss://relay.primal.net`, `https://api-staging.bittasker.com`) so sandbox traffic stays off the dev relays. The `dev` jobs must not copy those sandbox URLs. GitLab’s **development** environment scope should keep supplying the dev relays and `api-dev`. This branch only fills in the RGB asset id when that variable is empty.

Events are not exported or rewritten. If a dev deploy were built with the sandbox relays, existing tasks would vanish from the UI even though the events were still on relay1-dev.

### Other browser keys

Draft tasks, service drafts, theme, and language keys are unchanged. `bittasker_wallet_chain_sort_hints`, `bittasker_fiat_flow`, and `bittasker_off_ramp_flow` belong to the removed swap stack. Leaving them in place is harmless. Do not delete users’ local storage as part of the deploy.

## Deploy and CI

After this branch is merged into `dev` and pushed:

1. GitLab runs `build-development` (`npm run build:dev`) with environment scope `development`.
2. The job sets `VITE_RGB_USDT_ASSET_ID` only if GitLab did not set it.
3. `deploy-development` deploys `--env dev` to https://dev.bittasker.com and purges the dev cache.
4. `deploy-sandbox` does not run, because the branch is no longer `sandbox/rgb-wasm-phase0`.
5. `master` / production is untouched.

Do not retarget `dev.bittasker.com` at the sandbox worker. The route in `[env.dev]` stays the dev worker so a later deploy replaces the assets in place.

`[env.dev.build]` is `npm run build:dev`, so Wrangler may compile again during deploy. The asset-id export is on that job as well. Relay URLs still come from the development-scoped GitLab variables, not from `deploy-sandbox`.

## Rollback

The worker name and the route stay the same, so rollback is another deploy of the last good dev commit:

```bash
git fetch origin d8f357d29728215d2ae44aa195124f6600ef2404
git checkout -B rollback-dev-bittasker d8f357d29728215d2ae44aa195124f6600ef2404
```

Then run the same `build:dev` and `npx wrangler deploy --env dev` that `deploy-development` runs, with the development-scoped API and relay variables. Prefer doing that through a temporary push to `dev` only if Jon wants the pipeline to perform the rollback. Do not delete the worker, the route, or the KV namespaces.

A website rollback does not:

- move RGB or old-wallet funds
- delete Nostr events written to relay1-dev / relay2-dev while the new app was up
- clear IndexedDB on user devices

If the new app is up for any length of time, treat wallet state as one-way for that browser.

## Merge steps (when Jon approves)

1. Confirm this branch is the commit he wants, and that other agents have pushed the Services, reviews, and notification work he intends to include.
2. `git fetch origin dev sandbox/rgb-wasm-phase0`
3. Check that `origin/dev` is still an ancestor of the sandbox tip (`git merge-base --is-ancestor origin/dev origin/sandbox/rgb-wasm-phase0`). If `dev` has new commits, merge those into the sandbox first and re-read this file. Do not discard them.
4. On `dev`, merge `sandbox/rgb-wasm-phase0` (fast-forward if step 3 still holds). No squash: the RGB history should stay intact.
5. Push `dev` only. That push is what deploys https://dev.bittasker.com. Do not push `master`.
6. Watch `build-development` and `deploy-development`. Do not start `deploy-sandbox` for this.
7. On https://dev.bittasker.com check:
   - the wallet is the RGB wallet, not the old swap/DeFi wallet
   - `/learn/` and `/learn/wallet/best-bitcoin-wallet/` render the article, not a disabled notice
   - a task that already exists on relay2-dev still opens (proves the dev relays were not replaced)
   - login with an existing dev passkey still works
8. Leave https://rgb.bittasker.com on `deploy-sandbox` until Jon retires that hostname.

No merge request is required for that sequence. Opening one does not deploy `dev`; the push to `dev` does.

## Content and FAQ refactor is part of the replacement

The user-facing copy on this branch is part of the dev replacement, not a separate later pass. Home, About, How it works, FAQ, Help, onboarding, wallet, funding, escrow, services, settings, tooltips, empty states, errors, and the English and Spanish locale files describe the passkey wallet, Bitcoin, USDT on RGB, Lightning, card or bank bitcoin purchases, and the escrow steps the app actually runs: lock, deliver, approve, pay the invoice. Direct messages open only after escrow is formed. Reviews open only after that payment. Nothing is paid on a 7-day timer, and there is no 14-day automatic refund.

When this branch is merged into `dev`, do not bring the old RSK, Rootstock, rBTC, Boltz, Liquid, or smart-contract wording back in from `dev`. If a page exists only on `dev` and is ported later, rewrite it the same way before it ships. `docs/FIX_LIST.md` item 173 records the pages that were rewritten on this branch.

Homepage and header layout (`bc-894b1026`) and mobile layout (`bc-8c7dbf03`) are separate work on this same branch. This refactor does not change their layout, colours, fonts, or buttons. Pull and rebase before pushing so their layout commits stay intact.
