// =============================================================================
// Gasless Error States — Playwright E2E Tests
// Covers: error handling, retry mechanisms, validation errors
// @gasless
// =============================================================================

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';
const API_BASE = 'http://localhost:4000';

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

async function setupEstimateError(page: Page, errorMessage: string, statusCode = 400) {
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        await route.fulfill({
            status: statusCode,
            contentType: 'application/json',
            body: JSON.stringify({ message: errorMessage })
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

async function setupBundlerDown(page: Page) {
    // Simulate Alto bundler unavailable — estimate endpoint returns 503
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Relay temporarily unavailable' })
        });
    });
}

async function setupFeeTierMismatch(page: Page) {
    // First estimate returns Low, second estimate returns Medium (simulates tier change)
    let callCount = 0;
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        callCount++;
        if (callCount === 1) {
            await route.fulfill({
                status: 409,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Fee tier mismatch — gas conditions changed, please re-estimate' })
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    feeBuffer: '30000000000000000',
                    feeCostUSD: 0.03,
                    feeTier: 'Medium',
                    totalWithBuffer: '10000000000000300000'
                })
            });
        }
    });
    await page.route(`${API_BASE}/gasless/relay`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ userOpHash: '0xmock' })
        });
    });
}

async function setupNetworkTimeout(page: Page) {
    // Simulate network timeout by aborting the request
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        await route.abort('timedout');
    });
    await page.route(`${API_BASE}/gasless/relay`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ userOpHash: '0xmock' })
        });
    });
}

async function setupGaslessMocksSuccess(page: Page) {
    await page.route(`${API_BASE}/gasless/estimate`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                feeBuffer: '10000000000000000',
                feeCostUSD: 0.01,
                feeTier: 'Low',
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

async function fillSendForm(page: Page, recipient: string, amount: string) {
    const tokenSelect = page.locator('#gasless-token');
    await expect(tokenSelect).toBeVisible({ timeout: 5000 });
    const recipientInput = page.locator('#gasless-recipient');
    await expect(recipientInput).toBeVisible();
    await recipientInput.fill(recipient);
    const amountInput = page.locator('#gasless-amount');
    await expect(amountInput).toBeVisible();
    await amountInput.fill(amount);
}

// ===========================================================================
// Test Suite: Gasless Error States
// ===========================================================================

test.describe('Gasless Error States — E2E', () => {

    test.beforeEach(async ({ page }) => {
        await loginViaNsec(page);
    });

    // -------------------------------------------------------------------------
    // Test: Bundler unavailable — retry button
    // -------------------------------------------------------------------------
    test('Bundler unavailable — shows retry button', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupBundlerDown(page);
        await navigateToSendFlow(page);
        await fillSendForm(page, TEST_RECIPIENT, '10');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        // Verify error display appears
        const errorDisplay = page.locator('.alert-error, .alert-warning, .alert-info').first();
        await expect(errorDisplay).toBeVisible({ timeout: 10000 });

        // Verify retry button is present
        const retryButton = page.locator('button', { hasText: /retry/i }).first();
        await expect(retryButton).toBeVisible();

        // Click retry — should trigger another estimate attempt
        await retryButton.click();
        await page.waitForTimeout(1000);

        // Verify error or retry remains visible
        const bodyText = await page.locator('body').textContent() ?? '';
        const hasErrorState = bodyText.includes('unavailable') || bodyText.includes('retry')
            || bodyText.includes('error') || bodyText.includes('temporarily');
        expect(hasErrorState).toBeTruthy();
    });

    // -------------------------------------------------------------------------
    // Test: Fee tier mismatch — re-estimate prompt
    // -------------------------------------------------------------------------
    test('Fee tier mismatch — shows re-estimate prompt', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupFeeTierMismatch(page);
        await navigateToSendFlow(page);
        await fillSendForm(page, TEST_RECIPIENT, '10');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        // Verify error with re-estimate message
        const errorDisplay = page.locator('.alert-error, .alert-warning').first();
        await expect(errorDisplay).toBeVisible({ timeout: 10000 });

        const bodyText = await page.locator('body').textContent() ?? '';
        expect(bodyText.toLowerCase()).toMatch(/fee tier mismatch|re-estimate|gas conditions changed/);

        // Verify retry/re-estimate button
        const retryButton = page.locator('button', { hasText: /retry|re-estimate/i }).first();
        await expect(retryButton).toBeVisible();
    });

    // -------------------------------------------------------------------------
    // Test: Invalid address — validation error
    // -------------------------------------------------------------------------
    test('Invalid address — validation error', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupGaslessMocksSuccess(page);
        await navigateToSendFlow(page);

        // Enter invalid address
        const recipientInput = page.locator('#gasless-recipient');
        await expect(recipientInput).toBeVisible({ timeout: 5000 });
        await recipientInput.fill('not-a-valid-address');

        const amountInput = page.locator('#gasless-amount');
        await expect(amountInput).toBeVisible();
        await amountInput.fill('10');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        // Verify error appears for invalid address
        const errorDisplay = page.locator('.alert-error, .alert-warning').first();
        await expect(errorDisplay).toBeVisible({ timeout: 10000 });

        const bodyText = await page.locator('body').textContent() ?? '';
        expect(bodyText.toLowerCase()).toMatch(/invalid.*address|address.*invalid|invalid.*recipient/);
    });

    // -------------------------------------------------------------------------
    // Test: Network timeout — retry mechanism
    // -------------------------------------------------------------------------
    test('Network timeout — shows retry mechanism', async ({ page }) => {
        test.info().tags.push('@gasless');

        await setupNetworkTimeout(page);
        await navigateToSendFlow(page);
        await fillSendForm(page, TEST_RECIPIENT, '10');

        const estimateButton = page.locator('button', { hasText: /estimate fee/i });
        await expect(estimateButton).toBeVisible();
        await estimateButton.click();

        // Verify error appears after timeout
        const errorDisplay = page.locator('.alert-error, .alert-warning').first();
        await expect(errorDisplay).toBeVisible({ timeout: 15000 });

        // Verify retry button is available
        const retryButton = page.locator('button', { hasText: /retry/i }).first();
        await expect(retryButton).toBeVisible();
    });
});
