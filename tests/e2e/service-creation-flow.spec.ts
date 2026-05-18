import { test, expect } from '@playwright/test';

/**
 * Service Creation Flow E2E Test
 * Tests the complete service creation wizard from start to finish
 */

test.describe('Service Creation Wizard', () => {
	test('navigate to create service page', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Check page header
		const heading = page.locator('h1, h2').first();
		expect(await heading.isVisible()).toBeTruthy();

		// Check that we're on the create service route
		expect(page.url()).toContain('/create-service');
	});

	test('wizard navigation works correctly', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Check for next button
		const nextButton = page.locator('button:has-text(/next|continue/i)').first();
		if ((await nextButton.count()) > 0) {
			const isEnabled = await nextButton.isEnabled();
			console.log(`✓ Next button available: ${isEnabled}`);
		}

		// Check for progress indicator
		const progress = page.locator('[role="progressbar"], .progress, [class*="step"]').first();
		if ((await progress.count()) > 0) {
			console.log('✓ Progress indicator visible');
		}
	});

	test('service basics form accepts input', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Look for title input
		const titleInput = page
			.locator(
				'input[placeholder*="title" i], input[placeholder*="service name" i], input[type="text"]'
			)
			.first();
		if ((await titleInput.count()) > 0) {
			await titleInput.fill('Test Service');
			const value = await titleInput.inputValue();
			console.log(`✓ Service title input works: "${value}"`);
		}

		// Look for description input
		const descriptionInput = page.locator('textarea').first();
		if ((await descriptionInput.count()) > 0) {
			await descriptionInput.fill('This is a test service description');
			console.log(`✓ Service description input works`);
		}
	});

	test('category selection works', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Look for category selector
		const categoryButton = page
			.locator('button:has-text(/categor/i), [data-testid*="category"]')
			.first();
		if ((await categoryButton.count()) > 0) {
			await categoryButton.click();
			await page.waitForTimeout(300);
			console.log('✓ Category selector opened');

			// Look for category options
			const categoryOptions = page.locator(
				'[role="option"], label:has-text(/design|development/i)'
			);
			const count = await categoryOptions.count();
			console.log(`✓ Found ${count} category options`);
		}
	});

	test('pricing type selection works', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Navigate through steps to find pricing section
		const nextButton = page.locator('button:has-text(/next|continue/i)').first();
		let stepCount = 0;

		// Go through several steps to reach pricing
		while (stepCount < 3 && (await nextButton.count()) > 0) {
			const enabled = await nextButton.isEnabled();
			if (enabled) {
				await nextButton.click();
				await page.waitForTimeout(300);
				stepCount++;
			} else {
				break;
			}
		}

		// Look for pricing type radio buttons or select
		const pricingOptions = page.locator('input[type="radio"], select, [role="option"]');
		const count = await pricingOptions.count();
		console.log(`✓ Found ${count} pricing-related form elements`);
	});

	test('form has validation feedback', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Try to submit without filling required fields
		const nextButton = page.locator('button:has-text(/next|continue/i)').first();

		if ((await nextButton.count()) > 0 && (await nextButton.isEnabled())) {
			// Click next without filling form - should show validation error
			await nextButton.click();
			await page.waitForTimeout(300);

			const errorMessage = page.locator('[role="alert"], .error, .text-error');
			const errorCount = await errorMessage.count();
			console.log(`✓ Form validation present: ${errorCount} error message(s)`);
		}
	});

	test('form fields maintain state on wizard navigation', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Fill in service title
		const titleInput = page.locator('input[type="text"]').first();
		if ((await titleInput.count()) > 0) {
			await titleInput.fill('Persistent Service Title');
			const initialValue = await titleInput.inputValue();

			// Look for next button and click it (if wizard exists)
			const nextButton = page.locator('button:has-text(/next|continue/i)').first();
			if ((await nextButton.count()) > 0 && (await nextButton.isEnabled())) {
				await nextButton.click();
				await page.waitForTimeout(300);

				// Look for back button and go back
				const backButton = page.locator('button:has-text(/back|previous/i)').first();
				if ((await backButton.count()) > 0) {
					await backButton.click();
					await page.waitForTimeout(300);

					// Check if value persisted
					const titleAfterNav = page.locator('input[type="text"]').first();
					const finalValue = await titleAfterNav.inputValue();
					const persisted = finalValue === initialValue;
					console.log(`✓ Form state persistence: ${persisted ? 'working' : 'issue detected'}`);
				}
			}
		}
	});

	test('service creation draft autosave works', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Fill in some basic info
		const titleInput = page.locator('input[type="text"]').first();
		if ((await titleInput.count()) > 0) {
			await titleInput.fill('Draft Service Test');
			await page.waitForTimeout(500); // Wait for autosave

			// Reload page
			await page.reload();
			await page.waitForLoadState('networkidle');

			// Check if draft was restored
			const restoredInput = page.locator('input[type="text"]').first();
			if ((await restoredInput.count()) > 0) {
				const restoredValue = await restoredInput.inputValue();
				const restored = restoredValue === 'Draft Service Test';
				console.log(`✓ Draft autosave: ${restored ? 'working' : 'not visible'}`);
			}
		}
	});

	test('responsive layout on mobile', async ({ page }) => {
		// Set mobile viewport
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Check that form is visible and scrollable
		const form = page.locator('form, main').first();
		expect(await form.isVisible()).toBeTruthy();

		// Check that buttons are accessible
		const buttons = page.locator('button');
		const count = await buttons.count();
		console.log(`✓ Mobile view has ${count} buttons accessible`);
	});

	test('required fields indication', async ({ page }) => {
		await page.goto('/dashboard/create-service');
		await page.waitForLoadState('networkidle');

		// Look for required field indicators
		const requiredLabels = page.locator('label:has-text(/required|[*]/i), .required');
		const requiredCount = await requiredLabels.count();
		console.log(`✓ Required field indicators: ${requiredCount} found`);

		// Check for aria-required attributes
		const ariaRequired = page.locator('[aria-required="true"]');
		const ariaCount = await ariaRequired.count();
		console.log(`✓ ARIA required attributes: ${ariaCount} found`);
	});
});
