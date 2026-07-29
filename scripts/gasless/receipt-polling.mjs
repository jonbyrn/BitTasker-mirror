#!/usr/bin/env node
/**
 * receipt-polling.mjs
 * Helper script: poll for UserOperation receipt from CLI for E2E testing.
 *
 * Usage:
 *   node receipt-polling.mjs \
 *     --hash 0xUSEROP_HASH \
 *     --rpc-url https://arb-sepolia.g.alchemy.com/v2/KEY \
 *     --timeout 120
 *
 * Output: JSON to stdout (receipt details)
 */
import { parseArgs } from 'node:util';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const { values } = parseArgs({
  options: {
    hash:     { type: 'string' },
    'rpc-url': { type: 'string' },
    timeout:   { type: 'string', default: '120' },
    interval:  { type: 'string', default: '5' },
    entrypoint: { type: 'string', default: '0x433709009B8330FDa32311DF1C2AFA402eD8D009' },
  },
  strict: false,
});

const userOpHash = values.hash;
const rpcUrl     = values['rpc-url'];
const timeoutSec = parseInt(values.timeout, 10);
const intervalSec = parseInt(values.interval, 10);
const entryPointAddress = values.entrypoint;

// Validate required args
for (const [key, val] of Object.entries({ hash: userOpHash, 'rpc-url': rpcUrl })) {
  if (!val) {
    console.error(`Missing required arg: --${key}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
const provider = new ethers.JsonRpcProvider(rpcUrl);

// ---------------------------------------------------------------------------
// EntryPoint event ABI
// ---------------------------------------------------------------------------
const entryPointInterface = new ethers.Interface([
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
]);

const eventFragment = entryPointInterface.getEvent('UserOperationEvent');
const eventTopic = eventFragment.topicHash;

// ---------------------------------------------------------------------------
// Main polling loop
// ---------------------------------------------------------------------------
async function pollForReceipt() {
  const startTime = Date.now();
  const timeoutMs = timeoutSec * 1000;
  const intervalMs = intervalSec * 1000;

  console.error(`Polling for UserOp receipt: ${userOpHash}`);
  console.error(`Timeout: ${timeoutSec}s, Interval: ${intervalSec}s`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Check for UserOperationEvent logs
      const filter = {
        address: entryPointAddress,
        topics: [eventTopic, userOpHash],
      };
      const logs = await provider.getLogs(filter);

      if (logs.length > 0) {
        const log = logs[0];
        const parsed = entryPointInterface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        const receipt = {
          userOpHash: parsed.args.userOpHash,
          sender: parsed.args.sender,
          paymaster: parsed.args.paymaster,
          success: parsed.args.success,
          actualGasCost: parsed.args.actualGasCost?.toString(),
          actualGasUsed: parsed.args.actualGasUsed?.toString(),
          blockNumber: log.blockNumber?.toString(),
          transactionHash: log.transactionHash,
          status: parsed.args.success ? 'success' : 'failed',
        };

        console.log(JSON.stringify(receipt, null, 2));
        process.exit(0);
      }

      // Wait for next interval
      console.error(`No receipt found. Waiting ${intervalSec}s...`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.error(`Error polling: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  // Timeout reached
  const timeoutResult = {
    userOpHash,
    status: 'timeout',
    message: `No receipt found within ${timeoutSec} seconds`,
  };

  console.log(JSON.stringify(timeoutResult, null, 2));
  process.exit(1);
}

pollForReceipt().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
