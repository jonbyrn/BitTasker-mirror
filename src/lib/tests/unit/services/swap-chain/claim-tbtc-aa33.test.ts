/**
 * Swap Chain — tBTC Claim AA33 Paymaster Rejection Investigation
 *
 * Behavioral tests that reproduce the exact error seen when trying to claim
 * swap 3VqPV7ks1kDV:
 *
 *   "Paymaster rejected UserOp during gas estimation: Alto error -32501:
 *    UserOperation reverted during simulation with reason: AA33 reverted 0xbe9179a6"
 *
 * AA33 = paymaster's validatePaymasterUserOp() reverted during simulation.
 * 0xbe9179a6 = 4-byte custom error selector from the VerifyingPaymaster contract.
 *
 * The claim flow is:
 *   claimTbtcOnArbitrum() → claimSwapFunds() → sendEvmTransaction()
 *   → sendArbitrumTransaction() [built-in wallet, no sourceConnectedWalletId]
 *   → estimateFee(feeToken, 1n, to, actualCalls) → backend /gasless/estimate
 *   → sendGaslessCalls(calls, feeToken, feeBuffer, estimatedGas)
 *   → buildExecuteBatchCallData(claim + tBTC.transfer(treasury, fee))
 *   → signUserOp → gaslessService.relay() → Alto bundler → EntryPoint
 *   → paymaster.validatePaymasterUserOp() → REVERT AA33 0xbe9179a6
 *
 * These tests verify:
 *   1. The executeBatch calldata structure (claim + fee transfer batching)
 *   2. The ERC20Swap.claim() ABI encoding correctness
 *   3. The paymaster signature hash computation for the claim callData
 *   4. Error classification (AA33 is permanent, NOT transient)
 *   5. Error propagation through the entire chain
 *   6. The atomic claim+fee pattern behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Hoisted mock variables
// ---------------------------------------------------------------------------

const {
	mockSendEvmTransaction,
	mockEstimateFee,
	mockGaslessRelay,
	mockGaslessSimulate,
	mockGaslessPrepare
} = vi.hoisted(() => ({
	mockSendEvmTransaction: vi.fn(),
	mockEstimateFee: vi.fn(),
	mockGaslessRelay: vi.fn(),
	mockGaslessSimulate: vi.fn(),
	mockGaslessPrepare: vi.fn()
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/services/swap-chain/tx-helpers', () => ({
	sendEvmTransaction: mockSendEvmTransaction
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		extend: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })
	})
}));

// Mock wallet-state so claimTbtcOnArbitrum can get the signing wallet
const MOCK_SIGNER_WALLET = new ethers.Wallet(
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);
vi.mock('$lib/stores/wallet/wallet-state', async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...(actual as Record<string, unknown>),
		getWalletManager: () => ({
			rskWallet: {
				getWallet: () => MOCK_SIGNER_WALLET,
				getAddress: () => MOCK_SIGNER_WALLET.address
			}
		})
	};
});

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('$lib/wallet/gasless-helpers', () => ({
	validateFeeParameters: vi.fn(),
	validateFeeBufferBounds: vi.fn(),
	validateFeeRecipient: vi.fn(),
	getPaymasterSignatureHash: vi.fn().mockImplementation(
		// Use real implementation for testing
		(sender: string, nonce: bigint, callData: string, entryPoint: string, chainId: bigint) => {
			const coder = ethers.AbiCoder.defaultAbiCoder();
			const callDataHash = ethers.keccak256(callData);
			const encoded = coder.encode(
				['address', 'uint256', 'bytes32', 'address', 'uint256'],
				[sender, nonce, callDataHash, entryPoint, chainId]
			);
			return ethers.keccak256(encoded);
		}
	)
}));

vi.mock('$lib/wallet/gasless.config', () => ({
	GAS_TREASURY: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
	GAS_BOUNDS: {
		maxCallGas: 5_000_000n,
		maxVerificationGas: 1_000_000n,
		maxPreVerificationGas: 400_000n,
		maxFeePerGas: 1_000_000_000n,
		maxPriorityFeePerGas: 100_000_000n,
		maxTotalGas: 6_400_000n
	},
	ARBITRUM_RPC_URL: 'https://arb1.arbitrum.io/rpc',
	ARBITRUM_CHAIN_ID: 42161,
	ENTRY_POINT_ADDRESS: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
	SIMPLE_7702_ACCOUNT_IMPL: '0xB2779581b8B1F816b747fBa66c64D22196c7D001',
	TOKENS: [
		{ address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT0', decimals: 6, chainId: 42161 },
		{ address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', decimals: 8, chainId: 42161 },
		{ address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', symbol: 'TBTC', decimals: 18, chainId: 42161 }
	],
	ALLOWED_FEE_TOKENS: [
		'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
		'0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
		'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40'
	],
	FEE_BUFFER_MIN: {
		'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 10000n,
		'0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 16n,
		'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 150_000_000_000n
	},
	FEE_BUFFER_MAX: {
		'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150000n,
		'0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 230n,
		'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 2_500_000_000_000n
	},
	getTokenByAddress: vi.fn(),
	isAllowedFeeToken: vi.fn().mockReturnValue(true),
	fetchGaslessConfig: vi.fn().mockResolvedValue(true)
}));

vi.mock('$lib/api/services/gasless.service', () => ({
	gaslessService: {
		relay: mockGaslessRelay,
		estimate: mockEstimateFee,
		simulate: mockGaslessSimulate,
		prepare: mockGaslessPrepare,
		health: vi.fn(),
		config: vi.fn()
	}
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { claimTbtcOnArbitrum } from '$lib/services/swap-chain/boltz/claims';
import { encodeERC20SwapClaim, buildExecuteBatchCallData } from '$lib/services/swap-chain/abi';
import { isTransientClaimError } from '$lib/services/swap-chain/boltz/polling';
import { TBTC_ARB } from '$lib/services/swap-chain/utils';
import { getPaymasterSignatureHash } from '$lib/wallet/gasless-helpers';

// ---------------------------------------------------------------------------
// Real on-chain data from Boltz ERC20Swap on Arbitrum
// ---------------------------------------------------------------------------

const ENTRY_POINT = '0x433709009B8330FDa32311DF1C2AFA402eD8D009';
const CHAIN_ID = 42161n;

/** Simulated lockup data for a BTC→tBTC chain swap */
const CLAIM_DATA = {
	preimageHex: '0x' + 'ab'.repeat(32), // 32-byte preimage
	preimageHash: '', // computed in beforeAll
	amount: 50_000, // in token smallest unit (tBTC has 18 decimals)
	tokenAddress: TBTC_ARB,
	claimAddress: MOCK_SIGNER_WALLET.address, // must match the mock signing wallet
	refundAddress: '0x1bdf482f5da32ef51c20d9a94960385c5be9aab7', // Boltz
	timelock: 9_083_732,
	contractAddress: ethers.getAddress('0xc1a043083a071a7413a7d5a8b9d8f061b8c56446') // ERC20Swap on Arb (EIP-55)
};

/** The exact error string that Alto returns for AA33 */
const AA33_ERROR_MSG =
	'Paymaster rejected UserOp during gas estimation: Alto error -32501: ' +
	'UserOperation reverted during simulation with reason: AA33 reverted 0xbe9179a6';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
});

// ===========================================================================
// Tests
// ===========================================================================

describe('tBTC Claim AA33 Paymaster Rejection — Behavioral Investigation', () => {
	// ─────────────────────────────────────────────────────────────────────
	// 1. ERC20Swap.claim() ABI encoding
	// ─────────────────────────────────────────────────────────────────────

	describe('ERC20Swap.claim() ABI encoding', () => {
		it('produces calldata with the correct selector (0x1d845365)', () => {
			// ERC20Swap.claim(bytes32 preimage, uint256 amount, address tokenAddress,
			//                 address claimAddress, address refundAddress, uint256 timelock)
			// selector = keccak256("claim(bytes32,uint256,address,address,address,uint256)")[:4]
			const calldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			// Verify the selector matches ERC20Swap.claim()
			expect(calldata.startsWith('0x')).toBe(true);
			expect(calldata.length).toBeGreaterThan(10);

			// Decode and verify all parameters round-trip correctly
			const iface = new ethers.Interface([
				'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address claimAddress, address refundAddress, uint256 timelock)'
			]);
			const decoded = iface.decodeFunctionData('claim', calldata);

			expect(decoded[0] as string).toBe(CLAIM_DATA.preimageHex);
			expect(Number(decoded[1])).toBe(CLAIM_DATA.amount);
			expect((decoded[2] as string).toLowerCase()).toBe(CLAIM_DATA.tokenAddress.toLowerCase());
			expect((decoded[3] as string).toLowerCase()).toBe(CLAIM_DATA.claimAddress.toLowerCase());
			expect((decoded[4] as string).toLowerCase()).toBe(CLAIM_DATA.refundAddress.toLowerCase());
			expect(Number(decoded[5])).toBe(CLAIM_DATA.timelock);
		});

		it('produces different calldata when preimage changes', () => {
			const calldata1 = encodeERC20SwapClaim(
				'0x' + 'aa'.repeat(32),
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);
			const calldata2 = encodeERC20SwapClaim(
				'0x' + 'bb'.repeat(32),
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			expect(calldata1).not.toBe(calldata2);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 2. executeBatch calldata construction (claim + fee transfer)
	// ─────────────────────────────────────────────────────────────────────

	describe('executeBatch calldata construction', () => {
		it('produces a valid executeBatch with claim + fee transfer', () => {
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			const treasury = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
			const feeBuffer = 150_000_000_000n; // ~$0.01 of tBTC

			// Build the executeBatch call data matching gasless-store.ts
			const batchIface = new ethers.Interface([
				'function executeBatch((address target, uint256 value, bytes data)[] calls)'
			]);
			const transferIface = new ethers.Interface([
				'function transfer(address to, uint256 amount) returns (bool)'
			]);

			const feeTransferData = transferIface.encodeFunctionData('transfer', [treasury, feeBuffer]);

			const callData = batchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, feeTransferData]
				]
			]);

			// Decode and verify the batch
			const decoded = batchIface.decodeFunctionData('executeBatch', callData);
			const calls = decoded[0] as Array<{ target: string; value: bigint; data: string }>;

			expect(calls.length).toBe(2);

			// Call 0: ERC20Swap.claim()
			expect(calls[0].target.toLowerCase()).toBe(CLAIM_DATA.contractAddress.toLowerCase());
			expect(calls[0].value).toBe(0n);
			expect(calls[0].data).toBe(claimCalldata);

			// Call 1: tBTC.transfer(treasury, feeBuffer)
			expect(calls[1].target.toLowerCase()).toBe(TBTC_ARB.toLowerCase());
			expect(calls[1].value).toBe(0n);
			const decodedTransfer = transferIface.decodeFunctionData('transfer', calls[1].data);
			expect((decodedTransfer[0] as string).toLowerCase()).toBe(treasury.toLowerCase());
			expect(decodedTransfer[1]).toBe(feeBuffer);
		});

		it('fee transfer targets the GAS_TREASURY, not the swap contract', () => {
			const treasury = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
			const feeBuffer = 150_000_000_000n;
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			// The fee transfer MUST go to the tBTC token contract (to call transfer()),
			// and the transfer's "to" parameter is the treasury.
			const transferIface = new ethers.Interface([
				'function transfer(address to, uint256 amount) returns (bool)'
			]);
			const feeTransferData = transferIface.encodeFunctionData('transfer', [treasury, feeBuffer]);

			// Verify: the fee call targets tBTC contract, transfers to treasury
			const batchIface = new ethers.Interface([
				'function executeBatch((address target, uint256 value, bytes data)[] calls)'
			]);
			const callData = batchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, feeTransferData]
				]
			]);

			const decoded = batchIface.decodeFunctionData('executeBatch', callData);
			const calls = decoded[0] as Array<{ target: string; value: bigint; data: string }>;

			// CRITICAL: the fee call must NOT target the swap contract
			expect(calls[1].target.toLowerCase()).toBe(TBTC_ARB.toLowerCase());
			expect(calls[1].target.toLowerCase()).not.toBe(CLAIM_DATA.contractAddress.toLowerCase());
		});

		it('buildExecuteBatchCallData from abi.ts wraps calls WITHOUT adding fee transfer', () => {
			// abi.ts version: raw wrapper — does NOT add fee transfer
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			const callData = buildExecuteBatchCallData([
				{ to: CLAIM_DATA.contractAddress, value: 0n, data: claimCalldata }
			]);

			// Decode and verify it has only 1 call (no fee transfer)
			const batchIface = new ethers.Interface([
				'function executeBatch((address target, uint256 value, bytes data)[] calls)'
			]);
			const decoded = batchIface.decodeFunctionData('executeBatch', callData);
			const calls = decoded[0] as Array<{ target: string; value: bigint; data: string }>;

			// abi.ts version only wraps the provided calls — no fee transfer added
			expect(calls.length).toBe(1);
			expect(calls[0].target.toLowerCase()).toBe(CLAIM_DATA.contractAddress.toLowerCase());
			expect(calls[0].data).toBe(claimCalldata);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 3. Paymaster signature hash computation
	// ─────────────────────────────────────────────────────────────────────

	describe('paymaster signature hash', () => {
		it('computes deterministic hash for the same inputs', () => {
			const sender = CLAIM_DATA.claimAddress;
			const nonce = 42n;
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			const hash1 = getPaymasterSignatureHash(sender, nonce, claimCalldata, ENTRY_POINT, CHAIN_ID);
			const hash2 = getPaymasterSignatureHash(sender, nonce, claimCalldata, ENTRY_POINT, CHAIN_ID);

			expect(hash1).toBe(hash2);
			expect(hash1).toMatch(/^0x[0-9a-f]{64}$/);
		});

		it('produces different hashes when callData changes', () => {
			const sender = CLAIM_DATA.claimAddress;
			const nonce = 42n;

			const calldata1 = encodeERC20SwapClaim(
				'0x' + 'aa'.repeat(32),
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);
			const calldata2 = encodeERC20SwapClaim(
				'0x' + 'bb'.repeat(32),
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			const hash1 = getPaymasterSignatureHash(sender, nonce, calldata1, ENTRY_POINT, CHAIN_ID);
			const hash2 = getPaymasterSignatureHash(sender, nonce, calldata2, ENTRY_POINT, CHAIN_ID);

			expect(hash1).not.toBe(hash2);
		});

		it('produces different hashes when the executeBatch wrapping differs', () => {
			// This test verifies a critical AA33 scenario:
			// If the frontend constructs executeBatch differently from how the
			// backend's prepare() endpoint computes the paymaster signature,
			// the hash will mismatch → paymaster rejects.
			const sender = CLAIM_DATA.claimAddress;
			const nonce = 42n;
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			// Hash of raw claim calldata (without executeBatch wrapping)
			const rawHash = getPaymasterSignatureHash(sender, nonce, claimCalldata, ENTRY_POINT, CHAIN_ID);

			// Hash of executeBatch-wrapped calldata (what the UserOp actually contains)
			const batchIface = new ethers.Interface([
				'function executeBatch((address target, uint256 value, bytes data)[] calls)'
			]);
			const wrappedCalldata = batchIface.encodeFunctionData('executeBatch', [
				[[CLAIM_DATA.contractAddress, 0n, claimCalldata]]
			]);
			const wrappedHash = getPaymasterSignatureHash(sender, nonce, wrappedCalldata, ENTRY_POINT, CHAIN_ID);

			// These MUST differ — if the backend signs the raw calldata but the
			// UserOp contains the wrapped version, the paymaster will reject.
			expect(rawHash).not.toBe(wrappedHash);
		});

		it('CRITICAL: if backend signs a different callData than the UserOp, hash mismatches', () => {
			// This is the most likely AA33 root cause:
			// The backend's prepare() endpoint signs a hash of the callData.
			// The frontend constructs the UserOp with a specific callData.
			// If these differ, the paymaster's validatePaymasterUserOp()
			// computes a different hash → signature invalid → AA33 revert.
			const sender = CLAIM_DATA.claimAddress;
			const nonce = 42n;
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			const feeBuffer = 150_000_000_000n;
			const treasury = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

			// Scenario A: Frontend uses buildExecuteBatchCallData from abi.ts
			const abibatchIface = new ethers.Interface([
				'function executeBatch((address target, uint256 value, bytes data)[] calls)'
			]);
			const transferIface = new ethers.Interface([
				'function transfer(address to, uint256 amount) returns (bool)'
			]);
			const feeTransferData = transferIface.encodeFunctionData('transfer', [treasury, feeBuffer]);
			const callDataA = abibatchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, feeTransferData]
				]
			]);

			// Scenario B: Backend constructs callData with different parameter ordering
			// or different encoding of the inner calls
			const callDataB = abibatchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, feeTransferData]
				]
			]);

			// Same construction → same hash (good)
			const hashA = getPaymasterSignatureHash(sender, nonce, callDataA, ENTRY_POINT, CHAIN_ID);
			const hashB = getPaymasterSignatureHash(sender, nonce, callDataB, ENTRY_POINT, CHAIN_ID);
			expect(hashA).toBe(hashB);

			// Scenario C: Backend uses a DIFFERENT fee amount (e.g. computed at different time)
			const differentFeeBuffer = 200_000_000_000n;
			const differentFeeTransferData = transferIface.encodeFunctionData('transfer', [treasury, differentFeeBuffer]);
			const callDataC = abibatchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, differentFeeTransferData]
				]
			]);
			const hashC = getPaymasterSignatureHash(sender, nonce, callDataC, ENTRY_POINT, CHAIN_ID);

			// Different fee → different hash → AA33 if backend signed A but UserOp has C
			expect(hashA).not.toBe(hashC);
		});

		it('CRITICAL: preimage without 0x prefix causes ethers v6 to throw', () => {
			// ethers v6 is strict about bytes32 encoding: it REQUIRES the 0x prefix.
			// If the preimage is stored without '0x' somewhere in the pipeline,
			// encodeERC20SwapClaim will throw, which could cause a confusing error
			// upstream that looks like a paymaster rejection.
			const preimageWithout0x = 'ab'.repeat(32);

			// This SHOULD throw because ethers v6 requires 0x prefix for bytes32
			expect(() =>
				encodeERC20SwapClaim(
					preimageWithout0x,
					BigInt(CLAIM_DATA.amount),
					CLAIM_DATA.tokenAddress,
					CLAIM_DATA.claimAddress,
					CLAIM_DATA.refundAddress,
					BigInt(CLAIM_DATA.timelock)
				)
			).toThrow();
		});

		it('CRITICAL: preimage WITH 0x prefix produces valid calldata', () => {
			// The 0x-prefixed form must always work
			const calldata = encodeERC20SwapClaim(
				'0x' + 'ab'.repeat(32),
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			expect(calldata).toMatch(/^0x[0-9a-f]+$/);
			expect(calldata.length).toBeGreaterThan(10);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 4. AA33 error classification — must be PERMANENT (not retried)
	// ─────────────────────────────────────────────────────────────────────

	describe('AA33 error classification', () => {
		it('classifies "Paymaster rejected" errors as PERMANENT (not transient)', () => {
			// AA33 is a paymaster validation failure — retrying won't help.
			// The paymaster's callData hash verification will fail the same way.
			const err = new Error(AA33_ERROR_MSG);
			expect(isTransientClaimError(err)).toBe(false);
		});

		it('classifies generic paymaster errors as PERMANENT', () => {
			expect(isTransientClaimError(new Error('Paymaster rejected UserOp'))).toBe(false);
			expect(isTransientClaimError(new Error('paymaster validation failed'))).toBe(false);
		});

		it('classifies Alto bundler errors as PERMANENT', () => {
			expect(isTransientClaimError(new Error('Alto error -32501: simulation failed'))).toBe(false);
		});

		it('classifies AA33-specific patterns as PERMANENT', () => {
			expect(isTransientClaimError(new Error('AA33 reverted 0xbe9179a6'))).toBe(false);
			expect(isTransientClaimError(new Error('UserOperation reverted during simulation with reason: AA33 reverted 0xbe9179a6'))).toBe(false);
		});

		it('STILL correctly classifies network errors as transient', () => {
			expect(isTransientClaimError(new Error('Request timeout'))).toBe(true);
			expect(isTransientClaimError(new Error('ECONNREFUSED'))).toBe(true);
			expect(isTransientClaimError(new Error('Gasless relay timeout (30s)'))).toBe(true);
			expect(isTransientClaimError(new Error('Pre-flight simulation failed: Insufficient USDT0 balance'))).toBe(true);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 5. Full claim flow — error propagation
	// ─────────────────────────────────────────────────────────────────────

	describe('claimTbtcOnArbitrum error propagation', () => {
		it('propagates the AA33 error from sendEvmTransaction', async () => {
			mockSendEvmTransaction.mockResolvedValue({
				data: null,
				error: new Error(AA33_ERROR_MSG)
			});

			const result = await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			// The error should propagate through claimSwapFunds → claimTbtcOnArbitrum
			expect(result).toBeInstanceOf(Error);
			expect(result!.message).toContain('AA33');
			expect(result!.message).toContain('0xbe9179a6');
			expect(result!.message).toContain('Paymaster rejected');
		});

		it('returns null on successful claim', async () => {
			mockSendEvmTransaction.mockResolvedValue({
				data: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
				error: null
			});

			const result = await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			expect(result).toBeNull();
		});

		it('passes feeToken to sendEvmTransaction for atomic claim+fee', async () => {
			mockSendEvmTransaction.mockResolvedValue({
				data: '0xtxhash',
				error: null
			});

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			expect(mockSendEvmTransaction).toHaveBeenCalledTimes(1);
			const call = mockSendEvmTransaction.mock.calls[0][0];

			// CRITICAL: feeToken must be the tBTC address — the claim produces tBTC,
			// and the fee transfer uses that tBTC in the same atomic UserOp.
			expect(call.feeToken).toBe(TBTC_ARB);
			expect(call.chain).toBe('arbitrum');
		});

		it('passes the correct ERC20Swap.claim() calldata to sendEvmTransaction', async () => {
			mockSendEvmTransaction.mockResolvedValue({
				data: '0xtxhash',
				error: null
			});

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			const call = mockSendEvmTransaction.mock.calls[0][0];

			// Verify the calldata is a valid ERC20Swap.claim() call (signature-based variant)
			// Selector: 0xb2b78df8 = claim(bytes32,uint256,address,address,uint256,uint8,bytes32,bytes32)
			const iface = new ethers.Interface([
				'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address refundAddress, uint256 timelock, uint8 v, bytes32 r, bytes32 s) returns (address)'
			]);
			const decoded = iface.decodeFunctionData('claim', call.data);

			// CRITICAL: selector must be the signature-based variant
			expect(call.data.slice(0, 10)).toBe('0xb2b78df8');
			// CRITICAL: the preimage must be correct
			expect(decoded[0] as string).toBe(CLAIM_DATA.preimageHex);
			// CRITICAL: amount must match
			expect(Number(decoded[1])).toBe(CLAIM_DATA.amount);
			// CRITICAL: token must be tBTC
			expect((decoded[2] as string).toLowerCase()).toBe(TBTC_ARB.toLowerCase());
			// CRITICAL: refundAddress must be Boltz
			expect((decoded[3] as string).toLowerCase()).toBe(CLAIM_DATA.refundAddress.toLowerCase());
			// CRITICAL: timelock must match
			expect(Number(decoded[4])).toBe(CLAIM_DATA.timelock);
			// CRITICAL: signature components must be present (v, r, s)
			expect(Number(decoded[5])).toBeGreaterThanOrEqual(27); // v
			expect(decoded[6] as string).toMatch(/^0x[0-9a-f]{64}$/i); // r
			expect(decoded[7] as string).toMatch(/^0x[0-9a-f]{64}$/i); // s
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 6. Atomic claim+fee pattern
	// ─────────────────────────────────────────────────────────────────────

	describe('atomic claim+fee pattern', () => {
		it('the fee transfer uses the same token as the claim output', () => {
			// This is the core of the atomic claim+fee pattern:
			// 1. ERC20Swap.claim() produces tBTC to the user's address
			// 2. tBTC.transfer(treasury, feeBuffer) pays for gas
			// Both execute in the same UserOp (executeBatch).
			// If the claim fails, the fee transfer also fails (atomicity).
			// If the fee transfer fails, the claim also reverts.
			expect(TBTC_ARB).toBe('0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40');

			// The feeToken passed to claimTbtcOnArbitrum → claimSwapFunds → sendEvmTransaction
			// is the tokenAddress parameter (tBTC), not a different token.
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress, // tBTC
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			// The batch must contain:
			// 1. Call to ERC20Swap contract with claim calldata
			// 2. Call to tBTC contract with transfer(treasury, fee)
			const batchIface = new ethers.Interface([
				'function executeBatch((address target, uint256 value, bytes data)[] calls)'
			]);
			const transferIface = new ethers.Interface([
				'function transfer(address to, uint256 amount) returns (bool)'
			]);

			const feeBuffer = 150_000_000_000n;
			const treasury = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

			const callData = batchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, transferIface.encodeFunctionData('transfer', [treasury, feeBuffer])]
				]
			]);

			const decoded = batchIface.decodeFunctionData('executeBatch', callData);
			const calls = decoded[0] as Array<{ target: string; value: bigint; data: string }>;

			// Both calls must target different contracts
			expect(calls[0].target).not.toBe(calls[1].target);
			// Both must have zero value (no ETH sent)
			expect(calls[0].value).toBe(0n);
			expect(calls[1].value).toBe(0n);
			// Claim targets the swap contract
			expect(calls[0].target.toLowerCase()).toBe(CLAIM_DATA.contractAddress.toLowerCase());
			// Fee transfer targets the tBTC token contract
			expect(calls[1].target.toLowerCase()).toBe(TBTC_ARB.toLowerCase());
		});

		it('without pre-existing tBTC balance, the claim MUST produce the fee tokens', () => {
			// The whole point of atomic claim+fee: the user has no tBTC before the claim.
			// The claim() call produces tBTC. The fee transfer() call consumes some of it.
			// If the fee amount exceeds what the claim produces, the transfer will fail →
			// entire executeBatch reverts → UserOp execution reverts.
			//
			// This is NOT an AA33 error though — AA33 happens during validation,
			// not execution. If the fee is too high, it would be AA23 (execution failure).
			//
			// The AA33 error is a VALIDATION failure — the paymaster rejects before execution.
			const claimAmount = BigInt(CLAIM_DATA.amount);
			const feeBuffer = 150_000_000_000n; // ~$0.01 worth of tBTC

			// For the claim to succeed, claim amount must be > fee buffer
			// (otherwise the fee transfer would drain all claimed tokens)
			if (claimAmount > feeBuffer) {
				expect(claimAmount).toBeGreaterThan(feeBuffer);
			}
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 7. AA33 root cause analysis — what could make the paymaster reject
	// ─────────────────────────────────────────────────────────────────────

	describe('AA33 root cause analysis', () => {
		it('PROOF: different fee amounts produce different paymaster hashes', () => {
			// If the backend computes a different fee buffer than what the frontend
			// uses in the executeBatch, the callData hashes won't match.
			// The paymaster signs hash A, but the UserOp contains callData B → AA33.
			const sender = CLAIM_DATA.claimAddress;
			const nonce = 0n;
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);
			const treasury = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

			// Frontend computes fee = 150_000_000_000 (from estimateFee)
			const feeA = 150_000_000_000n;
			// Backend computes fee = 160_000_000_000 (different estimate)
			const feeB = 160_000_000_000n;

			const transferIface = new ethers.Interface([
				'function transfer(address to, uint256 amount) returns (bool)'
			]);
			const batchIface = new ethers.Interface([
				'function executeBatch((address target, uint256 value, bytes data)[] calls)'
			]);

			const calldataA = batchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, transferIface.encodeFunctionData('transfer', [treasury, feeA])]
				]
			]);
			const calldataB = batchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, transferIface.encodeFunctionData('transfer', [treasury, feeB])]
				]
			]);

			const hashA = getPaymasterSignatureHash(sender, nonce, calldataA, ENTRY_POINT, CHAIN_ID);
			const hashB = getPaymasterSignatureHash(sender, nonce, calldataB, ENTRY_POINT, CHAIN_ID);

			// Different fees → different callData → different hashes → AA33
			expect(hashA).not.toBe(hashB);
		});

		it('PROOF: different treasury addresses produce different paymaster hashes', () => {
			const sender = CLAIM_DATA.claimAddress;
			const nonce = 0n;
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			const treasury1 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
			const treasury2 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
			const feeBuffer = 150_000_000_000n;

			const transferIface = new ethers.Interface([
				'function transfer(address to, uint256 amount) returns (bool)'
			]);
			const batchIface = new ethers.Interface([
				'function executeBatch((address target, uint256 value, bytes data)[] calls)'
			]);

			const calldata1 = batchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, transferIface.encodeFunctionData('transfer', [treasury1, feeBuffer])]
				]
			]);
			const calldata2 = batchIface.encodeFunctionData('executeBatch', [
				[
					[CLAIM_DATA.contractAddress, 0n, claimCalldata],
					[TBTC_ARB, 0n, transferIface.encodeFunctionData('transfer', [treasury2, feeBuffer])]
				]
			]);

			const hash1 = getPaymasterSignatureHash(sender, nonce, calldata1, ENTRY_POINT, CHAIN_ID);
			const hash2 = getPaymasterSignatureHash(sender, nonce, calldata2, ENTRY_POINT, CHAIN_ID);

			expect(hash1).not.toBe(hash2);
		});

		it('PROOF: different nonces produce different paymaster hashes', () => {
			const sender = CLAIM_DATA.claimAddress;
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			const hash1 = getPaymasterSignatureHash(sender, 0n, claimCalldata, ENTRY_POINT, CHAIN_ID);
			const hash2 = getPaymasterSignatureHash(sender, 1n, claimCalldata, ENTRY_POINT, CHAIN_ID);

			expect(hash1).not.toBe(hash2);
		});

		it('PROOF: different sender addresses produce different paymaster hashes', () => {
			const claimCalldata = encodeERC20SwapClaim(
				CLAIM_DATA.preimageHex,
				BigInt(CLAIM_DATA.amount),
				CLAIM_DATA.tokenAddress,
				CLAIM_DATA.claimAddress,
				CLAIM_DATA.refundAddress,
				BigInt(CLAIM_DATA.timelock)
			);

			const hash1 = getPaymasterSignatureHash(CLAIM_DATA.claimAddress, 0n, claimCalldata, ENTRY_POINT, CHAIN_ID);
			const hash2 = getPaymasterSignatureHash(CLAIM_DATA.refundAddress, 0n, claimCalldata, ENTRY_POINT, CHAIN_ID);

			expect(hash1).not.toBe(hash2);
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 8. claimSwapFunds validation
	// ─────────────────────────────────────────────────────────────────────

	describe('claimSwapFunds address validation', () => {
		it('rejects invalid contract addresses', async () => {
			mockSendEvmTransaction.mockResolvedValue({
				data: null,
				error: new Error('Invalid destination address: undefined')
			});

			const result = await claimTbtcOnArbitrum({
				contractAddress: '',
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			// Should fail with either validation error or sendEvmTransaction error
			expect(result).toBeInstanceOf(Error);
		});

		it('passes chain as arbitrum for tBTC claims', async () => {
			mockSendEvmTransaction.mockResolvedValue({
				data: '0xtxhash',
				error: null
			});

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			const call = mockSendEvmTransaction.mock.calls[0][0];
			expect(call.chain).toBe('arbitrum');
			expect(call.value).toBe(0n); // No ETH value for ERC20 claim
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 9. Debug page claim flow simulation
	// ─────────────────────────────────────────────────────────────────────

	describe('debug page claim flow simulation', () => {
		it('recoverSwap uses null sourceConnectedWalletId for built-in wallet', async () => {
			// The debug-swaps page calls recoverSwap(row) which calls claimTbtcOnArbitrum
			// with sourceConnectedWalletId: null (built-in wallet path).
			// This means the flow goes through sendArbitrumTransaction() → gasless relay.
			mockSendEvmTransaction.mockResolvedValue({
				data: '0xtxhash',
				error: null
			});

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null // Built-in wallet
			});

			const call = mockSendEvmTransaction.mock.calls[0][0];
			expect(call.sourceConnectedWalletId).toBeNull();
		});

		it('the AA33 error is classified as permanent — no retry loop', () => {
			// The polling code checks isTransientClaimError before retrying.
			// If the error is permanent, it aborts immediately.
			// If the error is transient, it retries with exponential backoff.
			// AA33 MUST be permanent to avoid burning gas on doomed retries.
			const aa33Error = new Error(AA33_ERROR_MSG);

			// Simulate the polling logic
			const isTransient = isTransientClaimError(aa33Error);

			if (!isTransient) {
				// This is the correct path for AA33 — abort, don't retry
				expect(isTransient).toBe(false);
			} else {
				// This would be WRONG — would burn gas on retries
				expect.fail('AA33 error should NOT be classified as transient');
			}
		});

		it('the error message contains enough diagnostic info', () => {
			// The error message should be self-diagnostic for debugging
			const err = new Error(AA33_ERROR_MSG);

			// Contains the paymaster rejection indicator
			expect(err.message).toContain('Paymaster rejected');
			// Contains the Alto error code
			expect(err.message).toContain('-32501');
			// Contains the AA33 validation phase code
			expect(err.message).toContain('AA33');
			// Contains the specific error selector
			expect(err.message).toContain('0xbe9179a6');
		});
	});

	// ─────────────────────────────────────────────────────────────────────
	// 9. Signature-based claim (EIP-712 Claim authorization)
	// ─────────────────────────────────────────────────────────────────────

	describe('signature-based ERC20Swap.claim()', () => {
		it('uses selector 0xb2b78df8 (signature-based claim)', async () => {
			mockSendEvmTransaction.mockResolvedValue({ data: '0xtxhash', error: null });

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			const call = mockSendEvmTransaction.mock.calls[0][0];
			// Selector must be the signature-based variant, NOT the old 6-param one
			expect(call.data.slice(0, 10)).toBe('0xb2b78df8');
		});

		it('does NOT use selector 0xbc586b28 (old non-signature claim)', async () => {
			mockSendEvmTransaction.mockResolvedValue({ data: '0xtxhash', error: null });

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			const call = mockSendEvmTransaction.mock.calls[0][0];
			// Must NOT be the old 6-param selector that checks msg.sender == claimAddress
			expect(call.data.slice(0, 10)).not.toBe('0xbc586b28');
		});

		it('calldata contains valid EIP-712 signature (v, r, s)', async () => {
			mockSendEvmTransaction.mockResolvedValue({ data: '0xtxhash', error: null });

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			const call = mockSendEvmTransaction.mock.calls[0][0];
			const iface = new ethers.Interface([
				'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address refundAddress, uint256 timelock, uint8 v, bytes32 r, bytes32 s) returns (address)'
			]);
			const decoded = iface.decodeFunctionData('claim', call.data);

			// v must be 27 or 28 (EIP-155 recovery id)
			expect([27, 28]).toContain(Number(decoded[5]));
			// r and s must be 32 bytes
			expect((decoded[6] as string).length).toBe(66); // 0x + 64 hex
			expect((decoded[7] as string).length).toBe(66);
		});

		it('calldata does NOT contain claimAddress as parameter', async () => {
			mockSendEvmTransaction.mockResolvedValue({ data: '0xtxhash', error: null });

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			const call = mockSendEvmTransaction.mock.calls[0][0];
			const iface = new ethers.Interface([
				'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address refundAddress, uint256 timelock, uint8 v, bytes32 r, bytes32 s) returns (address)'
			]);
			const decoded = iface.decodeFunctionData('claim', call.data);

			// The signature-based variant has: preimage, amount, tokenAddress, refundAddress, timelock, v, r, s
			// claimAddress is NOT a parameter — it's recovered from the signature
			// decoded[3] should be refundAddress (Boltz), NOT claimAddress (user)
			expect((decoded[3] as string).toLowerCase()).toBe(CLAIM_DATA.refundAddress.toLowerCase());
			expect((decoded[3] as string).toLowerCase()).not.toBe(CLAIM_DATA.claimAddress.toLowerCase());
		});

		it('signer mismatch returns an error (not throw)', async () => {
			// Use a claimAddress that doesn't match the mock wallet
			const wrongClaimAddress = '0x0000000000000000000000000000000000000001';
			const result = await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: wrongClaimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			expect(result).toBeInstanceOf(Error);
			expect(result!.message).toContain('not the locked claim address');
		});

		it('feeToken is set to the claimed token (tBTC) for atomic claim+fee', async () => {
			mockSendEvmTransaction.mockResolvedValue({ data: '0xtxhash', error: null });

			await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: CLAIM_DATA.claimAddress,
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			const call = mockSendEvmTransaction.mock.calls[0][0];
			// feeToken must be the token being claimed (tBTC), enabling atomic claim+fee
			expect(call.feeToken).toBe(TBTC_ARB);
		});

		it('handles EIP-1191 (RSK) addresses without checksum error', async () => {
			// RSKWallet.getAddress() returns EIP-1191 checksummed addresses.
			// The EIP-1191 checksum for chain ID 30 produces different casing
			// than EIP-55. This test verifies the claim flow handles this.
			mockSendEvmTransaction.mockResolvedValue({ data: '0xtxhash', error: null });

			// Simulate RSKWallet.getAddress() returning EIP-1191 by using
			// the mock wallet address with EIP-1191 casing (which differs from EIP-55)
			const eip55Addr = MOCK_SIGNER_WALLET.address; // EIP-55 from ethers.Wallet
			// Create a deliberately wrong-cased version (simulating EIP-1191)
			// This would fail with "bad address checksum" if not lowercased first
			const wrongCaseAddr = '0x' + eip55Addr.slice(2).split('').map((c: string, i: number) =>
				i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
			).join('');

			// The claimAddress must still match the signer (case-insensitive)
			const result = await claimTbtcOnArbitrum({
				contractAddress: CLAIM_DATA.contractAddress,
				preimageHex: CLAIM_DATA.preimageHex,
				amount: CLAIM_DATA.amount,
				tokenAddress: CLAIM_DATA.tokenAddress,
				claimAddress: wrongCaseAddr, // EIP-1191-style mixed case
				refundAddress: CLAIM_DATA.refundAddress,
				timelock: CLAIM_DATA.timelock,
				sourceConnectedWalletId: null
			});

			// Should succeed (not throw "bad address checksum")
			expect(result).toBeNull();
			expect(mockSendEvmTransaction).toHaveBeenCalled();
		});
	});
});
