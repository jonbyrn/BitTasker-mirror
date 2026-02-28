import { expect, test } from '@playwright/test';

const TDZ_ERROR_PATTERN = /Cannot access 'BaseApiService' before initialization/i;

test.describe('BaseApiService cycle regression', () => {
	test('browser module import should not trigger BaseApiService initialization errors', async ({
		browser,
		baseURL
	}) => {
		const shouldTrySourceImport = (baseURL ?? '').includes('3000');
		const failures: string[] = [];
		const attempts = 6;

		for (let index = 0; index < attempts; index++) {
			const context = await browser.newContext({ baseURL: baseURL ?? 'http://localhost:3000' });
			const page = await context.newPage();
			const pageErrors: string[] = [];

			page.on('pageerror', (error) => {
				pageErrors.push(error.message);
			});

			page.on('console', (message) => {
				const text = message.text();
				if (TDZ_ERROR_PATTERN.test(text)) {
					pageErrors.push(text);
				}
			});

			await page.goto('/', { waitUntil: 'load' });
			if (shouldTrySourceImport) {
				const importResult = await page.evaluate(async () => {
					try {
						const module = await import('/src/lib/api/services/auth.service.ts');
						return { ok: true, hasDefault: Boolean(module.default) };
					} catch (error) {
						return {
							ok: false,
							error:
								error instanceof Error
									? `${error.name}: ${error.message}`
									: `Unknown error: ${String(error)}`
						};
					}
				});

				if (!importResult.ok) {
					failures.push(
						`attempt ${index + 1}: dynamic import failed: ${importResult.error ?? 'unknown error'}`
					);
				}
			}

			const tdzErrors = pageErrors.filter((message) => TDZ_ERROR_PATTERN.test(message));
			if (tdzErrors.length > 0) {
				failures.push(`attempt ${index + 1}: ${tdzErrors.join(' | ')}`);
			}

			await context.close();
		}

		expect(failures, failures.join('\n')).toEqual([]);
	});
});
