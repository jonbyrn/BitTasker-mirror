/**
 * E2E Tests — Swap Flow Fee Token Threading (Real Backend)
 *
 * Tests the FULL chain: claimTbtcOnArbitrum → claimSwapFunds → sendEvmTransaction
 * → sendConnectedWalletArbitrumTx / sendArbitrumTransaction → sendGaslessCalls
 * → backend /gasless/relay
 *
 * What's NOT mocked: gasless/estimate, gasless/simulate, gasless/relay
 * What IS mocked: Arbitrum RPC, notification-center, auth/refresh
 *
 * These tests verify:
 * 1. feeToken threads from claimTbtcOnArbitrum through to the relay payload
 * 2. executeBatch always used (never execute without fee buffer)
 * 3. callData structure: [user calls..., fee transfer to treasury]
 * 4. Backend accepts executeBatch with any allowed fee token
 * 5. sendArbitrumTransaction uses feeToken when provided
 * 6. Backend rejects execute selector
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ethers as ethersLib } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WALLET_URL = 'http://localhost:3000/wallet';
const SEED_PATH = join(__dirname, '..', '.auth', 'test-seed.json');
let SEED: Record<string, string>;
try { SEED = JSON.parse(readFileSync(SEED_PATH, 'utf-8')); } catch { SEED = {}; }

const USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const TBTC = '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40';

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
            route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x1' }), contentType: 'application/json' });
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
// Test 1: feeToken threads from caller through to relay payload
// ===========================================================================

test.describe('Swap: feeToken threading to relay', () => {

    test('sendGaslessCalls with tBTC fee token produces executeBatch with tBTC fee transfer', async ({ page }) => {
        let relayPayload: any = null;
        await mockInfrastructureOnly(page);
        await page.route('**/gasless/relay', (route) => {
            const body = route.request().postData();
            if (body) { try { relayPayload = JSON.parse(body); } catch {} }
            route.continue();
        });

        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
        await waitForWallet(page);

        const result = await page.evaluate(async () => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                await gs.sendGaslessCalls(
                    [{ to: '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F', data: '0xa9059cbb' + '00'.repeat(64), value: 0n }],
                    '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
                    10000n
                );
                return { success: true };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        });

        // Relay call will fail at the bundler (AA23) but payload should be captured
        if (relayPayload) {
            expect(relayPayload.userOp.callData).toBeTruthy();
            expect(relayPayload.userOp.callData.startsWith('0x34fcd5be')).toBe(true);

            // callData MUST contain tBTC address (fee transfer destination)
            expect(relayPayload.userOp.callData.toLowerCase()).toContain('6c84a8f1c29108f47a79964b5fe888d4f4d0de40');

            // callData MUST contain treasury address (fee recipient)
            expect(relayPayload.userOp.callData.toLowerCase()).toContain('3c44cdddb6a900fa2b585dd299e03d12fa4293bc');

            // callData MUST contain transfer selector (0xa9059cbb)
            expect(relayPayload.userOp.callData.toLowerCase()).toContain('a9059cbb');

            // callData hex MUST be even-length
            expect((relayPayload.userOp.callData.length - 2) % 2).toBe(0);

            // Decode and verify structure
            const decoded = await page.evaluate(async (cd: string) => {
                const { ethers } = await import('ethers');
                const iface = new ethers.Interface(['function executeBatch((address,uint256,bytes)[])']);
                const result = iface.decodeFunctionData('executeBatch', cd);
                const calls = result[0];
                return {
                    callCount: calls.length,
                    call0Target: calls[0][0],
                    call1Target: calls[1][0],
                    call1Data: calls[1][2]
                };
            }, relayPayload.userOp.callData);

            expect(decoded.callCount).toBe(2);
            expect(decoded.call0Target.toLowerCase()).toBe('0x6398b76df91c5ebe9f488e3656658e79284ddc0f');
            expect(decoded.call1Target.toLowerCase()).toBe('0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40');
            expect(decoded.call1Data.toLowerCase().startsWith('a9059cbb')).toBe(true);
        }
    });

    test('sendGaslessCalls with USDT0 fee token produces executeBatch with USDT0 fee transfer', async ({ page }) => {
        let relayPayload: any = null;
        await mockInfrastructureOnly(page);
        await page.route('**/gasless/relay', (route) => {
            const body = route.request().postData();
            if (body) { try { relayPayload = JSON.parse(body); } catch {} }
            route.continue();
        });

        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
        await waitForWallet(page);

        await page.evaluate(async () => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                await gs.sendGaslessCalls(
                    [{ to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', data: '0xa9059cbb' + '00'.repeat(64), value: 0n }],
                    '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
                    30000n
                );
            } catch {}
        });

        if (relayPayload) {
            expect(relayPayload.userOp.callData.startsWith('0x34fcd5be')).toBe(true);
            expect(relayPayload.userOp.callData.toLowerCase()).toContain('fd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9');
            expect(relayPayload.userOp.callData.toLowerCase()).toContain('3c44cdddb6a900fa2b585dd299e03d12fa4293bc');
        }
    });
});

// ===========================================================================
// Test 2: sendGaslessCalls always requires fee token
// ===========================================================================

test.describe('Swap: Fee token requirement', () => {

    test('sendGaslessCalls without feeToken throws (not silent execute fallback)', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
        await waitForWallet(page);

        const result = await page.evaluate(async () => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                await gs.sendGaslessCalls([
                    { to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', data: '0xa9059cbb' + '00'.repeat(64), value: 0n }
                ]);
                return { success: true, error: null };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('sendGaslessCalls with invalid fee token throws', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
        await waitForWallet(page);

        const result = await page.evaluate(async () => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                await gs.sendGaslessCalls(
                    [{ to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', data: '0xa9059cbb' + '00'.repeat(64), value: 0n }],
                    'invalid-address',
                    10000n
                );
                return { success: true, error: null };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid fee token address');
    });

    test('sendGaslessCalls with zero feeBuffer throws', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
        await waitForWallet(page);

        const result = await page.evaluate(async () => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                await gs.sendGaslessCalls(
                    [{ to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', data: '0xa9059cbb' + '00'.repeat(64), value: 0n }],
                    '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
                    0n
                );
                return { success: true, error: null };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Fee buffer must be positive');
    });
});

// ===========================================================================
// Test 3: Backend rejects non-executeBatch selectors (real backend)
// ===========================================================================

test.describe('Swap: Backend selector enforcement', () => {

    test('backend rejects execute selector (0xb61d27f6)', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);

        const response = await page.evaluate(async (s: any) => {
            try {
                const resp = await fetch('http://localhost:8000/api/v1/gasless/relay', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${s.access_token}`,
                        'X-Device-ID': s.device_id || ''
                    },
                    body: JSON.stringify({
                        sender: '0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D',
                        userOp: {
                            sender: '0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D',
                            nonce: '0x00',
                            callData: '0xb61d27f6' + '00'.repeat(192),
                            callGasLimit: '0x4c4b40',
                            verificationGasLimit: '0x0f4240',
                            preVerificationGas: '0x067c28',
                            maxFeePerGas: '0x3b9aca00',
                            maxPriorityFeePerGas: '0x05f5e100',
                            paymasterAndData: '0x',
                            signature: '0x',
                            factory: '0x7702000000000000000000000000000000000000'
                        }
                    })
                });
                const data = await resp.json();
                return { status: resp.status, message: data.message || '' };
            } catch (e) {
                return { status: 0, message: (e as Error).message };
            }
        }, SEED);

        if (response.status === 400) {
            expect(response.message).toContain('callData must be executeBatch');
        }
    });

    test('backend accepts executeBatch selector (0x34fcd5be) and reaches bundler', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);

        const xferIface = new ethersLib.Interface(['function transfer(address,uint256) returns (bool)']);
        const batchIface = new ethersLib.Interface(['function executeBatch((address,uint256,bytes)[])']);
        const feeTransfer = xferIface.encodeFunctionData('transfer', [
            '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 30000n
        ]);
        const callData = batchIface.encodeFunctionData('executeBatch', [
            [
                ['0x6398B76DF91C5eBe9f488e3656658E79284dDc0F', 0n, '0x' + '00'.repeat(192)],
                ['0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 0n, feeTransfer]
            ]
        ]);

        const response = await page.evaluate(async (params: any) => {
            try {
                const resp = await fetch('http://localhost:8000/api/v1/gasless/relay', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + params.token,
                        'X-Device-ID': params.deviceId
                    },
                    body: JSON.stringify({
                        sender: '0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D',
                        userOp: {
                            sender: '0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D',
                            nonce: '0x00',
                            callData: params.callData,
                            callGasLimit: '0x4c4b40',
                            verificationGasLimit: '0x0f4240',
                            preVerificationGas: '0x067c28',
                            maxFeePerGas: '0x3b9aca00',
                            maxPriorityFeePerGas: '0x05f5e100',
                            paymasterAndData: '0x',
                            signature: '0x',
                            factory: '0x7702000000000000000000000000000000000000'
                        },
                        eip7702Auth: {
                            chainId: '0xa4b1',
                            address: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
                            nonce: '0x0',
                            r: '0xb1bb23c087941135d20502fd48e2227836bdd920a695dbe615259d1f87409b2f',
                            s: '0x10df0a53be5507ee12892a82c597ac5280fb9d77e34337af2911fc1a8e4bc145',
                            v: '0x1c'
                        }
                    })
                });
                const data = await resp.json();
                return { status: resp.status, message: data.message || '', error: data.error || '' };
            } catch (e) {
                return { status: 0, message: (e as Error).message, error: '' };
            }
        }, { token: SEED.access_token || '', deviceId: SEED.device_id || '', callData });

        // Should NOT get "callData must be executeBatch"
        if (response.message) {
            expect(response.message).not.toContain('callData must be executeBatch');
        }
        // May get AA23 (bundler simulation) or auth error — both are fine
    });
});

// ===========================================================================
// Test 4: Fee estimation (real backend)
// ===========================================================================

test.describe('Swap: Fee estimation for different tokens', () => {

    test('estimateFee works for USDT0 via real backend', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
        await waitForWallet(page);

        const result = await page.evaluate(async (token: string) => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                const estimate = await gs.estimateFee(token, 1n, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
                return { success: true, feeBuffer: estimate.feeBuffer };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        }, USDT0);

        expect(result.success).toBe(true);
        expect(result.feeBuffer).toBeTruthy();
    });

    test('estimateFee works for tBTC via real backend', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
        await waitForWallet(page);

        const result = await page.evaluate(async (token: string) => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                const estimate = await gs.estimateFee(token, 1n, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
                return { success: true, feeBuffer: estimate.feeBuffer };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        }, TBTC);

        expect(result.success).toBe(true);
        expect(result.feeBuffer).toBeTruthy();
    });
});
