# Fix: `url parse` Error in RGB SDK WASM Runtime

## Problem

The WASM runtime's `Url::parse` fails on `data_dir: "/rln_aa86c3a2_testnet"` — a schemeless path that Rust's URL parser rejects.

**Error trace:**
```
rln_wasm_sdk_bg.wasm:0x15769ab [wallet-diagnostic:rln-throw] url parse Error: rln-throw
```

**Root cause:** The SDK constructs `data_dir` as `/rln_{fingerprint}_{network}` internally and passes it to `Url::parse`.

## Files to Modify

1. `src/lib/stores/wallet/wallet-init.ts` — Add `dataDir` param, remove mnemonic logging
2. `src/lib/stores/wallet/wallet-balances.ts` — Already fixed (HTTPS indexer URLs)
3. SDK's `index.mjs` — Patch `data_dir` assignment if SDK ignores `dataDir` param

## Step 1: Find the SDK's dist file

```powershell
# Windows PowerShell
Get-ChildItem -Path "node_modules" -Recurse -Filter "index.mjs" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match "rgb-sdk-web" } | Select-Object FullName
```

```bash
# macOS/Linux
find node_modules -path "*/rgb-sdk-web/dist/index.mjs" -type f 2>/dev/null
```

## Step 2: Inspect the SDK's data_dir construction

```powershell
# Search for data_dir in the SDK
Select-String -Path "node_modules\@utexo\rgb-sdk-web\dist\index.mjs" -Pattern "data_dir" -Context 3,3
```

```bash
# macOS/Linux
grep -n -C 3 "data_dir" node_modules/@utexo/rgb-sdk-web/dist/index.mjs
```

Expected output shows something like:
```js
data_dir: `/rln_${fingerprint}_${network}`
```

## Step 3: Patch the SDK's data_dir (if needed)

If the SDK ignores our `dataDir` param, patch `index.mjs`:

**Find this pattern:**
```js
data_dir: `/rln_${fingerprint}_${network}`
```

**Replace with:**
```js
data_dir: `rln_${fingerprint}_${network}`
```

(Remove the leading `/` to make it a relative path)

### Automated patch (PowerShell):
```powershell
$filePath = "node_modules\@utexo\rgb-sdk-web\dist\index.mjs"
$content = Get-Content $filePath -Raw
$content = $content -replace "data_dir:\s*`/rln_", "data_dir: `rln_"
$content = $content -replace "data_dir:\s*'/rln_", "data_dir: 'rln_"
$content = $content -replace 'data_dir:\s*"/rln_', 'data_dir: "rln_'
Set-Content $filePath $content
Write-Host "Patched data_dir in $filePath"
```

### Automated patch (Bash):
```bash
sed -i "s|data_dir: \`/rln_|data_dir: \`rln_|g" node_modules/@utexo/rgb-sdk-web/dist/index.mjs
sed -i "s|data_dir: '/rln_|data_dir: 'rln_|g" node_modules/@utexo/rgb-sdk-web/dist/index.mjs
sed -i 's|data_dir: "/rln_|data_dir: "rln_|g' node_modules/@utexo/rgb-sdk-web/dist/index.mjs
echo "Patched data_dir"
```

## Step 4: Update wallet-init.ts create args

In `src/lib/stores/wallet/wallet-init.ts`, find the `tryIndexers` function and update the create call:

```typescript
wallet = await create({
    mnemonic: params.mnemonic,
    password: params.password,
    network: params.network,
    indexerUrl: params.indexerUrl,
    transportEndpoint: params.transportEndpoint,
    proxyUrl: params.proxyUrl,
    vssUrl: null,
    dataDir: 'rln-testnet',           // <-- ADD: relative path, no leading slash
    enableVirtualChannels: false       // <-- ADD: disable RLN channels
});
```

## Step 5: Remove mnemonic from console logs (SECURITY)

In `src/lib/stores/wallet/wallet-init.ts`, find this diagnostic log:

```typescript
// BEFORE (DANGEROUS - leaks mnemonic!):
console.info('[wallet-diagnostic:rln-wallet]', { ...walletPayload, mnemonic: "..." });

// AFTER (safe - only log non-sensitive fields):
const { mnemonic: _mn, account_xpub_vanilla: _xv, account_xpub_colored: _xc, ...safePayload } = walletPayload;
console.info('[wallet-diagnostic:rln-wallet]', safePayload);
```

Note: The mnemonic leak is in the SDK's internal logging, not in our code. We can't easily suppress it without patching the SDK. **Rotate the wallet mnemonic after debugging.**

## Step 6: Use a real proxy URL (not dummy wss://127.0.0.1)

The `wss://127.0.0.1/disabled-rln` dummy URL might also cause issues. Update `rlnProxyUrl` in `wallet-balances.ts`:

```typescript
export function rlnProxyUrl(url: string | undefined): string {
    if (typeof url === 'string' && url.trim().startsWith('wss://')) {
        return url.trim();
    }
    // Use a real LN gateway URL for testnet
    return 'wss://ln-gateway-signet.utexo.com';
}
```

## Step 7: Create postinstall script to auto-patch SDK

Create `scripts/patch-rgb-sdk.mjs`:

```javascript
// scripts/patch-rgb-sdk.mjs
import { readFileSync, writeFileSync, globSync } from 'fs';
import { join } from 'path';

const files = globSync('node_modules/@utexo/rgb-sdk-web/dist/index.mjs');

for (const file of files) {
    let content = readFileSync(file, 'utf8');
    const original = content;
    
    // Fix data_dir: /rln_ -> rln_ (relative path)
    content = content.replace(/data_dir:\s*`\/rln_/g, 'data_dir: `rln_');
    content = content.replace(/data_dir:\s*'\/rln_/g, "data_dir: 'rln_");
    content = content.replace(/data_dir:\s*"\/rln_/g, 'data_dir: "rln_');
    
    if (content !== original) {
        writeFileSync(file, content);
        console.log(`[patch-rgb-sdk] Fixed data_dir in ${file}`);
    }
}
```

Add to `package.json`:
```json
{
    "scripts": {
        "postinstall": "node scripts/patch-rgb-sdk.mjs"
    }
}
```

## Step 8: Test

```powershell
# Clear IndexedDB cache
# (Open DevTools > Application > IndexedDB > Delete rln_wasm_sdk_runtime)

# Restart dev server
pnpm dev
```

Expected console output:
```
[wallet-diagnostic:create-args] {
    network: 'testnet',
    indexerUrl: 'https://blockstream.info/testnet/api',
    transportEndpoint: 'https://rgb-proxy.utexo.com/json-rpc',
    proxyUrl: 'wss://ln-gateway-signet.utexo.com',
    vssUrl: null
}
[wallet-init] esplora indexer ready https://blockstream.info/testnet/api
[wallet-diagnostic:ready] { ... }
```

No `url parse` error should appear.

## Verification Checklist

- [ ] `indexerUrl` is `https://` (not `ssl://`)
- [ ] `proxyUrl` is `wss://` (not `https://` or `wss://127.0.0.1`)
- [ ] `data_dir` has no leading `/` in SDK's index.mjs
- [ ] Mnemonic rotated (old one leaked in logs)
- [ ] IndexedDB cleared before test
- [ ] No `url parse` error in console
- [ ] Wallet balance loads successfully

## If Blockstream Returns 429

The `installEsploraRetryFetch()` in wallet-balances.ts handles 429 retries. If persistent, switch to mempool.space:

```typescript
// In resolveRgbIndexerUrl:
if (network === 'testnet') return 'https://mempool.space/testnet/api';
```