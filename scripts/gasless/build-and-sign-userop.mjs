#!/usr/bin/env node
/**
 * build-and-sign-userop.mjs
 * Helper script: build + sign a UserOperation from CLI for E2E testing.
 *
 * Usage:
 *   node build-and-sign-userop.mjs \
 *     --token 0xUSDT0_ADDRESS \
 *     --amount 1000000 \
 *     --recipient 0xRECIPIENT \
 *     --fee-buffer 10000 \
 *     --private-key 0xPRIVATE_KEY \
 *     --rpc-url https://arb-sepolia.g.alchemy.com/v2/KEY \
 *     --paymaster 0xPAYMASTER_ADDRESS
 *
 * Output: JSON to stdout (SerializedUserOperation)
 */
import { parseArgs } from 'node:util';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const { values } = parseArgs({
  options: {
    token:       { type: 'string' },
    amount:      { type: 'string' },
    recipient:   { type: 'string' },
    'fee-buffer': { type: 'string' },
    'private-key': { type: 'string' },
    'rpc-url':   { type: 'string' },
    paymaster:   { type: 'string' },
    entrypoint:  { type: 'string', default: '0x433709009B8330FDa32311DF1C2AFA402eD8D009' },
    reset:       { type: 'boolean', default: false },
    chain:       { type: 'string', default: 'sepolia' },
  },
  strict: false,
});

const tokenAddress     = values.token;
const amount           = BigInt(values.amount);
const recipientAddress = values.recipient;
const feeBuffer        = BigInt(values['fee-buffer']);
const privateKey       = values['private-key'];
const rpcUrl           = values['rpc-url'];
const paymasterAddress = values.paymaster;
const entryPointAddress = values.entrypoint;
const isReset          = values.reset;

// Validate required args
for (const [key, val] of Object.entries({
  token: tokenAddress, amount: values.amount,
  recipient: recipientAddress, 'fee-buffer': values['fee-buffer'],
  'private-key': privateKey, 'rpc-url': rpcUrl, paymaster: paymasterAddress,
})) {
  if (!val) {
    console.error(`Missing required arg: --${key}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Provider & wallet
// ---------------------------------------------------------------------------
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

// ---------------------------------------------------------------------------
// Simple7702Account ABI (minimal)
// ---------------------------------------------------------------------------
const simple7702Abi = [
  'function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata calldatas)',
  'function execute(address target, uint256 value, bytes calldata data)',
  'function nonce() view returns (uint256)',
];

const SIMPLE7702_IMPL = '0xe6Cae83BdE06E4c305530e199D7217f42808555B';

// ---------------------------------------------------------------------------
// ERC-20 transfer helper
// ---------------------------------------------------------------------------
const erc20Abi = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

const erc20Interface = new ethers.Interface(erc20Abi);
const simple7702Interface = new ethers.Interface(simple7702Abi);

function encodeTransfer(to, amt) {
  return erc20Interface.encodeFunctionData('transfer', [to, amt]);
}

// ---------------------------------------------------------------------------
// Build callData
// ---------------------------------------------------------------------------
function buildCallData() {
  if (isReset) {
    // Escape hatch: empty executeBatch (clears delegation)
    return simple7702Interface.encodeFunctionData('executeBatch', [
      [wallet.address],
      [0n],
      ['0x'],
    ]);
  }

  // Normal send: batch [transfer(amount), transfer(feeBuffer)]
  const targets = [tokenAddress, tokenAddress];
  const values = [0n, 0n];
  const calldatas = [
    encodeTransfer(recipientAddress, amount),
    encodeTransfer('0x0000000000000000000000000000000000000001', feeBuffer), // GAS_TREASURY placeholder
  ];

  return simple7702Interface.encodeFunctionData('executeBatch', [targets, values, calldatas]);
}

// ---------------------------------------------------------------------------
// Get nonce + gas parameters
// ---------------------------------------------------------------------------
async function getUserOpParams() {
  const sender = wallet.address;

  // Try to get nonce from Simple7702Account, fallback to 0n
  let nonce = 0n;
  try {
    const contract = new ethers.Contract(SIMPLE7702_IMPL, simple7702Abi, provider);
    nonce = await contract.nonce();
  } catch {
    // Account may not be initialized yet — nonce stays 0
  }

  // Gas estimation
  const feeData = await provider.getFeeData();

  return {
    sender,
    nonce,
    callData: buildCallData(),
    callGasLimit: 500_000n,
    verificationGasLimit: 200_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: feeData.maxFeePerGas ?? 100_000_000n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 10_000_000n,
    paymasterAndData: '0x',
  };
}

// ---------------------------------------------------------------------------
// Hash + Sign UserOp (ERC-4337 hash scheme)
// ---------------------------------------------------------------------------
function hashUserOp(userOp) {
  // keccak256(encode(userOp)) — simplified for CLI usage
  const fields = [
    userOp.sender, userOp.nonce, userOp.callData, userOp.callGasLimit,
    userOp.verificationGasLimit, userOp.preVerificationGas, userOp.maxFeePerGas,
    userOp.maxPriorityFeePerGas,
  ];

  const packed = fields.map((v) => {
    if (typeof v === 'bigint') return ethers.toBeHex(v, 32);
    return ethers.zeroPadValue(String(v), 32);
  });

  return ethers.keccak256(ethers.concat(packed));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const params = await getUserOpParams();

  // Build UserOp hash for signing
  const userOpHash = hashUserOp(params);

  // Sign with the wallet's private key (raw ECDSA, no EIP-191 prefix)
  const signature = wallet.signingKey.sign(userOpHash).serialized;

  // Output SerializedUserOperation
  const serialized = {
    sender: params.sender,
    nonce: '0x' + params.nonce.toString(16),
    callData: params.callData,
    callGasLimit: '0x' + params.callGasLimit.toString(16),
    verificationGasLimit: '0x' + params.verificationGasLimit.toString(16),
    preVerificationGas: '0x' + params.preVerificationGas.toString(16),
    maxFeePerGas: '0x' + params.maxFeePerGas.toString(16),
    maxPriorityFeePerGas: '0x' + params.maxPriorityFeePerGas.toString(16),
    paymasterAndData: params.paymasterAndData,
    signature,
  };

  // Wrap in relay DTO format
  const relayPayload = {
    sender: params.sender,
    userOp: serialized,
  };

  console.log(JSON.stringify(relayPayload, null, 2));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
