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
import {
  createPublicClient,
  http,
  hexToBytes,
  keccak256,
  toHex,
  type Hex,
} from 'viem';
import { arbitrumSepolia, arbitrum } from 'viem/chains';

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
// Chain selection
// ---------------------------------------------------------------------------
const chain = rpcUrl.includes('sepolia') ? arbitrumSepolia : arbitrum;
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

// ---------------------------------------------------------------------------
// EntryPoint ABI (minimal for getUserOpHash and receipt)
// ---------------------------------------------------------------------------
const entryPointAbi = [
  'function getUserOpHash(tuple(address sender, uint256 nonce, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)',
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
];

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
      // Method 1: Check for UserOperationEvent logs
      const logs = await publicClient.getLogs({
        address: entryPointAddress as Hex,
        event: {
          type: 'event',
          name: 'UserOperationEvent',
          inputs: [
            { name: 'userOpHash', type: 'bytes32', indexed: true },
            { name: 'sender', type: 'address', indexed: true },
            { name: 'paymaster', type: 'address', indexed: true },
            { name: 'success', type: 'bool', indexed: false },
            { name: 'actualGasCost', type: 'uint256', indexed: false },
            { name: 'actualGasUsed', type: 'uint256', indexed: false },
          ],
        },
        args: { userOpHash: userOpHash as Hex },
        fromBlock: 'latest',
        toBlock: 'latest',
      });

      if (logs.length > 0) {
        const log = logs[0];
        const receipt = {
          userOpHash: log.args.userOpHash,
          sender: log.args.sender,
          paymaster: log.args.paymaster,
          success: log.args.success,
          actualGasCost: log.args.actualGasCost?.toString(),
          actualGasUsed: log.args.actualGasUsed?.toString(),
          blockNumber: log.blockNumber?.toString(),
          transactionHash: log.transactionHash,
          status: log.args.success ? 'success' : 'failed',
        };

        console.log(JSON.stringify(receipt, null, 2));
        process.exit(0);
      }

      // Method 2: If we have a transaction hash from a previous call, check its receipt
      // (This would require storing state between calls, which we don't do here)

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
