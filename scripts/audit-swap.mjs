import { chromium } from 'playwright';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  let browser;
  try {
    console.log('[1] Connecting to browser at localhost:9222...');
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 15000 });
    console.log('[1] Connected!');

    const contexts = browser.contexts();
    console.log(`[1] Contexts: ${contexts.length}`);

    let page = contexts[0]?.pages()[0];
    if (!page) {
      console.log('[1] No pages found, creating new one...');
      page = await contexts[0].newPage();
    }

    console.log(`[1] Current URL: ${page.url()}`);
    console.log(`[1] All pages: ${JSON.stringify(contexts[0].pages().map(p => p.url()))}`);

    // === STEP 1: Navigate to wallet ===
    console.log('\n[2] Navigating to /wallet...');
    await page.goto('http://localhost:3000/wallet', { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);
    console.log(`[2] Landed on: ${page.url()}`);

    // === STEP 2: Find and click Swap ===
    console.log('\n[2] Looking for Swap button...');

    // Collect all button/link text
    const allButtons = await page.locator('button').allTextContents();
    const allLinks = await page.locator('a').allTextContents();
    console.log(`[2] Buttons: ${JSON.stringify(allButtons.filter(t => t.trim()))}`);
    console.log(`[2] Links: ${JSON.stringify(allLinks.filter(t => t.trim()))}`);

    // Try clicking Swap
    const swapBtn = page.locator('button', { hasText: /swap/i }).first();
    const swapLink = page.locator('a', { hasText: /swap/i }).first();

    let clicked = false;
    if (await swapBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[2] Clicking Swap button...');
      await swapBtn.click();
      clicked = true;
    } else if (await swapLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[2] Clicking Swap link...');
      await swapLink.click();
      clicked = true;
    } else {
      console.log('[2] No Swap button/link found by text. Trying role-based...');
      const swapByRole = page.getByRole('button', { name: /swap/i }).first();
      if (await swapByRole.isVisible({ timeout: 3000 }).catch(() => false)) {
        await swapByRole.click();
        clicked = true;
      }
    }

    if (clicked) {
      await sleep(3000);
      console.log(`[2] After clicking swap, URL: ${page.url()}`);
    }

    // === STEP 3: Try to set up WBTC → RBTC ===
    console.log('\n[3] Looking for From/To selectors...');

    // Look for select/dropdown elements
    const selects = await page.locator('select').count();
    const dropdowns = await page.locator('[role="combobox"], [role="listbox"], .dropdown, .select').count();
    console.log(`[3] Selects: ${selects}, Dropdowns: ${dropdowns}`);

    // Look for "From" and "To" related elements
    const fromElements = await page.locator('text=/from/i').count();
    const toElements = await page.locator('text=/to/i').count();
    console.log(`[3] "From" elements: ${fromElements}, "To" elements: ${toElements}`);

    // Try to find wBTC/rBTC related elements
    const wbtcElements = await page.locator('text=/wbtc|wBTC|wrapped bitcoin/i').all();
    const rbtcElements = await page.locator('text=/rbtc|rBTC|rootstock bitcoin/i').all();
    console.log(`[3] wBTC elements: ${wbtcElements.length}, rBTC elements: ${rbtcElements.length}`);

    // Click any WBTC element to try to select it
    for (const el of wbtcElements) {
      const text = await el.textContent().catch(() => '');
      const visible = await el.isVisible().catch(() => false);
      console.log(`[3] wBTC element: "${text}" visible=${visible}`);
    }

    for (const el of rbtcElements) {
      const text = await el.textContent().catch(() => '');
      const visible = await el.isVisible().catch(() => false);
      console.log(`[3] rBTC element: "${text}" visible=${visible}`);
    }

    // === STEP 4: Capture full page state ===
    console.log('\n[4] Capturing page state...');

    // Full page text
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== FULL PAGE TEXT ===');
    console.log(pageText.substring(0, 8000));
    if (pageText.length > 8000) console.log(`... [truncated, total ${pageText.length} chars]`);

    // === STEP 5: Check DOM elements ===
    console.log('\n[5] Checking swap-related DOM elements...');

    const domData = await page.evaluate(() => {
      const results = {};

      // Look for balance-related text
      const allText = document.body.innerText;
      const balanceMatch = allText.match(/(?:balance|available)[:\s]*[\d,.]+\s*(?:sats|btc|wbtc|rbtc|btc|sat)/gi);
      results.balanceTexts = balanceMatch || [];

      // Look for fee-related text
      const feeMatch = allText.match(/(?:fee|fees|network fee|miner fee)[:\s]*[\d,.]+\s*(?:sats|btc|wbtc|rbtc)?/gi);
      results.feeTexts = feeMatch || [];

      // Look for amount inputs
      const inputs = Array.from(document.querySelectorAll('input'));
      results.inputs = inputs.map(i => ({
        type: i.type,
        name: i.name,
        placeholder: i.placeholder,
        value: i.value,
        id: i.id
      }));

      // Look for output/receive amount
      const outputMatch = allText.match(/(?:receive|you get|output|you'll receive)[:\s]*[\d,.]+\s*(?:sats|btc|wbtc|rbtc)?/gi);
      results.outputTexts = outputMatch || [];

      // Look for source/dest labels
      const labelMatch = allText.match(/(?:from|to|source|destination|send|receive|convert|swap from|swap to)[:\s]*\w+/gi);
      results.labels = labelMatch?.slice(0, 20) || [];

      return results;
    });
    console.log('[5] DOM data:', JSON.stringify(domData, null, 2));

    // === STEP 6: Check localStorage ===
    console.log('\n[6] Checking localStorage...');

    const lsData = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const relevantKeys = keys.filter(k =>
        /balance|wbtc|rbtc|btc|swap|wallet|sats|amount|route/i.test(k)
      );
      const result = {};
      relevantKeys.forEach(k => {
        const val = localStorage.getItem(k);
        result[k] = val?.substring(0, 200);
      });
      return { allKeys: keys, relevant: result };
    });
    console.log('[6] localStorage keys:', JSON.stringify(lsData.allKeys, null, 2));
    console.log('[6] Relevant localStorage:', JSON.stringify(lsData.relevant, null, 2));

    // === STEP 7: Check for console errors ===
    console.log('\n[7] Setting up console message capture...');
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    // Navigate again to trigger any console messages
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await sleep(5000);

    // Filter for swap-related console messages
    const swapConsole = consoleMessages.filter(m =>
      /swap|route|balance|sats|wbtc|rbtc|amount|fee|error|warn/i.test(m.text)
    );
    console.log(`[7] Total console messages: ${consoleMessages.length}`);
    console.log(`[7] Swap-related console messages: ${swapConsole.length}`);
    console.log('[7] Swap messages:', JSON.stringify(swapConsole, null, 2));

    // All errors
    const errors = consoleMessages.filter(m => m.type === 'error');
    console.log(`[7] Console errors: ${errors.length}`);
    console.log('[7] Errors:', JSON.stringify(errors, null, 2));

    // === STEP 8: Check network requests ===
    console.log('\n[8] Checking network requests...');
    const networkRequests = [];
    page.on('request', req => {
      networkRequests.push({ url: req.url(), method: req.method() });
    });
    page.on('response', res => {
      const existing = networkRequests.find(r => r.url === res.url());
      if (existing) existing.status = res.status();
    });

    // One more reload to capture network
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000);

    const apiRequests = networkRequests.filter(r =>
      /swap|route|balance|invoice|bolt|fee|wallet/i.test(r.url) ||
      r.url.includes('/api/')
    );
    console.log(`[8] Total requests: ${networkRequests.length}`);
    console.log(`[8] API/swap-related requests: ${apiRequests.length}`);
    console.log('[8] API requests:', JSON.stringify(apiRequests, null, 2));

    // === STEP 9: Try to access Svelte component state ===
    console.log('\n[9] Checking Svelte component internals...');
    const svelteState = await page.evaluate(() => {
      // Try to find Svelte component instances
      const results = {};

      // Check for any global state
      if (window.__SVELTEKIT__) results.sveltekit = 'found';
      if (window.__SVELTE__) results.svelte = 'found';

      // Try to find swap-related globals
      const globalKeys = Object.keys(window).filter(k =>
        /swap|balance|wallet|btc|rbtc|wbtc/i.test(k)
      );
      results.swapGlobals = globalKeys;

      // Check for data-svelte attributes
      const svelteElements = document.querySelectorAll('[data-svelte-h]');
      results.svelteElements = svelteElements.length;

      return results;
    });
    console.log('[9] Svelte state:', JSON.stringify(svelteState, null, 2));

    // === FINAL: Full page text after reload ===
    console.log('\n[F] Final page state after reload...');
    const finalText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== FINAL PAGE TEXT ===');
    console.log(finalText.substring(0, 10000));
    if (finalText.length > 10000) console.log(`... [truncated, total ${finalText.length} chars]`);

    // === Take screenshot ===
    await page.screenshot({ path: '/tmp/swap-audit.png', fullPage: true });
    console.log('\n[S] Screenshot saved to /tmp/swap-audit.png');

    console.log('\n=== AUDIT COMPLETE ===');

  } catch (err) {
    console.error('\n!!! ERROR !!!');
    console.error('Message:', err.message);
    console.error('Stack:', err.stack?.substring(0, 1000));
  } finally {
    if (browser) {
      try { browser.close(); } catch {}
    }
  }
}

main();
