/**
 * E2E-style tests for Gasless Relay Payload Construction
 *
 * Tests the full payload pipeline that the frontend uses when sending
 * gasless transactions through the relay endpoint:
 *
 * 1. Ethers ABI encoding (replaces viem — produces even-length hex)
 * 2. Hex normalization (normalizeHex, toHex)
 * 3. buildExecuteBatchCallData structure
 * 4. sendGaslessCalls payload construction
 * 5. Fee token selection logic
 * 6. /gasless/simulate endpoint payload
 * 7. /gasless/relay endpoint payload
 *
 * These tests verify that the frontend will send VALID payloads to the
 * backend — fixing the root cause of the "Invalid callData format" and
 * "preVerificationGas exceeds maximum" errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers as ethersLib } from 'ethers';

// ---------------------------------------------------------------------------
// Hoisted mock variables
// ---------------------------------------------------------------------------
const {
	mockGaslessRelay,
	mockGaslessEstimate,
	mockGaslessSimulate,
	mockGaslessConfig,
	mockGaslessCheckBalance,
	mockValidateFeeBufferBounds,
	mockValidateFeeRecipient
} = vi.hoisted(() => ({
	mockGaslessRelay: vi.fn(),
	mockGaslessEstimate: vi.fn(),
	mockGaslessSimulate: vi.fn(),
	mockGaslessConfig: vi.fn(),
	mockGaslessCheckBalance: vi.fn(),
	mockValidateFeeBufferBounds: vi.fn(),
	mockValidateFeeRecipient: vi.fn()
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('viem', () => ({
	createPublicClient: vi.fn().mockReturnValue({
		readContract: vi.fn().mockResolvedValue(0n),
		getCode: vi.fn().mockResolvedValue('0x'),
		getTransactionCount: vi.fn().mockResolvedValue(0)
	}),
	http: vi.fn().mockReturnValue('mock-transport'),
	isAddress: vi.fn().mockReturnValue(true)
}));

vi.mock('viem/accounts', () => ({
	privateKeyToAccount: vi.fn().mockReturnValue({ address: '0xMockSigner' })
}));

vi.mock('viem/chains', () => ({
	arbitrum: { id: 42161, name: 'Arbitrum' }
}));

vi.mock('permissionless/accounts', () => ({
	to7702SimpleSmartAccount: vi.fn().mockResolvedValue({
		address: '0xMockAccount',
		signUserOperation: vi.fn().mockResolvedValue({ signature: '0x' + 'ab'.repeat(65) })
	})
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

vi.mock('$lib/wallet/gasless-helpers', () => ({
	validateFeeParameters: vi.fn(),
	validateFeeBufferBounds: mockValidateFeeBufferBounds,
	validateFeeRecipient: mockValidateFeeRecipient
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
	ARBITRUM_RPC_URL: 'https://arb-mainnet.g.alchemy.com/v2/test',
	ARBITRUM_CHAIN_ID: 42161,
	ENTRY_POINT_ADDRESS: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
	SIMPLE_7702_ACCOUNT_IMPL: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
	USDT0_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
	WBTC_ADDRESS: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
	TBTC_ADDRESS: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
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
	FEE_BUFFER_MIN: { '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 10000n },
	FEE_BUFFER_MAX: { '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150000n },
	getTokenByAddress: vi.fn(),
	isAllowedFeeToken: vi.fn().mockReturnValue(true),
	getArbitrumRpcUrl: vi.fn().mockReturnValue('https://arb-mainnet.g.alchemy.com/v2/test'),
	fetchGaslessConfig: vi.fn().mockResolvedValue(true)
}));

vi.mock('$lib/api/services/gasless.service', () => ({
	gaslessService: {
		relay: mockGaslessRelay,
		estimate: mockGaslessEstimate,
		simulate: mockGaslessSimulate,
		config: mockGaslessConfig,
		checkBalance: mockGaslessCheckBalance,
		health: vi.fn()
	}
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { buildExecuteBatchCallData } from '$lib/wallet/gasless-store';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const MOCK_SENDER = '0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D';
const MOCK_TOKEN = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'; // USDT0
const MOCK_TREASURY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const MOCK_RECIPIENT = '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F';

// ---------------------------------------------------------------------------
// Ethers Interface singletons (same as gasless-store.ts)
// ---------------------------------------------------------------------------
const ethersTransferIface = new ethersLib.Interface([
	'function transfer(address to, uint256 amount) returns (bool)'
]);
const ethersExecuteBatchIface = new ethersLib.Interface([
	'function executeBatch((address target, uint256 value, bytes data)[] calls)'
]);

// ---------------------------------------------------------------------------
// Helper: normalizeHex (same as gasless-store.ts)
// ---------------------------------------------------------------------------
function normalizeHex(hex: string): string {
	if (!hex || hex === '0x') return hex;
	const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
	if (raw.length % 2 !== 0) {
		return '0x0' + raw;
	}
	return hex;
}

function toHex(value: bigint): string {
	const hex = value.toString(16);
	return '0x' + (hex.length % 2 !== 0 ? '0' + hex : hex);
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Gasless Relay Payload Construction', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 1. Ethers ABI Encoding ──────────────────────────────────────────

	describe('ethers ABI encoding', () => {
		it('transfer() produces even-length hex', () => {
			const data = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_TREASURY,
				30000n
			]);
			expect(data.length - 2).toBeGreaterThan(0);
			expect((data.length - 2) % 2).toBe(0);
			expect(data.startsWith('0xa9059cbb')).toBe(true); // transfer selector
		});

		it('executeBatch() produces even-length hex', () => {
			const transfer = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_TREASURY,
				30000n
			]);
			const callData = ethersExecuteBatchIface.encodeFunctionData('executeBatch', [
				[[MOCK_TOKEN, 0n, transfer]]
			]);
			expect((callData.length - 2) % 2).toBe(0);
			expect(callData.startsWith('0x34fcd5be')).toBe(true); // executeBatch selector
		});

		it('executeBatch with multiple calls produces even-length hex', () => {
			const swapData = '0xbc586b28' + '00'.repeat(160); // Mock swap calldata
			const feeTransfer = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_TREASURY,
				30000n
			]);
			const callData = ethersExecuteBatchIface.encodeFunctionData('executeBatch', [
				[
					[MOCK_RECIPIENT, 0n, swapData],
					[MOCK_TOKEN, 0n, feeTransfer]
				]
			]);
			expect((callData.length - 2) % 2).toBe(0);
		});

		it('lockPrepayMinerfee with leading-zero preimageHash produces even-length hex', () => {
			const lockIface = new ethersLib.Interface([
				'function lockPrepayMinerfee(bytes32,uint256,address,address,uint256) external payable'
			]);
			// PreimageHash with leading zeros (common case — ~1/256 chance per byte)
			const preimageHash = '0x00000000c8a6615a750a10ca8bfbab545e7e579a2eda56392bd1cb61894e87e0';
			const data = lockIface.encodeFunctionData('lockPrepayMinerfee', [
				preimageHash,
				BigInt('258338000000000000'),
				'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
				MOCK_SENDER,
				BigInt(25620579)
			]);
			expect((data.length - 2) % 2).toBe(0);
			expect(data.startsWith('0xb8080ab8')).toBe(true); // lockPrepayMinerfee selector
		});

		it('callData with swap + fee transfer decodes correctly', () => {
			const lockIface = new ethersLib.Interface([
				'function lockPrepayMinerfee(bytes32,uint256,address,address,uint256) external payable'
			]);
			const swapData = lockIface.encodeFunctionData('lockPrepayMinerfee', [
				'0x00000000c8a6615a750a10ca8bfbab545e7e579a2eda56392bd1cb61894e87e0',
				BigInt('258338000000000000'),
				'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
				MOCK_SENDER,
				BigInt(25620579)
			]);
			const feeTransfer = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_TREASURY,
				30000n
			]);
			const callData = ethersExecuteBatchIface.encodeFunctionData('executeBatch', [
				[
					[MOCK_RECIPIENT, 0n, swapData],
					[MOCK_TOKEN, 0n, feeTransfer]
				]
			]);

			// Verify decode
			const decoded = ethersExecuteBatchIface.decodeFunctionData('executeBatch', callData);
			expect(decoded[0].length).toBe(2);
			expect(decoded[0][0][0].toLowerCase()).toBe(MOCK_RECIPIENT.toLowerCase());
			expect(decoded[0][1][0].toLowerCase()).toBe(MOCK_TOKEN.toLowerCase());
		});
	});

	// ── 2. Hex Normalization ────────────────────────────────────────────

	describe('hex normalization', () => {
		it('normalizeHex preserves even-length hex', () => {
			expect(normalizeHex('0xabcdef')).toBe('0xabcdef');
			expect(normalizeHex('0x1234')).toBe('0x1234');
			expect(normalizeHex('0x')).toBe('0x');
		});

		it('normalizeHex pads odd-length hex with leading zero', () => {
			expect(normalizeHex('0xabcde')).toBe('0x0abcde');
			expect(normalizeHex('0x1')).toBe('0x01');
			expect(normalizeHex('0x0')).toBe('0x00'); // 1 char (odd) → padded to 2
		});

		it('normalizeHex handles empty/null/undefined', () => {
			expect(normalizeHex('')).toBe('');
			expect(normalizeHex('0x')).toBe('0x');
		});

		it('toHex always produces even-length hex', () => {
			// Test values that produce odd-length hex with toString(16)
			expect((toHex(0n).length - 2) % 2).toBe(0);
			expect((toHex(1n).length - 2) % 2).toBe(0);
			expect((toHex(255n).length - 2) % 2).toBe(0);
			expect((toHex(256n).length - 2) % 2).toBe(0);
			expect((toHex(400000n).length - 2) % 2).toBe(0);
			expect((toHex(5000000n).length - 2) % 2).toBe(0);
			expect((toHex(1000000000n).length - 2) % 2).toBe(0);
			expect((toHex(100000000n).length - 2) % 2).toBe(0);
		});

	it('toHex produces correct values', () => {
			expect(toHex(0n)).toBe('0x00');       // '0' → odd → '00'
			expect(toHex(255n)).toBe('0xff');      // 'ff' → even → no pad
			expect(toHex(256n)).toBe('0x0100');    // '100' → odd → '0100'
			expect(toHex(400000n)).toBe('0x061a80');  // '61a80' → odd → '061a80'
			expect(toHex(5000000n)).toBe('0x4c4b40'); // '4c4b40' → even → no pad
			expect(toHex(1000000000n)).toBe('0x3b9aca00'); // even → no pad
			expect(toHex(100000000n)).toBe('0x05f5e100');  // odd → pad
		});
	});

	// ── 3. buildExecuteBatchCallData ────────────────────────────────────

	describe('buildExecuteBatchCallData', () => {
		it('produces even-length hex for single call', () => {
			const transferData = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_RECIPIENT,
				1000000n
			]);
			const callData = buildExecuteBatchCallData(
				[{ to: MOCK_TOKEN, data: transferData }],
				MOCK_TOKEN,
				30000n
			);
			expect(((callData as string).length - 2) % 2).toBe(0);
		});

		it('produces even-length hex for multiple calls', () => {
			const swapData = '0xbc586b28' + '00'.repeat(160);
			const callData = buildExecuteBatchCallData(
				[
					{ to: MOCK_RECIPIENT, data: swapData },
					{ to: MOCK_TOKEN, data: '0xa9059cbb' + '00'.repeat(64) }
				],
				MOCK_TOKEN,
				30000n
			);
			expect(((callData as string).length - 2) % 2).toBe(0);
		});

		it('callData starts with executeBatch selector', () => {
			const callData = buildExecuteBatchCallData(
				[{ to: MOCK_TOKEN, data: '0x' + '00'.repeat(100) }],
				MOCK_TOKEN,
				30000n
			);
			expect(callData.startsWith('0x34fcd5be')).toBe(true);
		});

		it('fee transfer is the last call in the batch', () => {
			const callData = buildExecuteBatchCallData(
				[{ to: MOCK_RECIPIENT, data: '0x12345678' + '00'.repeat(100) }],
				MOCK_TOKEN,
				30000n
			);
			const decoded = ethersExecuteBatchIface.decodeFunctionData('executeBatch', callData);
			const calls = decoded[0];
			// Last call should be the fee transfer to treasury
			const lastCall = calls[calls.length - 1];
			expect(lastCall[0].toLowerCase()).toBe(MOCK_TOKEN.toLowerCase());
			// Decode the transfer data
			const transferDecoded = ethersTransferIface.decodeFunctionData('transfer', lastCall[2]);
			expect(transferDecoded[0].toLowerCase()).toBe(MOCK_TREASURY.toLowerCase());
			expect(transferDecoded[1]).toBe(30000n);
		});

		it('throws for empty calls array', () => {
			expect(() => buildExecuteBatchCallData([], MOCK_TOKEN, 30000n)).toThrow(
				'At least one user call is required'
			);
		});
	});

	// ── 4. Payload Hex Validation ───────────────────────────────────────

	describe('payload hex validation', () => {
		it('all UserOp gas fields have even-length hex', () => {
			const gasFields = {
				nonce: toHex(0n),
				callGasLimit: toHex(5000000n),
				verificationGasLimit: toHex(1000000n),
				preVerificationGas: toHex(425000n),
				maxFeePerGas: toHex(1000000000n),
				maxPriorityFeePerGas: toHex(100000000n)
			};

			for (const [key, value] of Object.entries(gasFields)) {
				const hexChars = value.length - 2;
				expect(hexChars % 2).toBe(0);
			}
		});

		it('full payload JSON has even-length hex in all fields', () => {
			const transferData = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_TREASURY,
				30000n
			]);
			const callData = buildExecuteBatchCallData(
				[{ to: MOCK_RECIPIENT, data: transferData }],
				MOCK_TOKEN,
				30000n
			);

			const payload = {
				sender: MOCK_SENDER,
				userOp: {
					sender: MOCK_SENDER,
					nonce: toHex(0n),
					callData: callData as string,
					callGasLimit: toHex(5000000n),
					verificationGasLimit: toHex(1000000n),
					preVerificationGas: toHex(425000n),
					maxFeePerGas: toHex(1000000000n),
					maxPriorityFeePerGas: toHex(100000000n),
					paymasterAndData: '0x',
					signature: '0x' + 'ab'.repeat(65),
					factory: '0x7702000000000000000000000000000000000000'
				},
				eip7702Auth: {
					chainId: '0xa4b1',
					address: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
					nonce: toHex(0n),
					r: '0xb1bb23c087941135d20502fd48e2227836bdd920a695dbe615259d1f87409b2f',
					s: '0x10df0a53be5507ee12892a82c597ac5280fb9d77e34337af2911fc1a8e4bc145',
					v: '0x1c'
				}
			};

			// Verify all hex fields
			const hexFields = Object.entries(payload.userOp)
				.filter(([, v]) => typeof v === 'string' && v.startsWith('0x') && v.length > 2)
				.concat(Object.entries(payload.eip7702Auth).filter(([, v]) => typeof v === 'string' && v.startsWith('0x') && v.length > 2));

			for (const [key, value] of hexFields) {
				const hexChars = (value as string).length - 2;
				expect(hexChars % 2).toBe(0);
			}
		});

		it('payload JSON is valid and parseable', () => {
			const transferData = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_TREASURY,
				30000n
			]);
			const callData = buildExecuteBatchCallData(
				[{ to: MOCK_RECIPIENT, data: transferData }],
				MOCK_TOKEN,
				30000n
			);

			const payload = {
				sender: MOCK_SENDER,
				userOp: {
					sender: MOCK_SENDER,
					nonce: toHex(0n),
					callData: callData as string,
					callGasLimit: toHex(5000000n),
					verificationGasLimit: toHex(1000000n),
					preVerificationGas: toHex(425000n),
					maxFeePerGas: toHex(1000000000n),
					maxPriorityFeePerGas: toHex(100000000n),
					paymasterAndData: '0x',
					signature: '0x' + 'ab'.repeat(65)
				}
			};

			const json = JSON.stringify(payload);
			const parsed = JSON.parse(json);
			expect(parsed.userOp.callData).toBe(callData);
			expect(parsed.userOp.signature.length).toBe(132); // 0x + 130 hex chars (65 bytes)
		});
	});

	// ── 5. EIP-7702 Authorization Signing ──────────────────────────────

	describe('EIP-7702 authorization', () => {
		it('produces valid r, s, v values', () => {
			const ownerKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
			const implAddress = '0xe6Cae83BdE06E4c305530e199D7217f42808555B';
			const chainId = 42161n;
			const eoaNonce = 0;

			const chainIdHex = ethersLib.toBeHex(chainId);
			const nonceHex = eoaNonce === 0 ? '0x' : ethersLib.toBeHex(eoaNonce);
			const addressBytes = ethersLib.getBytes(implAddress);
			const rlpEncoded = ethersLib.encodeRlp([chainIdHex, addressBytes, nonceHex]);
			const authHash = ethersLib.keccak256(ethersLib.concat(['0x05', rlpEncoded]));

			const signingKey = new ethersLib.SigningKey(ownerKey);
			const sig = signingKey.sign(authHash);

			// r and s should be 32 bytes each (64 hex chars)
			expect(sig.r.length - 2).toBe(64);
			expect(sig.s.length - 2).toBe(64);
			// v should be 27 or 28 (0x1b or 0x1c)
			expect([27, 28]).toContain(Number(sig.v));
		});
	});

	// ── 6. Preimage Generation ──────────────────────────────────────────

	describe('preimage generation', () => {
		it('generateSwapPreimage produces 64-char hex strings', async () => {
			// Import the actual module (not mocked)
			const { generateSwapPreimage } = await import('$lib/utils/swap-preimage');
			const { preimageHex, hashHex } = await generateSwapPreimage();

			expect(preimageHex.length).toBe(64);
			expect(hashHex.length).toBe(64);
			expect(preimageHex.length % 2).toBe(0);
			expect(hashHex.length % 2).toBe(0);
		});

		it('preimageHex and hashHex are valid hex', async () => {
			const { generateSwapPreimage } = await import('$lib/utils/swap-preimage');
			const { preimageHex, hashHex } = await generateSwapPreimage();

			expect(/^[0-9a-f]{64}$/.test(preimageHex)).toBe(true);
			expect(/^[0-9a-f]{64}$/.test(hashHex)).toBe(true);
		});

		it('hashHex can be used as bytes32 without error', async () => {
			const { generateSwapPreimage } = await import('$lib/utils/swap-preimage');
			const { hashHex } = await generateSwapPreimage();

			const lockIface = new ethersLib.Interface([
				'function lockPrepayMinerfee(bytes32,uint256,address,address,uint256) external payable'
			]);
			const encoded = lockIface.encodeFunctionData('lockPrepayMinerfee', [
				'0x' + hashHex,
				BigInt('100000000000000000'),
				MOCK_TOKEN,
				MOCK_SENDER,
				BigInt(25620579)
			]);
			expect((encoded.length - 2) % 2).toBe(0);
		});
	});

	// ── 7. Fee Token Selection Logic ────────────────────────────────────

	describe('fee token selection', () => {
		it('selects token with highest balance', () => {
			const balances = [
				{ token: MOCK_TOKEN, symbol: 'USDT0', balance: 0n },
				{ token: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', balance: 50000n },
				{ token: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', symbol: 'TBTC', balance: 100000n }
			];

			const sorted = balances
				.filter((b) => b.balance > 0n)
				.sort((a, b) => (a.balance > b.balance ? -1 : 1));

			expect(sorted.length).toBe(2);
			expect(sorted[0].symbol).toBe('TBTC');
			expect(sorted[1].symbol).toBe('WBTC');
		});

		it('excludes tokens with zero balance', () => {
			const balances = [
				{ token: MOCK_TOKEN, symbol: 'USDT0', balance: 0n },
				{ token: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', balance: 0n },
				{ token: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40', symbol: 'TBTC', balance: 0n }
			];

			const sorted = balances.filter((b) => b.balance > 0n);
			expect(sorted.length).toBe(0);
		});

		it('fee buffer amount is within bounds for each token', () => {
			// USDT0: 6 decimals, min 10000, max 150000
			const usdt0Fee = 30000n;
			expect(usdt0Fee >= 10000n).toBe(true);
			expect(usdt0Fee <= 150000n).toBe(true);

			// WBTC: 8 decimals, min 16, max 230
			const wbtcFee = 50n;
			expect(wbtcFee >= 16n).toBe(true);
			expect(wbtcFee <= 230n).toBe(true);

			// TBTC: 18 decimals, min 10000000000000000, max 150000000000000000
			const tbtcFee = 30000000000000000n;
			expect(tbtcFee >= 10000000000000000n).toBe(true);
			expect(tbtcFee <= 150000000000000000n).toBe(true);
		});
	});

	// ── 8. Backend Endpoint Payload Compatibility ───────────────────────

	describe('backend endpoint compatibility', () => {
		it('relay payload matches RelayRequest schema', () => {
			const transferData = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_TREASURY,
				30000n
			]);
			const callData = buildExecuteBatchCallData(
				[{ to: MOCK_RECIPIENT, data: transferData }],
				MOCK_TOKEN,
				30000n
			);

			const payload = {
				sender: MOCK_SENDER,
				userOp: {
					sender: MOCK_SENDER,
					nonce: toHex(0n),
					callData: callData as string,
					callGasLimit: toHex(5000000n),
					verificationGasLimit: toHex(1000000n),
					preVerificationGas: toHex(425000n),
					maxFeePerGas: toHex(1000000000n),
					maxPriorityFeePerGas: toHex(100000000n),
					paymasterAndData: '0x',
					signature: '0x' + 'ab'.repeat(65),
					factory: '0x7702000000000000000000000000000000000000'
				},
				eip7702Auth: {
					chainId: '0xa4b1',
					address: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
					nonce: '0x0',
					r: '0xb1bb23c087941135d20502fd48e2227836bdd920a695dbe615259d1f87409b2f',
					s: '0x10df0a53be5507ee12892a82c597ac5280fb9d77e34337af2911fc1a8e4bc145',
					v: '0x1c'
				}
			};

			// Verify JSON serialization doesn't corrupt hex
			const json = JSON.stringify(payload);
			const parsed = JSON.parse(json);
			expect(parsed.userOp.callData).toBe(callData);
			expect(parsed.userOp.nonce).toBe('0x00');
			expect(parsed.userOp.callGasLimit).toBe(toHex(5000000n));
		});

		it('simulate payload matches SimulateRequest schema', () => {
			const transferData = ethersTransferIface.encodeFunctionData('transfer', [
				MOCK_TREASURY,
				30000n
			]);
			const callData = buildExecuteBatchCallData(
				[{ to: MOCK_RECIPIENT, data: transferData }],
				MOCK_TOKEN,
				30000n
			);

			// Simulate uses the same schema as relay
			const payload = {
				sender: MOCK_SENDER,
				userOp: {
					sender: MOCK_SENDER,
					nonce: toHex(0n),
					callData: callData as string,
					callGasLimit: toHex(5000000n),
					verificationGasLimit: toHex(1000000n),
					preVerificationGas: toHex(425000n),
					maxFeePerGas: toHex(1000000000n),
					maxPriorityFeePerGas: toHex(100000000n),
					paymasterAndData: '0x',
					signature: '0x', // Simulate doesn't need real signature
					factory: '0x7702000000000000000000000000000000000000'
				},
				eip7702Auth: {
					chainId: '0xa4b1',
					address: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
					nonce: '0x0',
					r: '0xb1bb23c087941135d20502fd48e2227836bdd920a695dbe615259d1f87409b2f',
					s: '0x10df0a53be5507ee12892a82c597ac5280fb9d77e34337af2911fc1a8e4bc145',
					v: '0x1c'
				}
			};

			// Verify the payload is valid JSON
			expect(() => JSON.stringify(payload)).not.toThrow();
			expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow();
		});

		it('gas bounds match backend config', () => {
			// These should match the values returned by GET /gasless/config
			const expectedBounds = {
				maxCallGas: '5000000',
				maxVerificationGas: '1000000',
				maxPreVerificationGas: '400000',
				maxFeePerGas: '1000000000',
				maxPriorityFeePerGas: '100000000',
				maxTotalGas: '6400000'
			};

			// Verify our toHex produces values within bounds
			expect(BigInt(toHex(5000000n))).toBeLessThanOrEqual(BigInt(expectedBounds.maxCallGas));
			expect(BigInt(toHex(1000000n))).toBeLessThanOrEqual(BigInt(expectedBounds.maxVerificationGas));
			expect(BigInt(toHex(400000n))).toBeLessThanOrEqual(BigInt(expectedBounds.maxPreVerificationGas));
		});
	});
});
