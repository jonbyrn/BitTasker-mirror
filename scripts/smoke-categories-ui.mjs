/**
 * Preview smoke for browse, a category tile, search, a detail page, and the
 * create-flow suggestion. Screenshots go to SMOKE_OUT. It does not publish
 * Nostr events.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const out = process.env.SMOKE_OUT || '/opt/cursor/artifacts/categories-typesense';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
	headless: true,
	executablePath: process.env.SMOKE_CHROME || '/usr/bin/google-chrome',
	args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const notes = [];

async function shot(name) {
	const path = `${out}/${name}.png`;
	await page.screenshot({ path, fullPage: true });
	notes.push(`${name}: ${page.url()}`);
}

try {
	await page.goto(`${base}/browse/tasks`, { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.waitForSelector('[data-testid="browse-page-tasks"]', { timeout: 20000 });
	const tile = page.locator('[data-testid^="browse-tile-"]').first();
	await tile.waitFor({ state: 'visible', timeout: 20000 });
	await shot('01-browse');
	const tileId = (await tile.getAttribute('data-testid')) || '';
	await tile.click();
	await shot('02-category-tile');
	notes.push(`tile: ${tileId}`);

	const result = page.locator('[data-testid="browse-result"]').first();
	await result.waitFor({ state: 'visible', timeout: 15000 });
	const resultText = (await result.innerText()).split('\n')[0].trim();
	const query = resultText.split(/\s+/).find((word) => word.length > 3) || resultText;
	const search = page.locator('#browse-query');
	await search.fill(query);
	await page.waitForTimeout(800);
	await shot('03-search');
	notes.push(`search: ${query}`);

	const href = await page.locator('[data-testid="browse-result"]').first().getAttribute('href');
	if (!href) throw new Error('Browse result has no link');
	await page.goto(new URL(href, base).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
	await page.locator('h3').first().waitFor({ timeout: 15000 });
	await shot('04-detail');
	notes.push(`detail: ${page.url()}`);

	await page.goto(`${base}/create-task`, { waitUntil: 'domcontentloaded', timeout: 30000 });
	const title = page.locator('[data-testid="task-title-input"]');
	await title.waitFor({ state: 'visible', timeout: 20000 });
	await title.fill('Técnico instalador de camaras y alarmas');
	await title.blur();
	await page.waitForSelector('[data-testid="category-suggestion"]', { timeout: 10000 });
	await shot('05-category-suggestion');
	const suggestion = await page.locator('[data-testid="category-suggestion"]').innerText();
	notes.push(`suggestion: ${suggestion.replace(/\s+/g, ' ').slice(0, 180)}`);
	console.log(notes.join('\n'));
} catch (error) {
	await shot('failure').catch(() => {});
	console.log(notes.join('\n'));
	console.error(error instanceof Error ? error.message : 'smoke failed');
	process.exitCode = 1;
} finally {
	await browser.close();
}
