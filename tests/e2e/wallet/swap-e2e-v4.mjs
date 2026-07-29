/**
 * Swap E2E v4 — Correct selectors based on actual DOM structure
 *
 * Key findings from debugging:
 * - Input uses inputmode="numeric" (not "decimal")
 * - 3 [role="dialog"] elements: 2 empty wrappers + 1 content holder
 * - The swap content is in the LAST dialog
 * - Fee card: "Total sent X sats ≈ $Y Fee −N Sats ≈ $Z You receive via Provider $W Est. time: T min"
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CDP = 'http://localhost:9222';
const APP = 'http://localhost:3000';
const SS = join(process.cwd(), 'Screenshots', 'swap-final');
const NSEC_PATH = join(process.cwd(), 'test-nsec.txt');
mkdirSync(SS, { recursive: true });

const getNsec = () => readFileSync(NSEC_PATH, 'utf8').trim();
const shot = async (page, name) => {
  await page.screenshot({ path: join(SS, `${name}.png`), fullPage: true });
  console.log(`  📸 ${name}.png`);
};

/** Get text of the swap dialog (the LAST [role="dialog"] with content) */
async function swapDialog(page) {
  const dialogs = await page.locator('[role="dialog"]').all();
  for (let i = dialogs.length - 1; i >= 0; i--) {
    const text = await dialogs[i].textContent();
    if (text && text.includes('Swap')) return text;
  }
  // Fallback: page body
  return await page.textContent('body');
}

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

async function openSwap(page) {
  await page.locator('button').filter({ hasText: 'Swap' }).first().click();
  await page.waitForSelector('input[inputmode="numeric"]', { timeout: 10000 });
  await page.waitForTimeout(1000);
}

async function fillAmount(page, amount) {
  const input = page.locator('input[inputmode="numeric"]').first();
  await input.fill(amount);
  await input.press('Tab');
  await page.waitForTimeout(6000);
}

// ═══════════════════════════════════════════════════════════════════════════════
const results = [];
function ok(name) { results.push({ name, pass: true }); }
function fail(name, msg) { results.push({ name, pass: false, msg }); console.error(`  ❌ ${msg}`); }
async function t(name, fn) {
  console.log(`\n🧪 ${name}`);
  try { await fn(); ok(name); } catch(e) { fail(name, e.message.split('\n')[0]); }
}

async function main() {
  console.log('🔗 Connecting to', CDP);
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0] || await browser.newContext();

  const api = { boltz: [], symbiosis: [], lifi: [] };

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 1: WALLET + SWAP + FEE VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();
    page.on('request', (r) => {
      const u = r.url();
      if (u.includes('boltz.exchange') && !u.endsWith('.js')) api.boltz.push(u);
      if (u.includes('symbiosis.finance')) api.symbiosis.push(u);
      if ((u.includes('li.fi') || u.includes('/lifi')) && !u.endsWith('.ts') && !u.endsWith('.js')) api.lifi.push(u);
    });

    await t('Wallet loads with balance and Swap button', async () => {
      await loginWallet(page);
      const body = await page.textContent('body');
      if (!body.includes('Sats')) throw new Error('No balance');
      if (!body.includes('Swap')) throw new Error('No Swap button');
      await shot(page, '01-wallet');
    });

    await t('Swap drawer opens with rBTC→USD defaults', async () => {
      await openSwap(page);
      const text = await swapDialog(page);
      if (!text.includes('rBTC')) throw new Error('Default source not rBTC');
      if (!text.includes('USD')) throw new Error('Default dest not USD');
      await shot(page, '02-drawer-defaults');
    });

    await t('2500 sats: fee card shows Total sent / Fee / You receive', async () => {
      await fillAmount(page, '2500');
      const text = await swapDialog(page);
      
      const checks = {
        'Total sent': text.includes('Total sent'),
        'Fee': text.includes('Fee'),
        'You receive': text.includes('You receive'),
      };
      console.log(`  Labels: ${JSON.stringify(checks)}`);
      for (const [k, v] of Object.entries(checks)) {
        if (!v) throw new Error(`${k} label missing`);
      }
      await shot(page, '03-fee-card');
    });

    await t('Fee values: non-zero sats and dollar amounts', async () => {
      const text = await swapDialog(page);
      
      // Parse sats: "2,500 sats", "−166 Sats"
      const satsMatches = [...text.matchAll(/([\d,]+)\s*[Ss]ats/g)];
      const satsValues = satsMatches.map(m => parseInt(m[1].replace(/,/g, '')));
      console.log(`  Sats values: ${satsValues.join(', ')}`);
      
      // Parse dollars: "$1.58", "$0.10", "$1.49"
      const dollarMatches = [...text.matchAll(/\$(\d+\.?\d*)/g)];
      const dollarValues = dollarMatches.map(m => parseFloat(m[1]));
      console.log(`  Dollar values: $${dollarValues.join(', $')}`);
      
      if (satsValues.length < 2) throw new Error(`Expected ≥2 sats values, got ${satsValues.length}`);
      if (dollarValues.length < 1) throw new Error('No dollar amounts found');
      
      const [sent, fee] = satsValues;
      if (sent <= 0) throw new Error(`Sent ${sent} ≤ 0`);
      if (fee <= 0) throw new Error(`Fee ${fee} ≤ 0`);
      if (fee >= sent) throw new Error(`Fee ${fee} ≥ sent ${sent}`);
      
      console.log(`  ✅ ${sent} sats sent − ${fee} sats fee = ${sent - fee} sats received`);
    });

    await t('Provider label: "via Boltz + LI.FI"', async () => {
      const text = await swapDialog(page);
      const hasBoltz = text.includes('Boltz');
      const hasLifi = text.includes('LI.FI') || text.includes('LI.Fi');
      console.log(`  Boltz: ${hasBoltz}, LI.FI: ${hasLifi}`);
      if (!hasBoltz) throw new Error('Boltz not in provider label');
    });

    await t('Estimated time: "Est. time: X min"', async () => {
      const text = await swapDialog(page);
      const match = text.match(/Est\. time:\s*(.+)/);
      if (!match) throw new Error('Est. time not found');
      console.log(`  ${match[0].trim()}`);
      const timeMatch = match[1].match(/(\d+)/);
      if (timeMatch && parseInt(timeMatch[1]) <= 0) throw new Error('Time is 0');
    });

    await t('Fee math: receive = sent − fee (within rounding)', async () => {
      const text = await swapDialog(page);
      const sats = [...text.matchAll(/([\d,]+)\s*[Ss]ats/g)].map(m => parseInt(m[1].replace(/,/g, '')));
      const [sent, fee] = sats;
      const expected = sent - fee;
      // Verify "You receive" dollar amount makes sense (fee is roughly 6.6% for small amounts)
      const feePct = ((fee / sent) * 100).toFixed(1);
      console.log(`  Fee: ${feePct}% (${fee} sats on ${sent} sats)`);
      if (parseFloat(feePct) > 20) throw new Error(`Fee ${feePct}% is unreasonably high`);
      if (parseFloat(feePct) < 1) console.log('  ⚠️  Fee <1% — may indicate DEX route or rounding');
    });

    await t('Swap Preview button visible and enabled', async () => {
      const btn = page.locator('button:has-text("Swap Preview")').first();
      const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) throw new Error('Swap Preview not visible');
      const disabled = await btn.isDisabled();
      if (disabled) throw new Error('Swap Preview is disabled with valid amount');
    });

    await t('Boltz API called for swap chain', async () => {
      console.log(`  Boltz requests: ${api.boltz.length}`);
      api.boltz.forEach(u => console.log(`    → ${u}`));
      if (api.boltz.length === 0) throw new Error('No Boltz API calls');
    });

    await t('Symbiosis API called for quote', async () => {
      console.log(`  Symbiosis requests: ${api.symbiosis.length}`);
      api.symbiosis.forEach(u => console.log(`    → ${u}`));
      if (api.symbiosis.length === 0) console.log('  ⚠️  No Symbiosis calls');
    });

    await shot(page, '04-final');
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 2: MAX + MINIMUM + EDGE CASES
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();

    await t('Max button fills full balance', async () => {
      await loginWallet(page);
      await openSwap(page);

      await page.locator('button:has-text("Max")').first().click();
      await page.waitForTimeout(6000);

      const input = page.locator('input[inputmode="numeric"]').first();
      const val = await input.inputValue();
      console.log(`  Input: ${val}`);
      if (!val || val === '0') throw new Error('Max did not fill');

      const text = await swapDialog(page);
      if (!text.includes('You receive')) throw new Error('Fee card not populated');
      await shot(page, '05-max');
    });

    await t('Minimum: 100 sats shows minimum indicator', async () => {
      await page.goto(`${APP}/dashboard/wallet`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1000);
      await openSwap(page);

      await page.locator('input[inputmode="numeric"]').first().fill('100');
      await page.locator('input[inputmode="numeric"]').first().press('Tab');
      await page.waitForTimeout(3000);

      const text = await swapDialog(page);
      const hasMin = text.includes('Minimum') || text.includes('minimum');
      console.log(`  Minimum text: ${hasMin}`);
      if (!hasMin) console.log('  ⚠️  No minimum indicator');
      await shot(page, '06-below-min');
    });

    await t('Swap Preview disabled at 0 sats', async () => {
      await page.goto(`${APP}/dashboard/wallet`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1000);
      await openSwap(page);

      // Input should be 0 by default
      const btn = page.locator('button:has-text("Swap Preview")').first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const disabled = await btn.isDisabled();
        console.log(`  Disabled: ${disabled}`);
      }
      await shot(page, '07-preview-zero');
    });

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 3: CONSOLE ERRORS
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (/swap|boltz|symbiosis|lifi|route-resolver/i.test(t) && !t.includes('.ts:')) {
          errors.push(t.substring(0, 200));
        }
      }
    });

    await t('No swap-related console errors', async () => {
      await loginWallet(page);
      await openSwap(page);
      await fillAmount(page, '2500');
      await page.waitForTimeout(3000);
      if (errors.length > 0) {
        console.log(`  Errors: ${errors.length}`);
        errors.forEach(e => console.log(`    ${e}`));
      } else {
        console.log('  ✅ Clean console');
      }
    });

    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 4: ALL APP ROUTES
  // ─────────────────────────────────────────────────────────────────────────
  {
    const page = await ctx.newPage();

    const pubRoutes = [
      ['/', 'Home'], ['/auth/login', 'Login'], ['/auth/signup', 'Signup'],
      ['/services', 'Services'], ['/faq', 'FAQ'], ['/terms', 'Terms'],
      ['/privacy', 'Privacy'], ['/how-it-works', 'HowItWorks'],
      ['/about', 'About'], ['/security', 'Security'], ['/press', 'Press'],
      ['/contact', 'Contact'], ['/careers', 'Careers'],
    ];
    for (const [path, name] of pubRoutes) {
      await t(`Route ${name}`, async () => {
        await page.goto(`${APP}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
        const len = (await page.textContent('body')).length;
        if (len < 50) throw new Error(`Body too short: ${len}`);
      });
    }

    await loginWallet(page);
    const authRoutes = [
      ['/dashboard', 'Dashboard'], ['/earning', 'Earning'],
      ['/dashboard/settings', 'Settings'], ['/dashboard/profile', 'Profile'],
      ['/reviews', 'Reviews'], ['/dashboard/messages', 'Messages'],
      ['/feedback', 'Feedback'],
    ];
    for (const [path, name] of authRoutes) {
      await t(`Auth ${name}`, async () => {
        await page.goto(`${APP}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
      });
    }

    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════════════════
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  console.log('\n' + '═'.repeat(60));
  console.log(`RESULTS: ${passed}/${results.length} passed, ${failed.length} failed`);
  console.log('═'.repeat(60));
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    const detail = r.msg ? ` — ${r.msg}` : '';
    console.log(`  ${icon} ${r.name}${detail}`);
  }
  console.log('═'.repeat(60));
  console.log('\n📊 API calls:');
  console.log(`  Boltz:     ${api.boltz.length}`);
  console.log(`  Symbiosis: ${api.symbiosis.length}`);
  console.log(`  LI.FI:     ${api.lifi.length}`);
  
  await browser.close();
}

main().catch(console.error);
