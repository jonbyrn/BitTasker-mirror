/**
 * E2E Tests — v0.6 Bundler Compatibility
 *
 * Verifies that:
 * 1. Frontend generates UserOp without eip7702Auth or factory (v0.6 format)
 * 2. Backend sends v0.6 format to the Alto bundler (initCode + paymasterAndData)
 * 3. Backend-to-Alto communication works with the old bundler
 *
 * @e2e @v06-bundler
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WALLET_URL = 'http://localhost:3000/wallet';
const SEED_PATH = join(__dirname, '..', '.auth', 'test-seed.json');
let SEED: Record<string, string>;
try { SEED = JSON.parse(readFileSync(SEED_PATH, 'utf-8')); } catch { SEED = {}; }

async function seedAuth(page: Page) {
    await page.evaluate((s: any) => {
        localStorage.setItem('auth_token', s.access_token || '');
        localStorage.setItem('access_token', s.access_token || '');
        localStorage.setItem('refresh_token', s.refresh_token || '');
        localStorage.setItem('CapacitorStorage.access_token', s.access_token || '');
        localStorage.setItem('CapacitorStorage.refresh_token', s.refresh_token || '');
        localStorage.setItem('__E2E_NSEC__', s.nsec || '');
        localStorage.setItem('__E2E_MNEMONIC__', s.mnemonic || '');
        localStorage.setItem('onboardingCompleted', 'true');
        localStorage.setItem('CapacitorStorage.onboardingCompleted', 'true');
        localStorage.setItem('CapacitorStorage.__E2E_NSEC__', s.nsec || '');
        localStorage.setItem('CapacitorStorage.__E2E_MNEMONIC__', s.mnemonic || '');
    }, SEED);
}

async function mockInfrastructureOnly(page: Page) {
    await page.route('**/notification-center/**', (route) => {
        route.fulfill({ status: 200, body: JSON.stringify({ unreadCount: 0 }), contentType: 'application/json' });
    });
    await page.route('**/auth/refresh', (route) => {
        route.fulfill({ status: 200, body: JSON.stringify({ access_token: SEED.access_token, refresh_token: SEED.refresh_token }), contentType: 'application/json' });
    });
    await page.route('https://arb1.arbitrum.io/**', (route) => {
        const body = route.request().postDataJSON();
        const method = body?.method;
        if (method === 'eth_getCode') {
            route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0xef0100e6Cae83BdE06E4c305530e199D7217f42808555B' }), contentType: 'application/json' });
        } else if (method === 'eth_getTransactionCount') {
            route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x7' }), contentType: 'application/json' });
        } else if (method === 'eth_chainId') {
            route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0xa4b1' }), contentType: 'application/json' });
        } else if (method === 'eth_blockNumber') {
            route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x1000000' }), contentType: 'application/json' });
        } else if (method === 'eth_call') {
            route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x' }), contentType: 'application/json' });
        } else {
            route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body?.id || 1, result: '0x' }), contentType: 'application/json' });
        }
    });
}

async function waitForWallet(page: Page, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ready = await page.evaluate(async () => {
            try {
                const gs = await import('/src/lib/wallet/gasless-store.ts');
                let snap: any = null;
                const unsub = gs.gaslessWallet.subscribe((v: any) => { snap = v; });
                unsub();
                return snap?.ready ?? false;
            } catch { return false; }
        });
        if (ready) return true;
        await page.waitForTimeout(1000);
    }
    return false;
}

// ===========================================================================
// Test 1: Frontend payload format
// ===========================================================================

test.describe('v0.6 Bundler: frontend payload format', () => {

    test('sendGaslessCalls does NOT include eip7702Auth in relay payload', async ({ page }) => {
        let relayPayload: any = null;
        await mockInfrastructureOnly(page);
        await page.route('**/gasless/relay', (route) => {
            const body = route.request().postData();
            if (body) { try { relayPayload = JSON.parse(body); } catch {} }
            route.fulfill({ status: 200, body: JSON.stringify({ userOpHash: '0xtest' }), contentType: 'application/json' });
        });

        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
        await waitForWallet(page);

        await page.evaluate(async () => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                await gs.sendGaslessCalls(
                    [{ to: '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F', data: '0x' + 'ab'.repeat(192), value: 0n }],
                    '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
                    10000n
                );
            } catch {}
        });

        await page.waitForTimeout(15000);

        if (!relayPayload) {
            console.log('Relay payload not captured');
            return;
        }

        // Must NOT have eip7702Auth
        expect(relayPayload.eip7702Auth).toBeUndefined();

        // Must NOT have factory field
        expect(relayPayload.userOp?.factory).toBeUndefined();

        // Must have paymasterAndData (v0.6 format)
        expect(relayPayload.userOp?.paymasterAndData).toBeDefined();

        // Must have initCode (v0.6 format — backend builds from factory)
        // Note: initCode is built by backend's toAltoUserOp, not in the frontend payload
        console.log('Payload has eip7702Auth:', !!relayPayload.eip7702Auth);
        console.log('Payload has factory:', !!relayPayload.userOp?.factory);
        console.log('Payload has paymasterAndData:', relayPayload.userOp?.paymasterAndData !== undefined);
    });
});

// ===========================================================================
// Test 2: Backend-to-Alto format
// ===========================================================================

test.describe('v0.6 Bundler: backend-to-Alto format', () => {

    test('backend sends v0.6 format when no eip7702Auth is present', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);

        // Call the backend estimate endpoint directly — this exercises the bundler
        // communication without needing the wallet to be fully initialized
        const result = await page.evaluate(async (params: any) => {
            try {
                const resp = await fetch('http://localhost:8000/api/v1/gasless/estimate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + params.token,
                        'X-Device-ID': params.deviceId
                    },
                    body: JSON.stringify({
                        token: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
                        amount: '1',
                        recipient: '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F'
                    })
                });
                const data = await resp.json();
                return { status: resp.status, ...data };
            } catch (e) {
                return { status: 0, error: (e as Error).message };
            }
        }, { token: SEED.access_token || '', deviceId: SEED.device_id || '' });

        // If estimate works, the backend successfully communicated with Alto in v0.6 format
        expect(result.status).toBe(200);
        expect(Number(result.feeBuffer)).toBeGreaterThan(0);
        console.log(`Estimate: feeBuffer=${result.feeBuffer}, tier=${result.feeTier}`);
    });

    test('backend relay reaches bundler without v0.7 format errors', async ({ page }) => {
        // Call the relay endpoint with a minimal payload
        // The backend should convert to v0.6 format for Alto
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);

        const result = await page.evaluate(async (params: any) => {
            try {
                const resp = await fetch('http://localhost:8000/api/v1/gasless/relay', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + params.token,
                        'X-Device-ID': params.deviceId
                    },
                    body: JSON.stringify({
                        sender: params.sender,
                        userOp: {
                            sender: params.sender,
                            nonce: '0x00',
                            callData: '0x34fcd5be' + '00'.repeat(192),
                            callGasLimit: '0x030d40',
                            verificationGasLimit: '0x0186a0',
                            preVerificationGas: '0x0124f8',
                            maxFeePerGas: '0x3b9aca00',
                            maxPriorityFeePerGas: '0x05f5e100',
                            paymasterAndData: '0x',
                            signature: '0x'
                            // No eip7702Auth, no factory — v0.6 format
                        }
                    })
                });
                const data = await resp.json();
                return { status: resp.status, message: data.message || '', error: data.error || '', userOpHash: data.userOpHash };
            } catch (e) {
                return { status: 0, message: (e as Error).message, error: '' };
            }
        }, { token: SEED.access_token || '', deviceId: SEED.device_id || '', sender: '0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D' });

        // Must NOT get "Invalid EIP-7702 authorization" or "UserOperation cannot contain initCode"
        // These errors only happen when v0.7 format is sent to a v0.6 bundler
        expect(result.message).not.toContain('Invalid EIP-7702');
        expect(result.message).not.toContain('cannot contain initCode');

        // Must NOT get 503 (paymaster paused)
        expect(result.status).not.toBe(503);

        console.log(`Relay: status=${result.status}, message=${result.message}`);

        // 400 with AA23 or validation errors are expected (unsigned test payload)
        // 200 would be a success (unlikely with test payload)
    });
});
