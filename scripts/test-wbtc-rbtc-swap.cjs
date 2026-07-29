const { chromium } = require('playwright');

const TIMEOUT = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL = 10000; // 10 seconds

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readPageState(page) {
  return page.evaluate(() => {
    const getText = (el) => el?.textContent?.trim() || '';
    const body = document.body.innerText;
    
    // Try to extract structured info from the swap UI
    const labels = document.querySelectorAll('.stat-title, .label, .text-xs, .text-sm, .opacity-70, dt, th');
    const values = document.querySelectorAll('.stat-value, .text-lg, .font-bold, .font-mono, dd, td');
    
    const pairs = [];
    labels.forEach((l, i) => {
      const text = getText(l);
      if (text && text.length < 60) {
        // Find nearest value sibling
        const parent = l.parentElement;
        const val = parent ? getText(parent) : '';
        pairs.push({ label: text, parent: val.substring(0, 200) });
      }
    });
    
    // Also grab all visible text blocks
    const allText = body.substring(0, 5000);
    
    return { pairs, allText };
  });
}

async function main() {
  console.log('=== wBTC → rBTC Swap Test ===\n');
  
  // 1. Connect to existing browser via CDP
  console.log('[1] Connecting to browser at localhost:9222...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  console.log(`    Found ${contexts.length} context(s)`);
  
  // 2. Find existing /wallet page tab
  let walletPage = null;
  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      const url = page.url();
      console.log(`    Tab: ${url}`);
      if (url.includes('/wallet')) {
        walletPage = page;
      }
    }
  }
  
  if (!walletPage) {
    console.error('ERROR: No /wallet page found!');
    await browser.close();
    process.exit(1);
  }
  console.log(`    Using wallet page: ${walletPage.url()}\n`);
  
  // 3. Close any open drawer/modal
  console.log('[2] Closing any open drawer...');
  await walletPage.keyboard.press('Escape');
  await sleep(1000);
  await walletPage.keyboard.press('Escape');
  await sleep(1000);
  
  // Read initial state
  console.log('[3] Reading initial wallet state...');
  const initialState = await readPageState(walletPage);
  console.log('    Page text (first 2000 chars):');
  console.log('    ' + initialState.allText.substring(0, 2000).replace(/\n/g, '\n    '));
  console.log('');
  
  // 4. Click Swap button
  console.log('[4] Clicking "Swap" button...');
  const swapClicked = await walletPage.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    for (const btn of btns) {
      const text = btn.textContent?.trim() || '';
      if (text === 'Swap' || text === 'SWAP' || text.match(/^swap$/i)) {
        btn.click();
        return `Clicked: "${text}"`;
      }
    }
    // Fallback: look for tabs or navigation
    const tabs = [...document.querySelectorAll('[role="tab"], .tab, .nav-link')];
    for (const tab of tabs) {
      const text = tab.textContent?.trim() || '';
      if (text.toLowerCase().includes('swap')) {
        tab.click();
        return `Clicked tab: "${text}"`;
      }
    }
    return null;
  });
  console.log(`    Result: ${swapClicked || 'NOT FOUND'}`);
  await sleep(2000);
  
  // Take a screenshot to see current state
  await walletPage.screenshot({ path: '/tmp/swap-step4-after-swap-btn.png', fullPage: true });
  console.log('    Screenshot: /tmp/swap-step4-after-swap-btn.png');
  
  // 5. Select wBTC source
  console.log('\n[5] Selecting wBTC as source...');
  
  // Click the "From" collapse/selector
  const fromClicked = await walletPage.evaluate(() => {
    const elements = [...document.querySelectorAll('.collapse-title, .select, [class*="collapse"], [class*="select"], summary, button')];
    const candidates = [];
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const text = el.textContent?.trim() || '';
      if (rect.y < 250 && rect.y > 0 && text.includes('Bitcoin')) {
        candidates.push({ text: text.substring(0, 80), y: rect.y, tag: el.tagName });
      }
    }
    // Click the first candidate
    if (candidates.length > 0) {
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.trim() || '';
        if (rect.y < 250 && rect.y > 0 && text.includes('Bitcoin')) {
          el.click();
          return `Clicked From: "${text.substring(0, 60)}" at y=${rect.y}`;
        }
      }
    }
    return `No From element found. Candidates: ${JSON.stringify(candidates)}`;
  });
  console.log(`    ${fromClicked}`);
  await sleep(1500);
  
  // Click wBTC option
  const wbtcClicked = await walletPage.evaluate(() => {
    const options = [...document.querySelectorAll('*')];
    for (const el of options) {
      const text = el.textContent?.trim() || '';
      const rect = el.getBoundingClientRect();
      if (text.includes('wBTC') && text.includes('Wrapped') && rect.width > 0 && rect.height > 0 && rect.height < 100) {
        el.click();
        return `Clicked wBTC option: "${text.substring(0, 60)}"`;
      }
    }
    // Fallback: just wBTC
    for (const el of options) {
      const text = el.textContent?.trim() || '';
      const rect = el.getBoundingClientRect();
      if (text.includes('wBTC') && rect.width > 0 && rect.height > 0 && rect.height < 80) {
        el.click();
        return `Clicked wBTC fallback: "${text.substring(0, 60)}"`;
      }
    }
    return 'wBTC option not found';
  });
  console.log(`    ${wbtcClicked}`);
  await sleep(1500);
  
  // 6. Select rBTC destination
  console.log('\n[6] Selecting rBTC as destination...');
  
  const toClicked = await walletPage.evaluate(() => {
    const elements = [...document.querySelectorAll('.collapse-title, .select, [class*="collapse"], [class*="select"], summary, button')];
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      const text = el.textContent?.trim() || '';
      if (rect.y > 200 && rect.y < 400 && (text.includes('Lightning') || text.includes('Bitcoin') || text.includes('Select'))) {
        el.click();
        return `Clicked To: "${text.substring(0, 60)}" at y=${rect.y}`;
      }
    }
    return 'No To element found';
  });
  console.log(`    ${toClicked}`);
  await sleep(1500);
  
  // Click rBTC option
  const rbtcClicked = await walletPage.evaluate(() => {
    const options = [...document.querySelectorAll('*')];
    for (const el of options) {
      const text = el.textContent?.trim() || '';
      const rect = el.getBoundingClientRect();
      if (text.includes('rBTC') && text.includes('Rootstock') && rect.width > 0 && rect.height > 0 && rect.height < 100) {
        el.click();
        return `Clicked rBTC option: "${text.substring(0, 60)}"`;
      }
    }
    for (const el of options) {
      const text = el.textContent?.trim() || '';
      const rect = el.getBoundingClientRect();
      if (text.includes('rBTC') && rect.width > 0 && rect.height > 0 && rect.height < 80) {
        el.click();
        return `Clicked rBTC fallback: "${text.substring(0, 60)}"`;
      }
    }
    return 'rBTC option not found';
  });
  console.log(`    ${rbtcClicked}`);
  await sleep(1500);
  
  await walletPage.screenshot({ path: '/tmp/swap-step6-after-pairs.png', fullPage: true });
  console.log('    Screenshot: /tmp/swap-step6-after-pairs.png');
  
  // 7. Enter amount
  console.log('\n[7] Entering swap amount: 3000...');
  let swapAmount = '3000';
  
  const inputExists = await walletPage.evaluate(() => {
    const input = document.querySelector('input#swap-amount');
    return !!input;
  });
  
  if (!inputExists) {
    console.log('    input#swap-amount not found, looking for alternatives...');
    const altInput = await walletPage.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[type="number"], input[type="text"]')];
      for (const inp of inputs) {
        const rect = inp.getBoundingClientRect();
        const placeholder = inp.placeholder || '';
        if (placeholder.toLowerCase().includes('amount') || placeholder.toLowerCase().includes('sats') || rect.y > 200) {
          return { found: true, id: inp.id, placeholder, y: rect.y };
        }
      }
      return { found: false };
    });
    console.log('    Alternative input:', JSON.stringify(altInput));
  }
  
  try {
    const input = walletPage.locator('input#swap-amount');
    await input.click({ force: true });
    await sleep(300);
    await input.fill('');
    await sleep(300);
    await input.type(swapAmount, { delay: 100 });
    console.log(`    Entered: ${swapAmount}`);
  } catch (e) {
    console.log(`    Error with input#swap-amount: ${e.message}`);
    // Try generic input approach
    const typed = await walletPage.evaluate((amount) => {
      const inputs = [...document.querySelectorAll('input')];
      for (const inp of inputs) {
        const rect = inp.getBoundingClientRect();
        if (rect.y > 200 && rect.y < 500 && (inp.type === 'number' || inp.type === 'text' || inp.type === '')) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(inp, amount);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return `Set value on input at y=${rect.y}`;
        }
      }
      return 'No suitable input found';
    }, swapAmount);
    console.log(`    Fallback: ${typed}`);
  }
  
  // 8. Wait for route resolution
  console.log('\n[8] Waiting 15 seconds for route resolution...');
  await sleep(15000);
  
  await walletPage.screenshot({ path: '/tmp/swap-step8-after-route.png', fullPage: true });
  console.log('    Screenshot: /tmp/swap-step8-after-route.png');
  
  // 9. Read page state
  console.log('\n[9] Reading swap state...');
  const swapState = await readPageState(walletPage);
  console.log('    Page text:');
  console.log('    ' + swapState.allText.substring(0, 3000).replace(/\n/g, '\n    '));
  
  // Try to extract specific fields
  const extractedInfo = await walletPage.evaluate(() => {
    const body = document.body.innerText;
    const info = {};
    
    // Look for common patterns
    const patterns = {
      totalSent: /(?:total|send|you send)[:\s]*([\d,]+)\s*(?:sats|sat)/i,
      fee: /fee[:\s]*([\d,]+)\s*(?:sats|sat)/i,
      receive: /(?:you receive|receive|get)[:\s]*([\d,]+)\s*(?:sats|sat|rbtc)/i,
      route: /(?:via|routing|route)[:\s]*(.+)/i,
      time: /(?:est|estimate|time|duration)[:\s]*(.+)/i,
      minimum: /(?:minimum|min)[:\s]*([\d,]+)/i,
      maximum: /(?:maximum|max)[:\s]*([\d,]+)/i,
    };
    
    for (const [key, regex] of Object.entries(patterns)) {
      const match = body.match(regex);
      if (match) info[key] = match[1].trim();
    }
    
    // Check for errors
    if (body.includes('Not enough') || body.includes('not enough') || body.includes('Insufficient')) {
      info.error = 'Not enough funds';
    }
    if (body.includes('Minimum') || body.includes('minimum')) {
      const minMatch = body.match(/minimum[:\s]*([\d,]+)/i);
      if (minMatch) info.minimum = minMatch[1];
    }
    
    return info;
  });
  console.log('\n    Extracted info:', JSON.stringify(extractedInfo, null, 2));
  
  // 10. Click "Swap Preview"
  console.log('\n[10] Clicking "Swap Preview"...');
  const previewClicked = await walletPage.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    for (const btn of btns) {
      const text = btn.textContent?.trim() || '';
      if (text.includes('Swap Preview') || text.includes('Preview') || text.includes('preview')) {
        btn.click();
        return `Clicked: "${text}"`;
      }
    }
    // Fallback: primary/CTA buttons
    for (const btn of btns) {
      const text = btn.textContent?.trim() || '';
      const classes = btn.className || '';
      if ((classes.includes('btn-primary') || classes.includes('primary')) && text.length > 0 && text.length < 40) {
        btn.click();
        return `Clicked primary: "${text}"`;
      }
    }
    return 'Swap Preview button not found';
  });
  console.log(`    ${previewClicked}`);
  
  // 11. Wait for confirm screen
  console.log('\n[11] Waiting 3 seconds for confirm screen...');
  await sleep(3000);
  
  await walletPage.screenshot({ path: '/tmp/swap-step11-confirm-screen.png', fullPage: true });
  console.log('    Screenshot: /tmp/swap-step11-confirm-screen.png');
  
  // 12. Read confirm screen
  console.log('\n[12] Reading confirm screen...');
  const confirmState = await readPageState(walletPage);
  console.log('    Confirm text:');
  console.log('    ' + confirmState.allText.substring(0, 3000).replace(/\n/g, '\n    '));
  
  // 13. Click confirm button
  console.log('\n[13] Clicking confirm button...');
  const confirmClicked = await walletPage.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const candidates = [];
    for (const btn of btns) {
      const text = btn.textContent?.trim() || '';
      const classes = btn.className || '';
      const disabled = btn.disabled;
      if (text.toLowerCase().includes('confirm') && !text.includes('Preview')) {
        candidates.push({ text, classes: classes.substring(0, 100), disabled });
        if (!disabled) {
          btn.click();
          return `Clicked: "${text}" (enabled)`;
        }
      }
    }
    // Try "Yes", "Execute", "Submit" buttons
    for (const btn of btns) {
      const text = btn.textContent?.trim() || '';
      const disabled = btn.disabled;
      if ((text.includes('Yes') || text.includes('Execute') || text.includes('Submit') || text.includes('Proceed')) && !disabled) {
        btn.click();
        return `Clicked: "${text}"`;
      }
    }
    // Last resort: last primary button that isn't Preview/Cancel/Back
    for (const btn of btns.reverse()) {
      const text = btn.textContent?.trim() || '';
      const classes = btn.className || '';
      if (classes.includes('btn-primary') && !text.includes('Preview') && !text.includes('Cancel') && !text.includes('Back') && text.length > 0 && text.length < 40) {
        btn.click();
        return `Clicked last primary: "${text}"`;
      }
    }
    return `Confirm not found. Candidates: ${JSON.stringify(candidates)}`;
  });
  console.log(`    ${confirmClicked}`);
  
  // 14. Wait for swap execution
  console.log('\n[14] Monitoring swap execution (up to 5 minutes)...');
  let finalResult = 'UNKNOWN';
  let finalText = '';
  const startTime = Date.now();
  
  while (Date.now() - startTime < TIMEOUT) {
    await sleep(CHECK_INTERVAL);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    const state = await walletPage.evaluate(() => {
      const body = document.body.innerText;
      const result = {
        text: body.substring(0, 2000),
        status: 'pending',
      };
      
      if (body.includes('Confirmed') || body.includes('Success') || body.includes('Transaction Confirmed') || body.includes('completed') || body.includes('Complete')) {
        result.status = 'success';
      } else if (body.includes('failed') || body.includes('Failed') || body.includes('error') || body.includes('Error') || body.includes('rejected') || body.includes('timed out')) {
        result.status = 'failed';
      } else if (body.includes('Locking') || body.includes('Claiming') || body.includes('Pending') || body.includes('Processing') || body.includes('Waiting') || body.includes('Broadcasting')) {
        result.status = 'in_progress';
      }
      
      return result;
    });
    
    console.log(`    [${elapsed}s] Status: ${state.status}`);
    
    // Print relevant progress text
    const progressLines = state.text.split('\n').filter(line => {
      const l = line.toLowerCase();
      return l.includes('lock') || l.includes('claim') || l.includes('pending') || 
             l.includes('confirm') || l.includes('success') || l.includes('fail') || 
             l.includes('error') || l.includes('broadcast') || l.includes('process') ||
             l.includes('waiting') || l.includes('transaction') || l.includes('swap') ||
             l.includes('complete') || l.includes('sats') || l.includes('rbtc');
    }).slice(0, 10);
    
    if (progressLines.length > 0) {
      console.log(`    Progress: ${progressLines.join(' | ')}`);
    }
    
    if (state.status === 'success' || state.status === 'failed') {
      finalResult = state.status;
      finalText = state.text;
      break;
    }
  }
  
  if (finalResult === 'UNKNOWN') {
    finalResult = 'TIMEOUT';
    finalText = await walletPage.evaluate(() => document.body.innerText.substring(0, 2000));
  }
  
  // 15. Report result
  console.log('\n' + '='.repeat(60));
  console.log('SWAP RESULT: ' + finalResult.toUpperCase());
  console.log('='.repeat(60));
  console.log('\nFinal page text:');
  console.log(finalText.substring(0, 2000));
  
  // 16. Take final screenshot
  await walletPage.screenshot({ path: '/tmp/swap-wbtc-rbtc-final.png', fullPage: true });
  console.log('\n[16] Final screenshot: /tmp/swap-wbtc-rbtc-final.png');
  
  console.log('\n=== Test Complete ===');
  console.log(`Result: ${finalResult}`);
  
  // Don't close the browser - it's the user's browser
  browser.disconnect();
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
