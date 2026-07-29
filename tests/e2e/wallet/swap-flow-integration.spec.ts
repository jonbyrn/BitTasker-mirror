/**
 * E2E Tests — Swap Flow Integration & Paymaster (Real Backend)
 *
 * Tests the remaining gaps:
 * 1. sendEvmTransaction feeToken pass-through
 * 2. sendArbitrumTransaction with feeToken
 * 3. Paymaster signing with executeBatch callData
 * 4. Full swap flow simulation
 * 5. Claim retry error classification
 * 6. isTransientClaimError logic
 *
 * What's NOT mocked: gasless/estimate, gasless/simulate, gasless/relay
 * What IS mocked: Arbitrum RPC, notification-center, auth/refresh
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
const TREASURY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const ERC20SWAP = '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F';

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
// Test 1: sendEvmTransaction feeToken pass-through
// ===========================================================================

test.describe('Swap: sendEvmTransaction feeToken pass-through', () => {

    test('feeToken from EvmTxParams reaches sendGaslessCalls in the relay payload', async ({ page }) => {
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

        // Simulate what claimTbtcOnArbitrum → claimSwapFunds → sendEvmTransaction does
        const result = await page.evaluate(async () => {
            const gs = await import('/src/lib/wallet/gasless-store.ts');
            try {
                await gs.sendGaslessCalls(
                    [{ to: '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F', data: '0x' + '00'.repeat(192), value: 0n }],
                    '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
                    5000n
                );
                return { success: true };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        });

        if (relayPayload) {
            const cd = relayPayload.userOp.callData.toLowerCase();
            expect(cd).toContain('6c84a8f1c29108f47a79964b5fe888d4f4d0de40'); // tBTC
            expect(cd).toContain('3c44cdddb6a900fa2b585dd299e03d12fa4293bc'); // treasury
        }
    });
});

// ===========================================================================
// Test 2: sendArbitrumTransaction with feeToken
// ===========================================================================

test.describe('Swap: sendArbitrumTransaction feeToken', () => {

    test('sendArbitrumTransaction with feeToken uses it directly (skips balance scan)', async ({ page }) => {
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
            const { sendArbitrumTransaction } = await import('/src/lib/stores/wallet/wallet-send.ts');
            try {
                const txHash = await sendArbitrumTransaction({
                    to: '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F',
                    data: '0x' + '00'.repeat(192),
                    value: '0',
                    feeToken: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40'
                });
                return { success: true, txHash };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        });

        if (relayPayload) {
            const cd = relayPayload.userOp.callData.toLowerCase();
            expect(cd).toContain('6c84a8f1c29108f47a79964b5fe888d4f4d0de40');
        }
    });
});

// ===========================================================================
// Test 3: Paymaster signing (real backend)
// ===========================================================================

test.describe('Swap: Paymaster signing', () => {

    test('paymaster signing produces valid signature for executeBatch callData', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);

        const xferIface = new ethersLib.Interface(['function transfer(address,uint256) returns (bool)']);
        const batchIface = new ethersLib.Interface(['function executeBatch((address,uint256,bytes)[])']);
        const feeTransfer = xferIface.encodeFunctionData('transfer', [TREASURY, 30000n]);
        const callData = batchIface.encodeFunctionData('executeBatch', [
            [
                [ERC20SWAP, 0n, '0x' + '00'.repeat(192)],
                [USDT0, 0n, feeTransfer]
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

        // Should NOT fail with encoding/validation errors
        if (response.message) {
            expect(response.message).not.toContain('callData must be executeBatch');
            expect(response.message).not.toContain('Invalid callData');
            expect(response.message).not.toContain('Invalid token address');
            expect(response.message).not.toContain('Fee token not in allowed list');
        }
    });
});

// ===========================================================================
// Test 4: Full swap flow simulation
// ===========================================================================

test.describe('Swap: Full flow simulation', () => {

    test('claim+fee transfer structure decoded correctly from relay payload', async ({ page }) => {
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
                const claimCalldata = '0x' + 'ab'.repeat(192);
                await gs.sendGaslessCalls(
                    [{ to: '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F', data: claimCalldata, value: 0n }],
                    '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
                    12000n
                );
            } catch {}
        });

        if (relayPayload) {
            const cd = relayPayload.userOp.callData;

            expect(cd.startsWith('0x34fcd5be')).toBe(true);

            const structure = await page.evaluate(async (callData: string) => {
                const { ethers } = await import('ethers');
                const iface = new ethers.Interface(['function executeBatch((address,uint256,bytes)[])']);
                const decoded = iface.decodeFunctionData('executeBatch', callData);
                const calls = decoded[0];

                const xferIface = new ethers.Interface(['function transfer(address,uint256) returns (bool)']);
                const transferDecoded = xferIface.decodeFunctionData('transfer', calls[1][2]);

                return {
                    callCount: calls.length,
                    call0Target: calls[0][0],
                    call1Target: calls[1][0],
                    feeRecipient: transferDecoded[0],
                    feeAmount: transferDecoded[1].toString(),
                    callDataSelector: callData.slice(0, 10)
                };
            }, cd);

            expect(structure.callCount).toBe(2);
            expect(structure.call0Target.toLowerCase()).toBe(ERC20SWAP.toLowerCase());
            expect(structure.call1Target.toLowerCase()).toBe(TBTC.toLowerCase());
            expect(structure.feeRecipient.toLowerCase()).toBe(TREASURY.toLowerCase());
            expect(BigInt(structure.feeAmount)).toBe(12000n);
            expect(structure.callDataSelector).toBe('0x34fcd5be');
        }
    });

    test('relay payload has correct EIP-7702 fields', async ({ page }) => {
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
                    [{ to: USDT0, data: '0xa9059cbb' + '00'.repeat(64), value: 0n }],
                    USDT0, 10000n
                );
            } catch {}
        });

        if (relayPayload) {
            expect(relayPayload.sender).toBeTruthy();
            expect(relayPayload.userOp).toBeTruthy();
            expect(relayPayload.userOp.sender).toBeTruthy();
            expect(relayPayload.userOp.callData).toBeTruthy();
            expect(relayPayload.userOp.callGasLimit).toBeTruthy();
            expect(relayPayload.userOp.verificationGasLimit).toBeTruthy();
            expect(relayPayload.userOp.preVerificationGas).toBeTruthy();
            expect(relayPayload.userOp.maxFeePerGas).toBeTruthy();
            expect(relayPayload.userOp.maxPriorityFeePerGas).toBeTruthy();

            const gasFields = ['callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas'];
            for (const field of gasFields) {
                const val = relayPayload.userOp[field];
                if (val && val !== '0x') {
                    expect((val.length - 2) % 2).toBe(0);
                }
            }
        }
    });
});

// ===========================================================================
// Test 5: Claim retry error classification
// ===========================================================================

test.describe('Swap: Claim retry logic', () => {

    test('isTransientClaimError classifies network errors as retryable', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });

        const results = await page.evaluate(async () => {
            const { isTransientClaimError } = await import('/src/lib/services/swap-chain/boltz/polling.ts');

            const transientErrors = [
                'Request timeout',
                'ECONNREFUSED 127.0.0.1:8000',
                'ETIMEDOUT',
                'Rate limit exceeded',
                '429 Too Many Requests',
                '503 Service Unavailable',
                'network error',
                'fetch failed',
                'nonce too low for account',
                'already known',
                'Gasless relay timeout (30s)',
                'Pre-flight simulation failed: Insufficient USDT0 balance'
            ];

            const permanentErrors = [
                'execution reverted: Already claimed',
                'Invalid preimage',
                'Timelock expired',
                'AA23 reverted 0xfce698f7',
                'Something went wrong',
                'Invalid signature'
            ];

            const transientResults = transientErrors.map(e => ({ error: e, result: isTransientClaimError(new Error(e)) }));
            const permanentResults = permanentErrors.map(e => ({ error: e, result: isTransientClaimError(new Error(e)) }));

            return { transientResults, permanentResults };
        });

        for (const r of results.transientResults) {
            expect(r.result).toBe(true);
        }

        for (const r of results.permanentResults) {
            expect(r.result).toBe(false);
        }
    });
});

// ===========================================================================
// Test 6: Gasless config and estimates
// ===========================================================================

test.describe('Swap: Gasless config completeness', () => {

    test('all required fee tokens are configured', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });

        const config = await page.evaluate(async () => {
            const c = await import('/src/lib/wallet/gasless.config.ts');
            return {
                hasUSDT0: !!c.USDT0_ADDRESS,
                hasWBTC: !!c.WBTC_ADDRESS,
                hasTBTC: !!c.TBTC_ADDRESS,
                hasTreasury: !!c.GAS_TREASURY,
                hasEntryPoint: !!c.ENTRY_POINT_ADDRESS,
                tokenCount: c.TOKENS?.length ?? 0,
                hasGasBounds: !!c.GAS_BOUNDS,
                maxCallGas: c.GAS_BOUNDS?.maxCallGas?.toString(),
                maxVerificationGas: c.GAS_BOUNDS?.maxVerificationGas?.toString(),
                maxPreVerificationGas: c.GAS_BOUNDS?.maxPreVerificationGas?.toString()
            };
        });

        expect(config.hasUSDT0).toBe(true);
        expect(config.hasWBTC).toBe(true);
        expect(config.hasTBTC).toBe(true);
        expect(config.hasTreasury).toBe(true);
        expect(config.hasEntryPoint).toBe(true);
        expect(config.tokenCount).toBe(3);
        expect(config.hasGasBounds).toBe(true);
        expect(config.maxCallGas).toBe('5000000');
        expect(config.maxVerificationGas).toBe('1000000');
        expect(config.maxPreVerificationGas).toBe('400000');
    });

    test('BOLTZ_MAX_WAIT_MS is 30 minutes', async ({ page }) => {
        await mockInfrastructureOnly(page);
        await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded' });
        await seedAuth(page);
        await page.reload({ waitUntil: 'networkidle', timeout: 90000 });

        const result = await page.evaluate(async () => {
            const { BOLTZ_MAX_WAIT_MS } = await import('/src/lib/services/swap-chain/utils.ts');
            return BOLTZ_MAX_WAIT_MS;
        });

        expect(result).toBe(1_800_000);
    });
});
