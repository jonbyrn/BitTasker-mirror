import { chromium } from "playwright";
import { getStaticBotIdentities, loginWithNsec } from "./tests/e2e/fixtures/bot-auth.ts";

async function getAddresses() {
  const browser = await chromium.launch({ headless: true });
  const bots = getStaticBotIdentities();
  const results = {};

  for (const [name, bot] of Object.entries(bots)) {
    if (!bot) continue;
    const page = await browser.newPage();
    try {
      await loginWithNsec(page, bot.nsec, bot.npub, bot.mnemonic, "http://localhost:3000");
      await page.goto("http://localhost:3000/wallet");
      await page.waitForSelector('[data-testid="receive-value"]', { timeout: 15_000 });
      const addr = await page.locator('[data-testid="receive-value"]').textContent();
      results[name] = addr?.trim();
    } catch (err) {
      results[name] = `Error: ${err.message}`;
    } finally {
      await page.close();
    }
  }

  console.log("\n=== Bot Bitcoin Receive Addresses ===");
  console.dir(results);
  await browser.close();
}

getAddresses();
