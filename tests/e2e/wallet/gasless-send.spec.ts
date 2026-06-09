// =============================================================================
// Gasless Send Flow — Playwright E2E Tests
// Covers: ERC-4337 + EIP-7702 gasless transactions on Arbitrum
// @smoke @gasless
// =============================================================================

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USDT0_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const WBTC_ADDRESS = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const TBTC_ADDRESS = '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40';
const TEST_RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';
const MOCK_TX_HASH = '0xabc123def456789abcdef0123456789abcdef0123456789abcdef0123456789';
const API_BASE = 'http://localhost:4000';

// ---------------------------------------------------------------------------
// Mock data builders
// ---------------------------------------------------------------------------

interface EstimateOverrides {
    feeBuffer?: string;
    feeCostUSD?: number;
    feeTier?: string;
    totalWithBuffer?: string;
}

function mockEstimateResponse(overrides: EstimateOverrides = {}) {
    return {
        feeBuffer: '10000000000000000',
        feeCostUSD: 0.01,
        feeTier: 'Low',
        totalWithBuffer: '10000000000000100000',
        ...overrides
    };
}

function mockRelayResponse(userOpHash: string = MOCK_TX_HASH) {
    return { userOpHash };
}

// ---------------------------------------------------------------------------
// Auth helper — bypass login via localStorage
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

async function setupGaslessMocks(page: Page, estimateOverrides?: EstimateOverrides) {
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockEstimateResponse(estimateOverrides))
        });
    });
    await page.route(`${API_BASE}/gasless/relay`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockRelayResponse())
        });
    });
}

async function setupEstimateError(page: Page, errorMessage: string, statusCode = 400) {
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        await route.fulfill({
            status: statusCode,
            contentType: 'application/json',
            body: JSON.stringify({ message: errorMessage })
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

async function fillSendForm(page: Page, tokenLabel: string, recipient: string, amount: string) {
    const tokenSelect = page.locator('#gasless-token');
    await expect(tokenSelect).toBeVisible({ timeout: 5000 });
    await tokenSelect.selectOption({ label: tokenLabel });
    const recipientInput = page.locator('#gasless-recipient');
    await expect(recipientInput).toBeVisible();
    await recipientInput.fill(recipient);
    const amountInput = page.locator('#gasless-amount');
    await expect(amountInput).toBeVisible();
    await amountInput.fill(amount);
}

// ===========================================================================
// Test Suite: Gasless Send Flow
// ===========================================================================

test.describe('Gasless Send Flow — E2E', () => {

    test.beforeEach(async ({ page }) => {
        await loginViaNsec(page);
        await setupGaslessMocks(page);
    });

    // -------------------------------------------------------------------------
    // Test 1: Send USDT0 — full flow with Low fee tier
    // -------------------------------------------------------------------------
    test('Send USDT0 — full flow with Low fee tier', async ({ page }) => {
        test.info().tags.push('@smoke', '@gasless');

        await navigateToSendFlow(page);
        await fillSendForm(page, 'USDT0', TEST_RECIPIENT, '10');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });
        await expect(confirmDialog.locator('text=Network fee')).toBeVisible();
        await expect(confirmDialog.locator('.badge', { hasText: 'Low' })).toBeVisible();

        const confirmButton = page.locator('button', { hasText: /confirm send/i });
        await expect(confirmButton).toBeVisible();
        await confirmButton.click();

        await page.waitForTimeout(2000);
        const bodyText = await page.locator('body').textContent() ?? '';
        const hasTerminalState = bodyText.includes('pending') || bodyText.includes('success')
            || bodyText.includes('completed') || bodyText.includes('transaction');
        expect(hasTerminalState).toBeTruthy();
    });

    // -------------------------------------------------------------------------
    // Test 2: Send wBTC — 8-decimal handling
    // -------------------------------------------------------------------------
    test('Send wBTC — 8-decimal fee buffer in satoshis', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupGaslessMocks(page, {
            feeBuffer: '16',
            feeCostUSD: 0.01,
            feeTier: 'Low',
            totalWithBuffer: '100000016'
        });

        await navigateToSendFlow(page);
        await fillSendForm(page, 'WBTC', TEST_RECIPIENT, '0.001');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });
        await expect(confirmDialog.locator('.badge', { hasText: 'Low' })).toBeVisible();
        await expect(confirmDialog.locator('text=Network fee')).toBeVisible();

        const confirmButton = page.locator('button', { hasText: /confirm send/i });
        await expect(confirmButton).toBeVisible();
        await confirmButton.click();
    });

    // -------------------------------------------------------------------------
    // Test 3: Send tBTC — standard 18-decimal
    // -------------------------------------------------------------------------
    test('Send tBTC — standard 18-decimal flow', async ({ page }) => {
        test.info().tags.push('@gasless');

        await navigateToSendFlow(page);
        await fillSendForm(page, 'TBTC', TEST_RECIPIENT, '0.5');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });
        await expect(confirmDialog.locator('.badge', { hasText: 'Low' })).toBeVisible();
        await expect(confirmDialog.locator('text=Network fee')).toBeVisible();

        const confirmButton = page.locator('button', { hasText: /confirm send/i });
        await expect(confirmButton).toBeVisible();
        await confirmButton.click();
    });

    // -------------------------------------------------------------------------
    // Test 4: Contract interaction — Medium tier fee
    // -------------------------------------------------------------------------
    test('Contract interaction — Medium tier fee estimation', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupGaslessMocks(page, {
            feeBuffer: '30000000000000000',
            feeCostUSD: 0.03,
            feeTier: 'Medium',
            totalWithBuffer: '10000000000000300000'
        });

        await navigateToSendFlow(page);
        await fillSendForm(page, 'USDT0', TEST_RECIPIENT, '50');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });
        await expect(confirmDialog.locator('.badge', { hasText: 'Medium' })).toBeVisible();
        await expect(confirmDialog.locator('text=$0.03')).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Test 5: Network fee too high — rejection
    // -------------------------------------------------------------------------
    test('Network fee too high — error displayed', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupEstimateError(page, 'This operation is too complex. Please try a simpler transaction.');

        await navigateToSendFlow(page);
        await fillSendForm(page, 'USDT0', TEST_RECIPIENT, '100');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        const errorDisplay = page.locator('.alert-error, .alert-warning').first();
        await expect(errorDisplay).toBeVisible({ timeout: 10000 });

        const bodyText = await page.locator('body').textContent() ?? '';
        expect(bodyText.toLowerCase()).toMatch(/network fee too high|too complex|too high/);
    });

    // -------------------------------------------------------------------------
    // Test 6: Insufficient balance — error with required vs available
    // -------------------------------------------------------------------------
    test('Insufficient balance — error shows required vs available', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupEstimateError(page, 'Insufficient balance: required 110000000000000000000, available 50000000000000000000');

        await navigateToSendFlow(page);
        await fillSendForm(page, 'USDT0', TEST_RECIPIENT, '100');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        const errorDisplay = page.locator('.alert-error, .alert-warning').first();
        await expect(errorDisplay).toBeVisible({ timeout: 10000 });

        const bodyText = await page.locator('body').textContent() ?? '';
        expect(bodyText.toLowerCase()).toMatch(/insufficient|balance|required|available/);
    });

    // -------------------------------------------------------------------------
    // Test 7: First-time send — EIP-7702 authorization flow
    // -------------------------------------------------------------------------
    test('First-time send — EIP-7702 auth setup', async ({ page }) => {
        test.info().tags.push('@gasless');
        test.skip(); // Requires live Arbitrum mock environment

        await navigateToSendFlow(page);
        await fillSendForm(page, 'USDT0', TEST_RECIPIENT, '1');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        const confirmDialog = page.locator('.modal-box').first();
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });

        const confirmButton = page.locator('button', { hasText: /confirm send/i });
        await expect(confirmButton).toBeVisible();
        await confirmButton.click();

        await page.waitForTimeout(3000);
        const bodyText = await page.locator('body').textContent() ?? '';
        const hasResult = bodyText.includes('success') || bodyText.includes('pending')
            || bodyText.includes('error') || bodyText.includes('transaction');
        expect(hasResult).toBeTruthy();
    });
});
