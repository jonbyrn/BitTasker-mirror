#!/usr/bin/env node

const SWAP_ID = 'Aq3dd2ooXmxc';
const WALLET = '0xe1d3f94d0b1abebdbe5e722e68cdeca94a8e7d41';
const TBTC_CONTRACT = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';
const USDT0_CONTRACT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const RPC_URL = 'https://arb1.arbitrum.io/rpc';
const BOLTZ_API = `https://api.boltz.exchange/v2/swap/${SWAP_ID}`;

const ERC20_BALANCE_ABI = '0x70a08231000000000000000000000000' + WALLET.slice(2);

const START = Date.now();
let lastStatus = '';
let pollCount = 0;
const MAX_POLLS = 30;
const POLL_INTERVAL = 60000;

function elapsed() {
  const s = Math.floor((Date.now() - START) / 1000);
  return `${Math.floor(s/60)}m ${s%60}s`;
}

async function fetchBoltz() {
  try {
    const res = await fetch(BOLTZ_API);
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function fetchBalance(contractAddr) {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: contractAddr, data: ERC20_BALANCE_ABI }, 'latest'],
        id: 1
      })
    });
    const json = await res.json();
    return BigInt(json.result || '0x0');
  } catch (e) {
    return -1n;
  }
}

function divBigInt(val, decimals) {
  if (val < 0n) return 'ERROR';
  const s = val.toString();
  if (s.length <= decimals) return '0.' + s.padStart(decimals, '0');
  return s.slice(0, s.length - decimals) + '.' + s.slice(s.length - decimals);
}

async function poll() {
  pollCount++;
  const now = new Date().toISOString().slice(11, 19);
  console.log(`\n=== POLL #${pollCount} at ${now} [elapsed: ${elapsed()}] ===`);

  // Boltz status
  const boltz = await fetchBoltz();
  const status = boltz.status || 'unknown';
  if (boltz.error) {
    console.log(`Boltz API error: ${boltz.error}`);
  } else {
    console.log(`Boltz status: ${status}`);
    if (boltz.transaction) console.log(`  transaction: ${JSON.stringify(boltz.transaction)}`);
    if (boltz.failReason) console.log(`  failReason: ${boltz.failReason}`);
  }

  if (status !== lastStatus) {
    console.log(`*** STATUS CHANGE: ${lastStatus || '(initial)'} -> ${status} ***`);
    lastStatus = status;
  }

  // Balances
  const [tbtcRaw, usdtRaw] = await Promise.all([
    fetchBalance(TBTC_CONTRACT),
    fetchBalance(USDT0_CONTRACT)
  ]);
  console.log(`tBTC:  ${divBigInt(tbtcRaw, 18)}`);
  console.log(`USDT0: $${divBigInt(usdtRaw, 6)}`);

  // Terminal states
  if (/claimed|failed|expired|cancelled|error|refund/.test(status)) {
    console.log(`\n=== TERMINAL STATE: ${status} ===`);
    console.log(`Total time: ${elapsed()}`);
    process.exit(0);
  }

  if (pollCount >= MAX_POLLS) {
    console.log(`\n=== MAX POLLS REACHED (${MAX_POLLS}) ===`);
    console.log(`Last status: ${status}`);
    console.log(`Total time: ${elapsed()}`);
    process.exit(0);
  }

  setTimeout(poll, POLL_INTERVAL);
}

console.log(`=== SWAP MONITOR START: ${new Date().toISOString()} ===`);
console.log(`Swap: ${SWAP_ID} | Wallet: ${WALLET}`);
poll();
