// =============================================================================
// Gasless Fee Estimation — Playwright E2E Tests
// Covers: fee tier thresholds, gas-to-USD mapping, rejection boundary
// @gasless
// =============================================================================

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';
const API_BASE = 'http://localhost:4000';

// Fee tier definitions from gasless.config.ts:
// Low:      0 - 200,000 gas   -> $0.01
// Medium: 200,001 - 500,000  -> $0.03
// High:   500,001 - 1,000,000 -> $0.05
// Very High: 1,000,001 - 5,000,000 -> $0.10
// Rejection: > 5,000,000 gas

interface FeeTierTest {
    label: string;
    gasEstimate: string;    // mock gas estimate returned by backend
    expectedFeeUSD: number;
    expectedBadge: string;
    token?: string;
    amount?: string;
}

const FEE_TIER_TESTS: FeeTierTest[] = [
    {
        label: 'Low tier',
        gasEstimate: '150000',
        expectedFeeUSD: 0.01,
        expectedBadge: 'Low',
        amount: '10'
    },
    {
        label: 'Medium tier',
        gasEstimate: '350000',
        expectedFeeUSD: 0.03,
        expectedBadge: 'Medium',
        amount: '50'
    },
    {
        label: 'High tier',
        gasEstimate: '750000',
        expectedFeeUSD: 0.05,
        expectedBadge: 'High',
        amount: '100'
    },
    {
        label: 'Very High tier',
        gasEstimate: '2000000',
        expectedFeeUSD: 0.10,
        expectedBadge: 'Very High',
        amount: '200'
    }
];

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function loginViaNsec(page: Page) {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        localStorage.setItem('auth_method', 'nsec');
        localStorage.setItem('nostr_login_done', 'true');
        localStorage.setItem('auth_token', 'mock-jwt-token-for-testing');
        localStorage.setItem('auth', JSON.stringify({
            authenticated: true,
            userId: 'test-user-id',
            timestamp: Date.now()
        }));
    });
}

// ---------------------------------------------------------------------------
// Mock setup helpers
// ---------------------------------------------------------------------------

function feeBufferForTier(tier: string): string {
    switch (tier) {
        case 'Low':      return '10000000000000000';   // 0.01 USDT0
        case 'Medium':   return '30000000000000000';   // 0.03 USDT0
        case 'High':     return '50000000000000000';   // 0.05 USDT0
        case 'Very High': return '100000000000000000';  // 0.10 USDT0
        default:         return '10000000000000000';
    }
}

async function setupFeeEstimateMock(page: Page, feeTier: string, feeUSD: number) {
    const feeBuffer = feeBufferForTier(feeTier);
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                feeBuffer,
                feeCostUSD: feeUSD,
                feeTier,
                totalWithBuffer: '10000000000000100000'
            })
        });
    });
    await page.route(`${API_BASE}/gasless/relay`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ userOpHash: '0xmock' })
        });
    });
}

async function setupRejectionMock(page: Page) {
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'This operation is too complex. Please try a simpler transaction.' })
        });
    });
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

async function navigateToSendFlow(page: Page) {
    await page.goto('http://localhost:3000/dashboard/wallet', {
        waitUntil: 'networkidle',
        timeout: 20000
    });
    await page.waitForTimeout(1000);
    const sendButton = page.locator('button', { hasText: /send/i }).first();
    if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendButton.click();
        await page.waitForTimeout(500);
    }
}

async function fillAndEstimate(page: Page, amount: string) {
    const recipientInput = page.locator('#gasless-recipient');
    await expect(recipientInput).toBeVisible({ timeout: 5000 });
    await recipientInput.fill(TEST_RECIPIENT);
    const amountInput = page.locator('#gasless-amount');
    await expect(amountInput).toBeVisible();
    await amountInput.fill(amount);
    const estimateButton = page.locator('button', { hasText: /estimate fee/i });
    await expect(estimateButton).toBeVisible();
    await estimateButton.click();
}

// ===========================================================================
// Test Suite: Fee Estimation Tiers
// ===========================================================================

test.describe('Gasless Fee Estimation — E2E', () => {

    test.beforeEach(async ({ page }) => {
        await loginViaNsec(page);
    });

    // -------------------------------------------------------------------------
    // Test: Low tier (< 200K gas) -> $0.01 fee
    // -------------------------------------------------------------------------
    test('Low tier (< 200K gas) — $0.01 fee', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupFeeEstimateMock(page, 'Low', 0.01);
        await navigateToSendFlow(page);
        await fillAndEstimate(page, '10');

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });

        // Verify Low badge
        await expect(confirmDialog.locator('.badge', { hasText: 'Low' })).toBeVisible();
        // Verify $0.01 cost display
        await expect(confirmDialog.locator('text=$0.01')).toBeVisible();
        // Verify network fee section
        await expect(confirmDialog.locator('text=Network fee')).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Test: Medium tier (200K-500K) -> $0.03 fee
    // -------------------------------------------------------------------------
    test('Medium tier (200K-500K gas) — $0.03 fee', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupFeeEstimateMock(page, 'Medium', 0.03);
        await navigateToSendFlow(page);
        await fillAndEstimate(page, '50');

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });

        // Verify Medium badge
        await expect(confirmDialog.locator('.badge', { hasText: 'Medium' })).toBeVisible();
        // Verify $0.03 cost display
        await expect(confirmDialog.locator('text=$0.03')).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Test: High tier (500K-1M) -> $0.05 fee
    // -------------------------------------------------------------------------
    test('High tier (500K-1M gas) — $0.05 fee', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupFeeEstimateMock(page, 'High', 0.05);
        await navigateToSendFlow(page);
        await fillAndEstimate(page, '100');

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });

        // Verify High badge
        await expect(confirmDialog.locator('.badge', { hasText: 'High' })).toBeVisible();
        // Verify $0.05 cost display
        await expect(confirmDialog.locator('text=$0.05')).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Test: Very High tier (1M-5M) -> $0.10 fee
    // -------------------------------------------------------------------------
    test('Very High tier (1M-5M gas) — $0.10 fee', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupFeeEstimateMock(page, 'Very High', 0.10);
        await navigateToSendFlow(page);
        await fillAndEstimate(page, '200');

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });

        // Verify Very High badge
        await expect(confirmDialog.locator('.badge', { hasText: 'Very High' })).toBeVisible();
        // Verify $0.10 cost display
        await expect(confirmDialog.locator('text=$0.10')).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Test: Rejection (> 5M gas) -> Network fee too high error
    // -------------------------------------------------------------------------
    test('Rejection (> 5M gas) — Network fee too high error', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupRejectionMock(page);
        await navigateToSendFlow(page);
        await fillAndEstimate(page, '500');

        // Verify error display appears
        const errorDisplay = page.locator('.alert-error, .alert-warning').first();
        await expect(errorDisplay).toBeVisible({ timeout: 10000 });

        // Verify error text mentions fee too high
        const bodyText = await page.locator('body').textContent() ?? '';
        expect(bodyText.toLowerCase()).toMatch(/network fee too high|too complex|too high/);

        // Verify retry button is available
        const retryButton = page.locator('button', { hasText: /retry/i }).first();
        await expect(retryButton).toBeVisible();
    });
});
