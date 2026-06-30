const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 10000 });
  const p = browser.contexts()[0].pages().find(pg => pg.url().includes('/wallet'));
  if (!p) { console.error('No tab'); process.exit(1); }

  const logs = [];
  p.on('console', msg => {
    const t = msg.text();
    if (t.includes('approve') || t.includes('receipt') || t.includes('tx confirmed') ||
        t.includes('tx submitted') || t.includes('reverted') || t.includes('[pollBoltz]') ||
        t.includes('[executeTbtc') || t.includes('[executeSymbiosis]') || t.includes('lock result') ||
        t.includes('SERVER CONFIRMED') || t.includes('Claiming') || t.includes('[startSwap')) {
      logs.push(t);
    }
  });

  // Reset swap state
  await p.evaluate(async () => {
    const { resetSwapChainState } = await import('/src/lib/services/swap-chain/state.ts');
    await resetSwapChainState();
  });
  await p.waitForTimeout(500);

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

  console.log('Confirmed, monitoring...');
  // Poll for completion
  let result = 'UNKNOWN';
  for (let i = 0; i < 36; i++) {
    await p.waitForTimeout(10000);
    const t = await p.evaluate(() => document.body.innerText);
    if (/Transaction Confirmed|Confirmed/i.test(t)) { result = 'SUCCESS'; break; }
    if (/Swap Failed/i.test(t)) { result = 'FAILED: ' + (t.match(/Swap Failed[\s\S]*?(?=Home|$)/i)?.[0]?.trim().slice(0, 200) || ''); break; }
    if (/PARTIAL/i.test(t)) { result = 'PARTIAL'; break; }
    const progress = t.match(/(?:Locking|Claiming|Pending|Confirming|Swapping|Sending|Waiting).{0,60}/i);
    console.log('  [' + ((i+1)*10) + 's] ' + (progress?.[0]?.trim() || 'processing...'));
  }

  console.log('\n=== RESULT:', result, '===');
  console.log('\n=== DEBUG LOGS ===');
  logs.slice(-30).forEach(l => console.log(l));

  const state = await p.evaluate(async () => {
    const { loadSwapChainState } = await import('/src/lib/services/swap-chain/state.ts');
    return loadSwapChainState();
  });
  console.log('\nState:', state.phase, 'swap1:', state.swap1Id?.slice(0, 16), 'swap2:', state.swap2Id, 'error:', state.error?.slice(0, 100));

  await browser.close();
}
run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
