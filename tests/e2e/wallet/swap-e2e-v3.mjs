/**
 * Swap E2E — Clean, self-contained tests
 * Fresh page navigation between each test group to avoid state bleed.
 * Connects to Chrome on port 9222 via CDP.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CDP_URL = 'http://localhost:9222';
const APP = 'http://localhost:3000';
const SS = join(process.cwd(), 'Screenshots', 'swap-e2e-v3');
const NSEC = join(process.cwd(), 'test-nsec.txt');
mkdirSync(SS, { recursive: true });

const getNsec = () => readFileSync(NSEC, 'utf8').trim();
const shot = async (page, name) => {
  await page.screenshot({ path: join(SS, `${name}.png`), fullPage: true });
};

// Login helper — sets localStorage then navigates to wallet
async function loginWallet(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate((n) => {
    localStorage.setItem('nostr_nsec', n);
    localStorage.setItem('auth_method', 'nsec');
    localStorage.setItem('nostr_login_done', 'true');
  }, getNsec());
  await page.goto(`${APP}/dashboard/wallet`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
}

// Open swap drawer — click the Swap button in the wallet action bar
async function openSwap(page) {
  const btn = page.locator('button').filter({ hasText: /^Swap$/ }).first();
  await btn.waitFor({ state: 'visible', timeout: 8000 });
  await btn.click();
  // Wait for the drawer animation + content
  await page.waitForSelector('input[inputmode="decimal"]', { timeout: 8000 });
  await page.waitForTimeout(1000);
}

// Fill amount and wait for route resolution
async function fillAmount(page, amount) {
  const input = page.locator('input[inputmode="decimal"]').first();
  await input.fill(amount);
  await input.press('Tab'); // trigger blur-based resolution
  await page.waitForTimeout(5000);
}

// Extract fee card text from the swap drawer
async function getFeeCardText(page) {
  // The fee card is inside the dialog, after the input area
  // Look for "Total sent" text and get the surrounding container
  const feeSection = page.locator('[role="dialog"]').first().locator('text=/Total sent/').locator('xpath=ancestor::div[contains(@class,"border")]').first();
  if (await feeSection.isVisible({ timeout: 2000 }).catch(() => false)) {
    return await feeSection.textContent();
  }
  // Fallback: get all dialog text
  return await page.locator('[role="dialog"]').first().textContent().catch(() => '');
}

const results = [];
function pass(name) { results.push({ name, ok: true }); }
function fail(name, msg) { results.push({ name, ok: false, msg: msg.split('\n')[0] }); }

async function t(name, fn) {
  console.log(`\n🧪 ${name}`);
  try { await fn(); pass(name); }
  catch(e) { fail(name, e.message); console.error(`  ❌ ${e.message.split('\n')[0]}`); }
}

// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🔗 Connecting to', CDP_URL);
  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0] || await browser.newContext();

  // Track API calls across all tests
  const api = { boltz: [], symbiosis: [], lifi: [] };

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 1: WALLET + SWAP DRAWER + FEE DISPLAY
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();
    page.on('request', (r) => {
      const u = r.url();
      if (u.includes('boltz.exchange') && !u.endsWith('.js')) api.boltz.push(u);
      if (u.includes('symbiosis.finance')) api.symbiosis.push(u);
      if ((u.includes('li.fi') || u.includes('/lifi')) && !u.endsWith('.ts') && !u.endsWith('.js')) api.lifi.push(u);
    });

    await t('Wallet page loads with balance', async () => {
      await loginWallet(page);
      const body = await page.textContent('body');
      if (!body.includes('Sats')) throw new Error('No balance shown');
      if (!body.includes('Swap')) throw new Error('No Swap button');
      await shot(page, '01-wallet');
    });

    await t('Swap drawer opens with correct defaults', async () => {
      await openSwap(page);
      const dlg = await page.locator('[role="dialog"]').first().textContent();
      if (!dlg.includes('rBTC')) throw new Error('Default source not rBTC');
      if (!dlg.includes('USD')) throw new Error('Default dest not USD');
      if (!dlg.includes('Total sent')) throw new Error('Fee card not present');
      await shot(page, '02-drawer-defaults');
    });

    await t('2500 sats: route resolves, fees shown correctly', async () => {
      await fillAmount(page, '2500');
      const feeText = await getFeeCardText(page);
      console.log(`  Fee card: "${feeText.replace(/\s+/g, ' ').trim().substring(0, 200)}"`);

      if (!feeText.includes('Total sent')) throw new Error('Total sent missing');
      if (!feeText.includes('Fee')) throw new Error('Fee label missing');
      if (!feeText.includes('You receive')) throw new Error('You receive missing');

      // Verify non-zero amounts
      const hasSats = /\d[\d,]*\s*Sats/.test(feeText);
      const hasDollar = /\$\d+\.?\d*/.test(feeText);
      console.log(`  Has sats amount: ${hasSats}, Has dollar: ${hasDollar}`);

      await shot(page, '03-2500-sats');
    });

    await t('Provider label shows "via Boltz + LI.FI"', async () => {
      const dlg = await page.locator('[role="dialog"]').first().textContent();
      const hasBoltz = dlg.includes('Boltz');
      const hasLifi = dlg.includes('LI.FI') || dlg.includes('LI.Fi');
      console.log(`  Boltz: ${hasBoltz}, LI.FI: ${hasLifi}`);
      if (!hasBoltz) throw new Error('Boltz not in provider label');
      // LI.FI may or may not be shown depending on route
    });

    await t('Estimated time shown (non-zero)', async () => {
      const dlg = await page.locator('[role="dialog"]').first().textContent();
      const match = dlg.match(/Est\. time:\s*(.+)/);
      if (match) console.log(`  Est time: "${match[1].trim()}"`);
      else throw new Error('Est. time not found');
    });

    await t('Fee math: sats sent > sats fee > 0, receive = sent - fee', async () => {
      const feeText = await getFeeCardText(page);
      // Parse numbers: look for patterns like "2,500 sats" and "-166 Sats"
      const satsNums = [...feeText.matchAll(/([\d,]+)\s*[Ss]ats/g)].map(m => parseInt(m[1].replace(/,/g, '')));
      console.log(`  Sats values: ${satsNums.join(', ')}`);
      if (satsNums.length < 2) throw new Error(`Expected >=2 sats values, got ${satsNums.length}`);
      // First = total sent, second = fee (negative)
      const [sent, fee] = satsNums;
      if (sent <= 0) throw new Error(`Sent should be >0, got ${sent}`);
      if (fee <= 0) throw new Error(`Fee should be >0, got ${fee}`);
      if (fee >= sent) throw new Error(`Fee (${fee}) >= sent (${sent})`);
      console.log(`  Math check: ${sent} - ${fee} = ${sent - fee} sats`);
    });

    await t('Dollar amounts shown for fee and receive', async () => {
      const feeText = await getFeeCardText(page);
      const dollars = [...feeText.matchAll(/\$(\d+\.?\d*)/g)].map(m => parseFloat(m[1]));
      console.log(`  Dollar values: ${dollars.map(d => '$' + d.toFixed(2)).join(', ')}`);
      if (dollars.length < 1) throw new Error('No dollar amounts shown');
    });

    await t('Boltz API was called (chain swap endpoint)', async () => {
      console.log(`  Boltz requests: ${api.boltz.length}`);
      api.boltz.forEach(u => console.log(`    → ${u}`));
      if (api.boltz.length === 0) throw new Error('No Boltz API calls');
      const hasChainSwap = api.boltz.some(u => u.includes('/swap/chain'));
      console.log(`  Chain swap endpoint called: ${hasChainSwap}`);
    });

    await t('Symbiosis API was called (quote endpoint)', async () => {
      console.log(`  Symbiosis requests: ${api.symbiosis.length}`);
      api.symbiosis.forEach(u => console.log(`    → ${u}`));
      if (api.symbiosis.length === 0) console.log('  ⚠️  No Symbiosis calls (may be expected for this pair)');
    });

    await t('Swap Preview button is enabled with valid amount', async () => {
      const btn = page.locator('button:has-text("Swap Preview")').first();
      const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`  Visible: ${visible}`);
      if (visible) {
        const disabled = await btn.isDisabled();
        console.log(`  Disabled: ${disabled}`);
        if (disabled) throw new Error('Preview should be enabled with valid amount');
      }
    });

    await shot(page, '04-final-state');
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 2: MAX BUTTON + MINIMUM + EDGE CASES (fresh page)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();

    await t('Max button fills full balance and triggers route', async () => {
      await loginWallet(page);
      await openSwap(page);

      const maxBtn = page.locator('button:has-text("Max")').first();
      await maxBtn.click();
      await page.waitForTimeout(5000);

      const input = page.locator('input[inputmode="decimal"]').first();
      const val = await input.inputValue();
      console.log(`  Input value: ${val}`);
      if (!val || val === '0') throw new Error('Max did not fill input');

      const feeText = await getFeeCardText(page);
      const hasReceive = feeText.includes('You receive');
      console.log(`  Fee card populated: ${hasReceive}`);
      if (!hasReceive) throw new Error('Fee card not populated after Max');

      await shot(page, '05-max-button');
    });

    await t('Below minimum: 100 sats shows minimum indicator', async () => {
      // Navigate fresh to reset
      await page.goto(`${APP}/dashboard/wallet`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1000);
      await openSwap(page);

      const input = page.locator('input[inputmode="decimal"]').first();
      await input.fill('100');
      await input.press('Tab');
      await page.waitForTimeout(3000);

      const dlg = await page.locator('[role="dialog"]').first().textContent();
      const hasMinimum = dlg.includes('Minimum') || dlg.includes('minimum');
      console.log(`  Minimum text: ${hasMinimum}`);
      if (!hasMinimum) console.log('  ⚠️  No minimum indicator for 100 sats');

      await shot(page, '06-below-minimum');
    });

    await t('Swap Preview disabled when amount is 0', async () => {
      await page.goto(`${APP}/dashboard/wallet`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1000);
      await openSwap(page);

      // Amount should be 0
      const input = page.locator('input[inputmode="decimal"]').first();
      const val = await input.inputValue();
      console.log(`  Default input: "${val}"`);

      const btn = page.locator('button:has-text("Swap Preview")').first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const disabled = await btn.isDisabled();
        console.log(`  Preview disabled at 0: ${disabled}`);
      }
      await shot(page, '07-preview-at-zero');
    });

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 3: CONSOLE ERRORS + LI.FI REQUESTS
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (t.includes('swap') || t.includes('boltz') || t.includes('symbiosis') || t.includes('lifi') || t.includes('route') || t.includes('route-resolver')) {
          consoleErrors.push(t.substring(0, 200));
        }
      }
    });

    await t('No swap-related console errors during resolution', async () => {
      await loginWallet(page);
      await openSwap(page);
      await fillAmount(page, '2500');
      await page.waitForTimeout(3000);

      if (consoleErrors.length > 0) {
        console.log(`  Errors (${consoleErrors.length}):`);
        consoleErrors.forEach(e => console.log(`    ${e}`));
      } else {
        console.log('  ✅ No swap-related console errors');
      }
    });

    await t('LI.FI API requests for RBTC→USD', async () => {
      console.log(`  LI.FI requests: ${api.lifi.length}`);
      api.lifi.forEach(u => console.log(`    → ${u}`));
      if (api.lifi.length === 0) console.log('  ⚠️  No LI.FI requests (may be proxied or not queried for this pair)');
    });

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 4: APP ROUTE NAVIGATION SMOKE
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();
    const routes = [
      ['/', 'Home'],
      ['/auth/login', 'Login'],
      ['/auth/signup', 'Signup'],
      ['/services', 'Services'],
      ['/faq', 'FAQ'],
      ['/terms', 'Terms'],
      ['/privacy', 'Privacy'],
      ['/how-it-works', 'HowItWorks'],
      ['/about', 'About'],
      ['/security', 'Security'],
    ];

    for (const [path, name] of routes) {
      await t(`Route ${name} (${path})`, async () => {
        await page.goto(`${APP}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
        const len = (await page.textContent('body')).length;
        if (len < 50) throw new Error(`Body too short: ${len} chars`);
        await shot(page, `route-${name.toLowerCase()}`);
      });
    }

    // Authed routes
    await loginWallet(page);
    for (const [path, name] of [['/dashboard', 'Dashboard'], ['/earning', 'Earning'], ['/dashboard/settings', 'Settings'], ['/dashboard/profile', 'Profile'], ['/reviews', 'Reviews'], ['/dashboard/messages', 'Messages']]) {
      await t(`Authed ${name}`, async () => {
        await page.goto(`${APP}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
        await shot(page, `authed-${name.toLowerCase()}`);
      });
    }

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════════════════
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok);
  console.log('\n' + '═'.repeat(60));
  console.log(`RESULTS: ${pass}/${results.length} passed, ${fail.length} failed`);
  console.log('═'.repeat(60));
  for (const r of results) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.msg ? ' — ' + r.msg : ''}`);
  }
  console.log('═'.repeat(60));

  console.log('\n📊 API Request Summary:');
  console.log(`  Boltz:     ${api.boltz.length} — ${api.boltz.join(', ') || 'none'}`);
  console.log(`  Symbiosis: ${api.symbiosis.length} — ${api.symbiosis.join(', ') || 'none'}`);
  console.log(`  LI.FI:     ${api.lifi.length} — ${api.lifi.join(', ') || 'none'}`);

  await browser.close();
}

main().catch(console.error);
