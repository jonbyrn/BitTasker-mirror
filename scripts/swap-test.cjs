const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 10000 });
  const p = browser.contexts()[0].pages().find(pg => pg.url().includes('/wallet'));
  if (!p) { console.error('No tab'); process.exit(1); }

  const logs = [];
  p.on('console', msg => {
    const t = msg.text();
    if (t.includes('[pollBoltz]') || t.includes('[executeTbtc') || t.includes('[sendEvm') ||
        t.includes('[storeBoltz') || t.includes('[startSwap') || t.includes('[executeHop') ||
        t.includes('[executeSymbiosis]') || t.includes('ERC20') || t.includes('approve') ||
        t.includes('lock result') || t.includes('SERVER CONFIRMED') || t.includes('claim') ||
        t.includes('Claiming') || t.includes('receipt') || t.includes('waitForReceipt') ||
        t.includes('tx confirmed') || t.includes('tx submitted')) {
      logs.push(t);
    }
  });

  await p.goto('http://localhost:3000/wallet', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(5000);
  await p.evaluate(async () => {
    const { resetSwapChainState } = await import('/src/lib/services/swap-chain/state.ts');
    await resetSwapChainState();
  });

  // Open swap
  await p.click('button:has-text("Swap")', { timeout: 5000, force: true });
  await p.waitForTimeout(3000);

  // wBTC source
  await p.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const r = btn.getBoundingClientRect();
      if (r.y > 110 && r.y < 170 && r.x > 50 && r.width > 300 && btn.offsetHeight > 0) { btn.click(); return; }
    }
  });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent?.includes('wBTC') && btn.textContent?.includes('Wrapped') && btn.offsetHeight > 0) { btn.click(); return; }
    }
  });
  await p.waitForTimeout(2000);

  // rBTC dest
  await p.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const r = btn.getBoundingClientRect();
      if (r.y > 260 && r.y < 310 && r.x > 50 && r.width > 300 && btn.offsetHeight > 0) { btn.click(); return; }
    }
  });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const text = btn.textContent || '';
      if (text.includes('rBTC') && text.includes('Rootstock') && btn.offsetHeight > 0) { btn.click(); return; }
    }
  });
  await p.waitForTimeout(2000);

  // Enter 3000
  const input = p.locator('input[type="number"], input[inputmode="numeric"]').first();
  if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
    await input.click({ force: true });
    await input.fill('');
    await input.type('3000', { delay: 100 });
  }
  await p.waitForTimeout(15000);

  // Preview + Confirm
  await p.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent?.includes('Swap Preview') && btn.offsetHeight > 0) { btn.click(); return; }
    }
  });
  await p.waitForTimeout(5000);
  await p.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const t = btn.textContent?.trim() || '';
      if (t === 'Confirm Swap' && btn.offsetHeight > 0) { btn.click(); return; }
    }
  });

  console.log('Confirmed, waiting 180s for swap to complete...');
  await p.waitForTimeout(180000);

  console.log('\n=== DEBUG LOGS ===');
  logs.forEach(l => console.log(l));

  const state = await p.evaluate(async () => {
    const { loadSwapChainState } = await import('/src/lib/services/swap-chain/state.ts');
    return loadSwapChainState();
  });
  console.log('\n=== STATE ===');
  console.log('Phase:', state.phase);
  console.log('swap1Id:', state.swap1Id?.slice(0, 20));
  console.log('swap2Id:', state.swap2Id);
  console.log('error:', state.error);

  const text = await p.evaluate(() => document.body.innerText);
  const relevant = text.split('\n').filter(l => /Locking|Claiming|Pending|Confirmed|Success|Failed|error|Sats|\$/i.test(l) && l.trim().length > 2);
  console.log('\n=== PAGE ===');
  relevant.forEach(l => console.log('  ' + l.trim().slice(0, 120)));

  await browser.close();
}
run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
