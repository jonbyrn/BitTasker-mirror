# Breez SDK - Liquid Implementation Analysis

## Package Overview

**Package:** `@breeztech/breez-sdk-liquid`  
**Version:** `0.9.2-rc2` (Release Candidate 2)  
**Type:** WebAssembly (WASM) based Bitcoin Lightning & Liquid Network SDK  
**Repository:** https://github.com/breez/breez-sdk-liquid  

## Package Structure

### Main Components
- **WASM Module:** `breez_sdk_liquid_wasm_bg.wasm` (11MB)
- **JavaScript Bindings:** `breez_sdk_liquid_wasm.js` (63KB, 1845 lines)
- **TypeScript Definitions:** `breez_sdk_liquid_wasm.d.ts` (26KB, 754 lines)
- **Platform Support:** Web, Node.js, Deno environments

### Architecture
The SDK uses submarine swaps and reverse submarine swaps to bridge Lightning Network and Liquid sidechain:
- **Sending payments:** L-BTC → Lightning Network (submarine swap)
- **Receiving payments:** Lightning Network → L-BTC (reverse submarine swap)

## Current Issue: Infinite Blockstream API Loop

### Problem Description
The application is experiencing infinite HTTP requests to the Blockstream API endpoint:
```
https://blockstream.info/liquidtestnet/api/address/tex1qhr7pnjf035q24k7k49e8d85kumft550hvvhl9x/txs
```

### Investigation Findings

#### 1. WASM Implementation Details
- The SDK core is compiled from Rust to WebAssembly
- JavaScript bindings are auto-generated (1845 lines of mostly boilerplate)
- No direct access to the Rust source code logic in the npm package
- API polling logic is buried within the WASM binary

#### 2. Code Structure Analysis
```javascript
// Main WASM initialization
let wasm;

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_2.set(idx, obj);
    return idx;
}

// Error handling wrapper
function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}
```

#### 3. Key Observations
- **No Visible Polling Code:** The JavaScript layer doesn't contain explicit polling logic
- **WASM Black Box:** Core functionality is encapsulated in the 11MB WASM binary
- **RC Version Issues:** Using release candidate `0.9.2-rc2` which may have stability issues
- **Testnet Configuration:** SDK is configured for testnet, using Blockstream's testnet API

#### 4. Working Directory Configuration Issue
The SDK uses a working directory for persistent state:
```javascript
// Original problematic configuration
config.workingDir = './breez_data';

// Browser-compatible fix applied
if (typeof window !== 'undefined') {
    config.workingDir = 'breez_wallet_data';
} else {
    config.workingDir = './breez_data';
}
```

## Root Cause Analysis

### Most Likely Causes

#### 1. **WASM-Level Transaction Monitoring**
The Rust core likely implements automatic transaction monitoring that:
- Continuously polls Blockstream API for address updates
- Runs independently of JavaScript layer controls
- May not respect connection lifecycle properly
- Could be triggered by wallet state synchronization

#### 2. **Release Candidate Stability Issues**
Version `0.9.2-rc2` being a release candidate suggests:
- Potential unresolved bugs in transaction monitoring
- Incomplete cleanup mechanisms
- Race conditions in connection management

#### 3. **Liquid Testnet Synchronization**
The SDK needs to monitor Liquid testnet for:
- Transaction confirmations
- Swap status updates
- Balance changes
- Submarine swap state tracking

#### 4. **Multiple SDK Instance Problem**
Even with our connection guards, the WASM module might:
- Maintain internal state across disconnections
- Create orphaned polling timers
- Not properly clean up native resources

## Attempted Solutions (Applied)

### 1. Connection State Management ✅
```typescript
let isConnecting = false;
let sdk: BindingLiquidSdk | null = null;

export const initWallet = async (mnemonic: string): Promise<void> => {
    if (isConnecting || sdk) {
        return; // Prevent multiple connections
    }
    // ... initialization logic
};
```

### 2. Proper Cleanup on Unmount ✅
```typescript
onDestroy(() => {
    if (isConnected()) {
        await disconnect();
    }
});
```

### 3. Browser-Compatible Working Directory ✅
```typescript
if (typeof window !== 'undefined') {
    config.workingDir = 'breez_wallet_data';
}
```

### 4. Initialization State Guards ✅
```typescript
if (isWasmInitialized() && isConnected()) {
    return; // Skip re-initialization
}
```

## Why Our Fixes May Not Work

The infinite API loop persists because:

1. **WASM Independence:** The polling is likely happening at the WASM/Rust level, independent of JavaScript lifecycle
2. **Persistent State:** The SDK may maintain persistent polling even after `disconnect()`
3. **Testnet Requirements:** Liquid testnet monitoring might be essential for SDK functionality
4. **RC Version Bugs:** The release candidate may have unresolved polling cleanup issues

## Recommended Solutions

### Immediate Actions

#### 1. **Update to Stable Version**
```bash
npm install @breeztech/breez-sdk-liquid@latest
```
Check if a stable version is available that fixes the polling issue.

#### 2. **Enable SDK Logging**
```typescript
import { setLogger } from '@breeztech/breez-sdk-liquid/web';

class DebugLogger {
    log = (logEntry) => {
        console.log(`[BREEZ ${logEntry.level}]: ${logEntry.line}`);
    }
}

setLogger(new DebugLogger());
```

#### 3. **Implement Request Interception**
```typescript
// Intercept and throttle Blockstream API requests
const originalFetch = window.fetch;
const requestCache = new Map();
const THROTTLE_MS = 5000; // 5 second minimum between requests

window.fetch = async (url, options) => {
    if (url.includes('blockstream.info')) {
        const lastRequest = requestCache.get(url);
        const now = Date.now();
        
        if (lastRequest && (now - lastRequest) < THROTTLE_MS) {
            console.log('Throttling Blockstream API request:', url);
            return new Response('{"error": "throttled"}', { status: 429 });
        }
        
        requestCache.set(url, now);
        console.log('Allowing Blockstream API request:', url);
    }
    
    return originalFetch(url, options);
};
```

#### 4. **Force WASM Module Cleanup**
```typescript
// Nuclear option: reload page to reset WASM state
const cleanup = async () => {
    try {
        await sdk?.disconnect();
        // Clear WASM module references
        if (typeof window !== 'undefined') {
            // Force garbage collection
            if (window.gc) window.gc();
        }
    } catch (error) {
        console.error('Cleanup error:', error);
        // Force page reload as last resort
        // window.location.reload();
    }
};
```

### Long-term Solutions

#### 1. **Contact Breez Support**
- **Email:** contact@breez.technology
- **Telegram:** https://t.me/breezsdk
- Report the infinite polling issue with version `0.9.2-rc2`

#### 2. **Switch to Stable Implementation**
Consider using the Native (Greenlight) implementation instead:
```bash
npm install @breeztech/breez-sdk
```

#### 3. **Implement Custom Network Layer**
Override the SDK's network layer with a custom implementation that provides:
- Request throttling
- Connection pooling
- Proper cleanup

#### 4. **Use Service Worker Interception**
Implement a service worker to:
- Intercept and cache Blockstream API responses
- Throttle repeated requests
- Provide offline fallbacks

## Configuration Recommendations

### 1. **Optimal SDK Configuration**
```typescript
const config = breezSdk.defaultConfig('testnet', breezApiKey);

// Use browser-compatible settings
config.workingDir = 'breez_wallet_data';

// Add potential throttling configuration (if available)
if ('pollIntervalMs' in config) {
    config.pollIntervalMs = 30000; // 30 second polling instead of default
}
```

### 2. **Error Handling Strategy**
```typescript
const MAX_RETRIES = 3;
let retryCount = 0;

const initializeWithRetry = async () => {
    try {
        await initWallet(mnemonic);
        retryCount = 0; // Reset on success
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`Retry ${retryCount}/${MAX_RETRIES}`);
            setTimeout(initializeWithRetry, 5000 * retryCount);
        } else {
            throw new Error('Max retries exceeded');
        }
    }
};
```

## Monitoring and Debugging

### 1. **Network Request Monitoring**
```typescript
// Monitor all network requests
const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
        if (entry.name.includes('blockstream.info')) {
            console.log('Blockstream API request:', {
                url: entry.name,
                duration: entry.duration,
                startTime: entry.startTime
            });
        }
    });
});

observer.observe({ entryTypes: ['resource'] });
```

### 2. **SDK State Tracking**
```typescript
let sdkStateLog = [];

const logSdkState = (action: string) => {
    sdkStateLog.push({
        timestamp: Date.now(),
        action,
        isConnected: isConnected(),
        wasmInitialized: isWasmInitialized()
    });
    
    console.log('SDK State:', sdkStateLog.slice(-10)); // Last 10 entries
};
```

## Conclusion

The infinite Blockstream API loop is likely caused by internal WASM-level polling that's not properly controlled by the JavaScript SDK interface. This is a known issue with WebAssembly modules that maintain persistent state and background operations.

The best immediate solution is to implement request throttling at the fetch level while working with the Breez team to resolve the underlying issue in the SDK. Consider updating to the latest stable version when available, or implementing the Native (Greenlight) implementation as an alternative.

### Next Steps:
1. Implement request throttling (immediate)
2. Contact Breez support team (urgent)
3. Monitor for SDK updates (ongoing)
4. Consider implementation alternatives (backup plan) 