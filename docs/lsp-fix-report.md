# BitTasker RGB sandbox: LSP connection / channel root-cause report
Date: 2026-10-16 (CST). Read-only research; no channel opened, nothing sent, no code pushed.

Sources: UTEXO-Protocol/rgb-lightning-node @ main (cloned to /workspace/gh/rgb-lightning-node, HEAD 2026-10-13),
UTEXO-Protocol/rgb-sdk-web, utexo-lsp, npm tarballs @utexo/rgb-sdk-web@1.0.0-beta.12 and @utexo/rgb-sdk-core@1.0.1-beta.3
(extracted in /workspace/sdk), BitTasker GitLab branch `sandbox/rgb-wasm-phase0` (copies in /workspace/bt).

## 0. Key version facts
- `@utexo/rgb-sdk-web@1.0.0-beta.12` pins **`@utexo/rln-wasm` 0.10.0-beta.3** (exact pin) and `@utexo/rgb-sdk-core ^1.0.1-beta.3`.
- Latest `@utexo/rln-wasm` on npm is **0.17.0-beta.3**; rgb-sdk-web `main` already uses 0.15.0-beta.3. No newer rgb-sdk-web is published (only `1.0.6-test`).
  So our deployed wasm is ~7 minor versions behind, missing RefCell/borrow, cold-start and runtime-init fixes (e.g. rln `6037771` "Fix cold browser runtime initialization", `a42431a` "Keep WASM Lightning guards scoped to their owning node", the connectPeer borrow-across-await fix in `ln_node.rs`).
- Line `ldk_live_backend.rs:1513` in the panic refers to the 0.10 build; in current main the matching code is `ensure_object_graph()` (`bindings/wasm-sdk/src/ldk_live_backend.rs` ~L1496-1540), which does `RGB_WALLET_REGISTRY ... reg.borrow()` and `wallet_rc.borrow().get_online()` on the **same `Rc<RefCell<rgb_lib_wasm::Wallet>>` the wallet facade uses**.

## 1. How the WASM SDK expects LSP connection and channels to work
### Lifecycle (rgb-sdk-web d.ts, `UTEXOWallet`)
1. `await initRlnWasm()` / `initWasm()` once.
2. `new UTEXOWallet({ network:'utexo', mnemonic, password, proxyUrl, transportEndpoint, indexerUrl, relayAuthToken, relayNodeId, lspBaseUrl, enableVirtualChannels })`.
3. `await wallet.init()`: local setup and node handle, returns LOCKED (`RlnWasmBinding.create`, dist/index.mjs ~L838-880: `RlnWasmNode.newWithNodeRuntimeId(proxyUrl, runtimeId=nodeRuntimeId ?? master_fingerprint, network)` then `nodeHandle.setRelaySessionAuth(relayAuthToken, relayNodeId)`).
4. `await wallet.unlock()`: sdk.unlock, then LDK VSS configure, then go-online and node attach.
5. On-chain setup (refresh, createUtxos), then `wallet.attachLightningNode()`. The d.ts warns that this must happen after on-chain setup "to avoid a RefCell already borrowed panic".
6. `wallet.startNodeChainSync(indexerUrl?, pollMs=3.6e6)`. Its doc says that "running it concurrently with wallet operations panics the wasm ("RefCell already borrowed")".
7. LSP: `const lsp = await wallet.createLsp()` does `GET {lspBaseUrl}/get_info`, takes the pubkey, uses the host from lspBaseUrl, and defaults the port to 9735 (rgb-sdk-web `docs/lsp.md`; dist L2855).
8. `await lsp.connect()` calls `this.wallet.connectPeer("pubkey@host:port")` (sdk-core dist L960). That goes to `UTEXOWallet.connectPeer(peerUri)` (single string, CHANGELOG "connectPeer(peerUri) takes a single 'pubkey@host:port' string"), which splits it and calls `RlnWasmNode.connectPeer(peerAddr, peerPubkey)` (`ln_node.rs:1066`). That requires peer-manager hooks V2 and a stable identity (`ln_node.rs:1072-1100`).
9. Transport: the node opens a WebSocket to the gateway (`proxyUrl`). For each peer the URL is `proxy_url_for_peer(proxyUrl, peerAddr)` plus `?auth_token=<relayAuthToken>&node_id=<relayNodeId>` (and replay/session params) (`ln_transport.rs:394-420`). The gateway relays to lsp-signet.utexo.com:9735 over TCP. Without auth the hosted gateway rejects the WS upgrade with 401 (d.ts `RlnNetworkUrls.relayAuthToken`). The `utexo` preset in `DEFAULT_RLN_URLS` (dist L502-511) has `proxyUrl wss://ln-gateway-signet.utexo.com` plus the public relayAuthToken/relayNodeId. Note: the `signet` preset is a **placeholder** (`wss://rln-proxy-utexo.utexo.com/rgb/json-rpc`, "TODO"). Always use `network:'utexo'`, which we already do.
10. **Channel opening: utexo-lsp is not LSPS1/LSPS2.** Its cron (every `CRON_EVERY`, default 30s) runs `listpeers` and `listchannels` and **auto-`openchannel`s to any connected peer that is missing a channel** in an allow-listed `SUPPORTED_ASSET_IDS` asset (utexo-lsp README "Cron jobs" and "SUPPORTED_ASSET_IDS"). `CHANNEL_PROVISION_GRACE` exists so a client that opens its own channel isn't raced. So the LSP funds the inbound channel. The client only has to **stay connected** (browser tab alive, peer session up) and then `lsp.waitForChannel(assetId)`, which polls `syncWallet()` and `listChannels()` every 2s. A client-funded channel is `wallet.openChannel(params)`, which runs openChannel, then listPendingFundingRequests, then buildLightningFundingTx, then submitFundingTransaction. That spends funds, so it is **not needed and not done**.
11. Receive: `lsp.receiveAsset({assetId, amountSats, amountRgb})` calls `wallet.createLightningInvoice(...)` and then `POST /lightning_receive` returns an rgbInvoice. `awaitReceiveSettlement` polls `syncWallet()` and `getLightningReceiveStatus()` every 2s.

## 2. Root causes per symptom
| Symptom | Most likely cause |
|---|---|
| `panicked at ldk_live_backend.rs:1513:36 already mutably borrowed: BorrowError`, then `RuntimeError: unreachable` | The wallet facade and LDK share one `Rc<RefCell<Wallet>>`. A wallet op holds `borrow_mut` across an `await` (refreshWallet, syncWallet, backup, createUtxos, listAssets...). Meanwhile a node op (connectPeer, listChannels, attach or the lazy `ensure_object_graph`, or the 1s drive tick) does `.borrow()` and panics. A Rust panic in wasm aborts the instance, so **every later call hits `unreachable`** until a page reload. In our code many loops run concurrently (see §3), and `UtexoLsp.waitForChannel` and `awaitReceiveSettlement` each call `syncWallet()` every 2s for up to 30 min, in parallel with `scheduleRgbRefresh`, `armContractRefresh` (20s), `retryScan`, `ensureRgbAllocations`, the consignment subscription, and visibility-change `flushWalletState`/backup. The old rln-wasm 0.10 also lacks upstream borrow fixes. |
| `RGB wallet is busy with another operation; retry shortly` (repeated) | Same contention, but on the facade side, which uses `try_borrow`/`try_borrow_mut` and returns this retryable error instead of panicking (`sdk_facade.rs:2460-2471`). It proves that ops overlap. |
| `[wallet-lsp] connect failed Cannot read properties of undefined (reading 'connectPeer')` (earlier build) | `UtexoLsp.connect()` does `this.wallet.connectPeer(...)`. The earlier build called `lsp.connect` detached (destructured), so `this` was undefined and `this.wallet` was undefined. (A missing node gives a different, explicit error from `requireNode()`.) The current `bindLspClient()` in `signet-lsp.ts:170-191` already fixes this by binding. Not a wrong method name: the node method really is `connectPeer`. |
| `createLightningInvoice is undefined` | Same `this`-loss pattern (`receiveAsset` calls `this.wallet.createLightningInvoice`). Or it was called on the node binding / `getLightningNode()`, which only has `createLnInvoice`. `createLightningInvoice` exists only on `UTEXOWallet` (d.ts L706). |
| `[wallet-lsp] get_info {peerPubkey 02a621…, lsp-signet.utexo.com:9735}`, then Lightning "Not ready", "LSP channel not open" | Discovery works. But the channel only appears after the peer stays connected through an LSP cron tick and the funding confirms. `lightningStore.ready` is only set to true inside `waitSignetChannel()`, which only runs after `awaitReceiveSettlement` returns `'settled'` (`signet-lsp.ts:358-369`). So it is never set unless an on-chain inbound settles. Once the wasm has panicked, the peer session is dead too. |
| `[wallet-init] RLN handshake failed: Error: Wallet init timed out` | `limitWait(wallet.init(), 20s)` (`wallet-init.ts:145`). Causes: (a) a wasm instance already poisoned by an earlier panic in the same tab, (b) cold init on a fresh profile. That is upstream issue rgb-sdk-web#13, where beta.12 `init()` fails or hangs with "sdk node runtime is locked; call unlock first" (fix in open PR #14). (c) Slow VSS/IndexedDB. Also note that `limitWait` does not cancel the work. The init keeps running in the background, and a retry starts a **second concurrent init**, which is more borrow contention. |
| wallet-diagnostic first `nodeId:null`/`hasAuth:false` and undefined rln-wallet fields, later `hasAuth:true` with `/rln_dd7f7df5_signet` | Early reads happened before `setRelaySessionAuth` and before the `create()` JSON was parsed (`walletInitFields` fix in `rgb-wallet-config.ts`). The later values are correct. Note that the runtime id `dd7f7df5` is the master fingerprint, while the E2E pinned dataDir is `rln_73c5da0a_signet`. Don't mix them, or you get a different node identity and a different LSP channel. |
| `[wallet-persist] wallet.flush missing` | beta.12 `UTEXOWallet` has no `flush`/`flushValue`. Persistence is `createBackup()` / `getLastBackupBytes()` / VSS (`backupNow`, `vssBackup`). `flushWalletState()` (`wallet-balances.ts:1047`) falls back to the raw `backup(password)`, which is another wallet borrow that is fired un-awaited on `visibilitychange`/`pagehide` (`:1093-1104`). |
| `POST https://esplora-api.utexo.com/tx 400` | Esplora rejects the broadcast: a double-spend, an already-spent input, or a duplicate tx, typically from overlapping createUtxos, `ensureRgbAllocations`, a send, or the retrying `installEsploraRetryFetch` rebroadcasting. Log the response body text (e.g. `bad-txns-inputs-missingorspent`, `txn-mempool-conflict`) to confirm. Serializing wallet ops (below) removes the race. |

## 3. Concrete fixes in BitTasker (`sandbox/rgb-wasm-phase0`)
Files reviewed: `src/lib/stores/wallet/wallet-init.ts`, `signet-lsp.ts`, `wallet-balances.ts`, `wallet-manager.ts`, `rgb-wallet-config.ts`, `src/lib/services/rgb/command-queue.ts`, `wasm-backend.ts`.

### 3.1 One global wasm op queue (the main fix)
`command-queue.ts` only serializes seal commands. Everything else bypasses it. Add `src/lib/stores/wallet/wasm-lock.ts`:
```ts
let tail: Promise<unknown> = Promise.resolve();
let depth = 0;
export function withWasm<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (depth > 0) return fn();            // re-entrant call from inside a locked op
  const run = tail.then(async () => { depth++; try { return await fn(); } finally { depth--; } });
  tail = run.catch(() => undefined);
  return run;
}
/** Wrap a UTEXOWallet so EVERY async method goes through the queue. */
export function lockedWallet<W extends object>(w: W): W {
  return new Proxy(w, { get(t, p, r) {
    const v = Reflect.get(t, p, r);
    return typeof v === 'function' ? (...a: unknown[]) => withWasm(String(p), async () => v.apply(t, a)) : v;
  }});
}
```
Note: the depth guard is only safe for direct nesting. For simplicity, prefer never nesting and keep each `withWasm` body a single SDK call.
- `wallet-init.ts:156`: `state.utexoWallet = lockedWallet(wallet);`. Pass the **locked** wallet to `createLsp()`, so `UtexoLsp`'s internal `this.wallet.syncWallet/listChannels/connectPeer/createLightningInvoice` calls are queued too. (`createLsp` passes `this` into `new UtexoLsp(this, peer)`, so call it as `lockedWallet(wallet).createLsp()`. Then `this` is the proxy.)
- Run `init()` and `unlock()` inside `withWasm` as well.
- `command-queue.ts` `enqueue`: wrap `task` in `withWasm` (or delete its private tail).
- `wasm-backend.ts:releaseWalletMutex()`: remove the extra `refreshWallet()` on error. It adds an overlapping op and does not "release" anything (no JS mutex exists). On "busy", retry after a backoff through the queue instead.

### 3.2 Stop abandoning in-flight ops
- `wallet-init.ts:195-201` (`finishUnlock.step`): `Promise.race(run(), 15s)` moves on while `refreshWallet`/`loadAssets` is still running, then starts the next op. That is a guaranteed overlap. Await each step fully (with the queue in place, a timeout only affects UI).
- `wallet-init.ts:74-88,145-147` `limitWait`: on timeout, do **not** retry `init()` on the same page. Set the error and offer "reload". Keep a module-level `initPromise` so a second `initialize()` returns the same promise (`shareInit` does this, but `unlockWallet()` resets `initSlot.current = null` while the old init may still be running, at `:476-479`).
- `wallet-balances.ts:1540-1552` `finishRgbRefresh`: on 'timeout' it already awaits, which is fine. But `armContractRefresh` (`:1344-1352`, 20s `loadAssets({pull:true})`) and `retryScan` must go through `withWasm` and skip when the queue is busy:
```ts
let pending = false;
setInterval(() => { if (pending) return; pending = true;
  withWasm('contract-refresh', () => loadAssets({pull:true})).finally(() => pending = false); }, 20_000);
```
- `installPersistHooks` (`:1093`): route `flushWalletState` through `withWasm`. Remove the `flush` lookup (it doesn't exist in beta.12). Call `wallet.createBackup({...})` or `backupNow()` (VSS) only.

### 3.3 Correct init and Lightning ordering
```ts
await withWasm('init',   () => wallet.init());
await withWasm('unlock', () => wallet.unlock());
await restoreOnUnlock(...);                         // queued
await W.refreshWallet(); await scanAndUpdateBalances(W); await ensureRgbAllocations(W); // sequential, awaited
W.attachLightningNode();                            // after on-chain setup (sdk doc)
W.startNodeChainSync();                             // once, after setup
if (!skipLsp) await discoverSignetLsp(W);           // awaited, last
startConsignmentSubscription();                     // its wallet calls also via withWasm
```
(`W` = lockedWallet. Today `finishUnlock` fires `discoverSignetLsp` and `ensureRgbAllocations` in parallel, at `wallet-init.ts:206-213`.)

### 3.4 LSP flow (`signet-lsp.ts`)
- Keep `bindLspClient` (fixes the `connectPeer` undefined error), but create the LSP from the locked wallet.
- After `connect()`, do not gate the channel on an on-chain settlement. The LSP cron opens the channel to a connected peer. So:
```ts
await lsp.connect();                                   // queued connectPeer
W.getLightningNode()?.reconnectManagerStart?.(...)     // or rely on installAutoPeerManagerHooks; keep peer alive
void waitSignetChannel();                              // poll interval ≥10s, not 2s: lsp.waitForChannel(asset,{pollIntervalMs:10_000, timeoutMs})
```
- `watchLspSettlement` and `waitSignetChannel` must not both poll. Run only one poller at a time (a guard flag), and use `pollIntervalMs: 10_000` to cut the `syncWallet` load.
- Ensure `SIGNET_USDT_ASSET` is in the LSP `supported_assets`. Only those get auto-provisioned.
- No `openChannel` call anywhere (respecting the no-channel-without-approval rule).

### 3.5 Panic recovery
Add a global listener. When a message matches `/unreachable|already (mutably )?borrowed|RuntimeError/`, set `walletStore.error = 'Wallet engine crashed – reload'`, stop all timers (`clearRefreshTimers`, `stopContractRefresh`), and do not retry calls on the dead instance.

### 3.6 Upgrade path
beta.12 + rln-wasm 0.10 is old. Options: (a) ask UTEXO for an rgb-sdk-web release on rln-wasm ≥0.15 (main is already there), or (b) test an `overrides: {"@utexo/rln-wasm": "0.15.0-beta.3"}` in package.json on a branch (risky: API drift between 0.10 and 0.15 bindings; verify the d.ts first).

### 3.7 esplora 400
In `installEsploraRetryFetch` (wallet-balances.ts:227), never retry `POST /tx`. Log `await res.text()` on 400 to see the reason. Serializing via §3.1 removes concurrent createUtxos/send double-spends.

## 4. Upstream issues and PRs
- rgb-sdk-web#13 (open): `UTEXOWallet.init()` fails on a fresh Lightning-enabled browser wallet: "sdk node runtime is locked; call unlock first" (beta.12). https://github.com/UTEXO-Protocol/rgb-sdk-web/issues/13
- rgb-sdk-web#14 (open PR): defer the Lightning node handle to unlock for fresh wallets (fixes #13). https://github.com/UTEXO-Protocol/rgb-sdk-web/pull/14
- rgb-sdk-web#7 (closed): rgb-lib-wasm panics "unreachable" on a fresh wallet's first asset-list load. https://github.com/UTEXO-Protocol/rgb-sdk-web/issues/7
- rgb-lightning-node#181 (open): deploy a new rln gateway (new lightweight-SDK gateway from PR #174). The gateway/proxy is in flux. https://github.com/UTEXO-Protocol/rgb-lightning-node/issues/181
- rgb-lightning-node commits: `6037771` Fix cold browser runtime initialization (2026-10-02); `a42431a` keep WASM Lightning guards scoped to their owning node (2026-09-23); `263d026` Fix lsp apay communication (#89). The connectPeer borrow-across-await fix is documented in-code at `bindings/wasm-sdk/src/ln_node.rs` ~L1100 ("the 1s drive tick's event draining does peers.borrow_mut(), which would panic the whole wasm instance").
- utexo-lsp#39: get_info publishes LSP policy instead of proxying node state (affects `supported_assets` parsing). https://github.com/UTEXO-Protocol/utexo-lsp/pull/39
- No GitHub issue matching "BorrowError"/"already mutably borrowed" or "busy with another operation" exists in the org. Consider filing one with the stack trace (needs user approval).

## 5. UTEXO-Protocol public repos (55)
| Repo | Purpose / relevance |
|---|---|
| rgb-lightning-node | **Primary.** RLN daemon plus `bindings/wasm-sdk` (rln-wasm source: ldk_live_backend.rs, ln_node.rs, ln_transport.rs, sdk_facade.rs, gateway docs) |
| rgb-sdk-web | **Primary.** `@utexo/rgb-sdk-web` (UTEXOWallet, RlnWasmBinding, docs/lsp.md, issues #13/#14) |
| rgb-sdk-core | Shared TS core: `UtexoLsp`, `UtexoLSPClient`, LSP types (connect/waitForChannel/receiveAsset) |
| utexo-lsp | **Primary.** The LSP (Go): /get_info, /lightning_receive; cron auto-opens channels to connected peers |
| rgb-sdk-web-sandbox | Official browser demo of rgb-sdk-web plus rln-wasm. Reference init/LSP ordering |
| docs | UTEXO docs site (SDK/LSP guides) |
| utexo-rln-sdk | Lightweight RLN SDK (empty repo at clone time) |
| rgb-lightning-node-old | Previous RLN fork. Historical |
| rust-lightning | UTEXO's LDK fork (RGB-colored channels) used by RLN/wasm |
| ldk-node | LDK node fork |
| rgb-lib / rgb-lib-old | Core RGB wallet lib (the RefCell'd wallet inside the wasm) |
| rgb-lib-wasm | WASM build of rgb-lib (`@utexo/rgb-lib-wasm`) |
| rgb-lib-nodejs/-python/-go/-c-sharp/-kotlin/-swift/-jvm/-bare | Language bindings of rgb-lib. Not browser-relevant |
| rgb-sdk | Node.js RGB SDK (older non-WASM) |
| rgb-sdk-rn / rgb-sdk-rn-sandbox | React Native SDK and sandbox. RN connectPeer(peerUri) parity reference |
| rgb-lightning-node-bare / -nodejs | C-FFI/napi bindings of RLN for Bare/Node. Not browser |
| wdk-rgb-lightning / wdk-wallet-rgb / wdk-starter-react-native / utexo-rgb-wdk-sandbox | Tether WDK integrations. Not browser-wasm |
| rln-external-signer / enclave-signer / vls-core / vls-protocol-signer | Remote/enclave signing. Not relevant |
| rgb-proxy-server / rgb-proxy-sandbox | RGB consignment proxy (`rgb-proxy.utexo.com/json-rpc` = transportEndpoint) |
| vss-server | Versioned Storage Service (VSS backups. We set vssUrl:null) |
| rapid-gossip-sync-server | LN gossip sync. Minor |
| thunder-swap | Submarine-swap client for RLN |
| rgb-btcpay-plugin | BTCPay plugin. No |
| rgb-node / rgb-node-api | RGB node service and API. Indirect |
| btc-relay / bridge-smart-contracts / usdt0-smart-contracts | Bridge/EVM. No |
| consignment-utils | RGB consignment tooling. Minor |
| webrgb / webrgb-walletconnect | window.rgb provider spec. No |
| flutter-sdk | Flutter SDK. No |
| rgb-sdk-dfns-poc / bdk-rn / rln-telegram-bot / RTR / kimi-actions | PoCs, bot (the faucet node we refuse), CI tools. No |
