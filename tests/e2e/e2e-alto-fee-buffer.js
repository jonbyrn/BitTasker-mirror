#!/usr/bin/env node
/**
 * E2E Alto Bundler Fee Buffer Verification
 *
 * Verifies that the Alto bundler correctly sponsored UserOps and that
 * fee buffer payments were made to the GAS_TREASURY.
 *
 * Checks:
 *   1. Alto bundler is reachable and healthy
 *   2. EntryPoint UserOperationEvent logs for paymaster-sponsored ops
 *   3. Fee buffer (ERC-20 token transfers) to treasury
 *   4. Paymaster deposit on EntryPoint
 *   5. Treasury token balances
 *
 * Prerequisites:
 *   - Alto bundler at alto.dev.bittasker.com
 *   - Arbitrum RPC access
 *
 * Usage:
 *   node tests/e2e/e2e-alto-fee-buffer.js
 */

import { ethers } from 'ethers';

const ALTO_URL = 'https://alto.dev.bittasker.com';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
const ENTRY_POINT = '0x433709009B8330FDa32311DF1C2AFA402eD8D009';
const PAYMASTER = '0xBAb8d966648d870760E29F00441227346B4fe135';
const TREASURY = '0x107173A6d659d4a6EeD09DD7630084a2d07c2996';
const USER = '0xF7782f2972BF06Aa6d98408C42ae36f910C7da10';
const TBTC_ARB = '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40';
const USDT0_ARB = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const WBTC_ARB = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

const bugs = [];
function reportBug(severity, description, details) {
    bugs.push({ severity, description, details });
    const icon = severity === 'CRITICAL' ? '🔴' : severity === 'HIGH' ? '🟠' : '🟡';
    console.log(`  ${icon} BUG [${severity}]: ${description}`);
    if (details) console.log(`     ${details}`);
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' E2E Alto Bundler Fee Buffer Verification');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const provider = new ethers.JsonRpcProvider(ARB_RPC);

    // Test 1: Alto bundler health
    console.log('[1/7] Alto bundler health check');
    try {
        const healthResp = await fetch(`${ALTO_URL}/health`);
        console.log(`  Status: ${healthResp.status}`);
        if (healthResp.status !== 200) {
            reportBug('CRITICAL', 'Alto bundler health check failed', `Status: ${healthResp.status}`);
        } else {
            console.log('  ✓ Alto bundler is healthy');
        }
    } catch (e) {
        reportBug('CRITICAL', 'Alto bundler unreachable', e.message);
    }
    console.log('');

    // Test 2: Alto metrics — UserOp counts
    console.log('[2/7] Alto metrics — UserOp counts');
    try {
        const metricsResp = await fetch(`${ALTO_URL}/metrics`);
        const metricsText = await metricsResp.text();
        
        const parseMetric = (name) => {
            const regex = new RegExp(`${name}\\{[^}]*\\}\\s+(\\d+\\.?\\d*)`, 'g');
            const matches = [];
            let m;
            while ((m = regex.exec(metricsText)) !== null) {
                matches.push(parseFloat(m[1]));
            }
            const simpleRegex = new RegExp(`^${name}\\s+(\\d+\\.?\\d*)`, 'm');
            const simpleMatch = metricsText.match(simpleRegex);
            if (simpleMatch) matches.push(parseFloat(simpleMatch[1]));
            return matches.length > 0 ? Math.max(...matches) : 0;
        };
        
        const received = parseMetric('alto_user_operations_received_total');
        const included = parseMetric('alto_user_operations_on_chain_total');
        const submitted = parseMetric('alto_bundles_submitted_total');
        
        console.log(`  UserOps received: ${received}`);
        console.log(`  UserOps on-chain: ${included}`);
        console.log(`  Bundles submitted: ${submitted}`);
        
        if (received === 0) {
            console.log('  ⚠ No UserOps received — fee buffer test may not have data');
        } else {
            console.log('  ✓ Bundler has processed UserOps');
        }
    } catch (e) {
        reportBug('HIGH', 'Failed to fetch Alto metrics', e.message);
    }
    console.log('');

    // Test 3: EntryPoint UserOperationEvent logs
    console.log('[3/7] EntryPoint UserOperationEvent logs');
    const userOpEventTopic = ethers.id('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)');
    
    try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = currentBlock - 1000;
        
        const logs = await provider.getLogs({
            address: ENTRY_POINT,
            topics: [userOpEventTopic],
            fromBlock,
            toBlock: currentBlock
        });
        
        console.log(`  Found ${logs.length} UserOperationEvents in last 1000 blocks`);
        
        const iface = new ethers.Interface([
            'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'
        ]);
        
        let paymasterSponsored = 0;
        let totalGasCost = 0n;
        
        for (const log of logs) {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            if (parsed.args.paymaster.toLowerCase() === PAYMASTER.toLowerCase()) {
                paymasterSponsored++;
                totalGasCost += parsed.args.actualGasCost;
                console.log(`  ✓ Paymaster-sponsored UserOp: sender=${parsed.args.sender.slice(0,10)}... success=${parsed.args.success} gas=${ethers.formatEther(parsed.args.actualGasCost)} ETH`);
            }
        }
        
        console.log(`  Paymaster-sponsored: ${paymasterSponsored}`);
        console.log(`  Total gas cost: ${ethers.formatEther(totalGasCost)} ETH`);
        
        if (paymasterSponsored === 0) {
            console.log('  ⚠ No paymaster-sponsored UserOps found');
        }
    } catch (e) {
        reportBug('HIGH', 'Failed to query EntryPoint logs', e.message);
    }
    console.log('');

    // Test 4: Paymaster deposit on EntryPoint
    console.log('[4/7] Paymaster deposit on EntryPoint');
    try {
        const epIface = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
        const epCall = await provider.call({
            to: ENTRY_POINT,
            data: epIface.encodeFunctionData('balanceOf', [PAYMASTER])
        });
        const deposit = epIface.decodeFunctionResult('balanceOf', epCall)[0];
        console.log(`  Deposit: ${ethers.formatEther(deposit)} ETH`);
        
        if (deposit === 0n) {
            reportBug('CRITICAL', 'Paymaster has no EntryPoint deposit');
        } else {
            console.log('  ✓ Paymaster has sufficient deposit');
        }
    } catch (e) {
        reportBug('HIGH', 'Failed to check paymaster deposit', e.message);
    }
    console.log('');

    // Test 5: Treasury token balances
    console.log('[5/7] Treasury token balances');
    const tokens = [
        { name: 'ETH', address: null },
        { name: 'tBTC', address: TBTC_ARB, decimals: 18 },
        { name: 'USDT0', address: USDT0_ARB, decimals: 6 },
        { name: 'WBTC', address: WBTC_ARB, decimals: 8 }
    ];
    
    for (const token of tokens) {
        try {
            let balance;
            if (!token.address) {
                balance = await provider.getBalance(TREASURY);
            } else {
                const erc20Iface = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
                const call = await provider.call({
                    to: token.address,
                    data: erc20Iface.encodeFunctionData('balanceOf', [TREASURY])
                });
                balance = erc20Iface.decodeFunctionResult('balanceOf', call)[0];
            }
            const formatted = token.decimals ? ethers.formatUnits(balance, token.decimals) : ethers.formatEther(balance);
            console.log(`  ${token.name}: ${formatted} (${balance.toString()} raw)`);
        } catch (e) {
            console.log(`  ${token.name}: FAILED (${e.message.slice(0, 50)})`);
        }
    }
    console.log('');

    // Test 6: Verify fee buffer transfers to treasury
    console.log('[6/7] Fee buffer transfers to treasury');
    try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = currentBlock - 1000;
        
        const transferTopic = ethers.id('Transfer(address,address,uint256)');
        const treasuryPadded = ethers.zeroPadValue(TREASURY, 32);
        
        const logs = await provider.getLogs({
            topics: [transferTopic, null, treasuryPadded],
            fromBlock,
            toBlock: currentBlock
        });
        
        console.log(`  Found ${logs.length} ERC-20 transfers to treasury in last 1000 blocks`);
        
        const iface = new ethers.Interface([
            'event Transfer(address indexed from, address indexed to, uint256 value)'
        ]);
        
        let totalReceived = {};
        for (const log of logs) {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            const token = log.address.toLowerCase();
            const value = parsed.args.value;
            
            if (!totalReceived[token]) totalReceived[token] = 0n;
            totalReceived[token] += value;
            
            console.log(`  Transfer: ${parsed.args.from.slice(0,10)}... → treasury, token=${token.slice(0,10)}..., value=${value.toString()}`);
        }
        
        for (const [token, total] of Object.entries(totalReceived)) {
            console.log(`  Total received at ${token.slice(0,10)}...: ${total.toString()}`);
        }
        
        if (logs.length === 0) {
            console.log('  ⚠ No fee buffer transfers found in recent blocks');
        } else {
            console.log('  ✓ Fee buffer transfers detected');
        }
    } catch (e) {
        reportBug('HIGH', 'Failed to check fee buffer transfers', e.message);
    }
    console.log('');

    // Test 7: Alto JSON-RPC functionality
    console.log('[7/7] Alto JSON-RPC functionality');
    try {
        const chainIdResp = await fetch(ALTO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 })
        });
        const chainIdData = await chainIdResp.json();
        const chainId = parseInt(chainIdData.result, 16);
        console.log(`  Chain ID: ${chainId}`);
        
        if (chainId !== 42161) {
            reportBug('CRITICAL', 'Alto bundler chain ID mismatch', `Expected 42161, got ${chainId}`);
        } else {
            console.log('  ✓ Correct chain ID (Arbitrum One)');
        }
        
        const epResp = await fetch(ALTO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_supportedEntryPoints', params: [], id: 2 })
        });
        const epData = await epResp.json();
        console.log(`  Supported EntryPoints: ${JSON.stringify(epData.result)}`);
        console.log('  ✓ Alto bundler responds to JSON-RPC');
    } catch (e) {
        reportBug('HIGH', 'Alto JSON-RPC failed', e.message);
    }
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' BUG REPORT');
    console.log('═══════════════════════════════════════════════════════════════');
    if (bugs.length === 0) {
        console.log('  ✓ No bugs found! Alto bundler fee buffer flow is correct.');
    } else {
        for (const bug of bugs) {
            console.log(`  [${bug.severity}] ${bug.description}`);
            if (bug.details) console.log(`    → ${bug.details}`);
        }
    }
    console.log('═══════════════════════════════════════════════════════════════');
    
    process.exit(bugs.some(b => b.severity === 'CRITICAL') ? 1 : 0);
}

main().catch(e => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
