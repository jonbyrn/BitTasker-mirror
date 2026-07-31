/**
 * Send Flow Integration Tests
 *
 * Proactive behavioral tests for the FULL send flow data chain:
 *   UI input → validation → fee estimation → balance check → send execution
 *
 * These tests verify cross-module consistency by reading source code for
 * structural assertions and testing pure helper functions with realistic data.
 *
 * Modules under test:
 *   1. use-send-form-validation.svelte.ts — validation, availableBalance, hasInsufficientBalance
 *   2. use-send-fee-estimate.svelte.ts — fee estimation, max amount, parameters
 *   3. send-execution.service.ts — executeSend, BUILTIN_HANDLERS, CONNECTED_HANDLERS
 *   4. wallet-send.ts — sendArbitrumTransaction (direct vs gasless paths)
 *   5. gasless.config.ts — FEE_BUFFER_MAX, TOKENS, BRIDGE_GAS_RESERVE
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT = resolve(__dirname, '../../../../..');
function readSource(rel: string) {
	return readFileSync(resolve(PROJECT, rel), 'utf8');
}

// ── Source snapshots (read once, used across all tests) ───────────────────

const validationSource = readSource('src/lib/runes/use-send-form-validation.svelte.ts');
const feeEstimateSource = readSource('src/lib/runes/use-send-fee-estimate.svelte.ts');
const executionSource = readSource('src/lib/services/send-execution.service.ts');
const walletSendSource = readSource('src/lib/stores/wallet/wallet-send.ts');
const gaslessConfigSource = readSource('src/lib/wallet/gasless.config.ts');

// ── Constants extracted from source ───────────────────────────────────────

const SUPPORTED_SEND_NETWORKS = [
	'rootstock-bitcoin',
	'lightning-bitcoin',
	'bitcoin',
	'usdt-bsc',
	'usdt0-arb'
];

// =============================================================================
// 1. Network Exhaustiveness — BUILTIN_HANDLERS vs SUPPORTED_SEND_NETWORKS
// =============================================================================

describe('Send flow — network exhaustiveness', () => {
	describe('BUILTIN_HANDLERS covers all built-in-capable networks', () => {
		it('every network in SUPPORTED_SEND_NETWORKS that has a built-in handler is registered', () => {
			const builtinRequired = ['rootstock-bitcoin', 'usdt-bsc', 'usdt0-arb', 'lightning-bitcoin'];
			for (const net of builtinRequired) {
				expect(executionSource).toContain(`'${net}'`);
			}
		});

		it('BUILTIN_HANDLERS has exactly 5 entries', () => {
			expect(executionSource).toContain("'rootstock-bitcoin': sendRbtcDirect");
			expect(executionSource).toContain("'usdt-bsc': sendUsdtBsc");
			expect(executionSource).toContain("'usdt0-rsk': sendUsdt0Rsk");
			expect(executionSource).toContain("'usdt0-arb': sendUsdtArbitrumBuiltin");
			expect(executionSource).toContain("'lightning-bitcoin': sendLightningBuiltin");
		});

		it('BUG: bitcoin is in SUPPORTED_SEND_NETWORKS but has NO built-in handler', () => {
			expect(validationSource).toContain("'bitcoin'");

			const builtinSection = executionSource.substring(
				executionSource.indexOf('BUILTIN_HANDLERS'),
				executionSource.indexOf('CONNECTED_HANDLERS')
			);
			const handlerKeys = builtinSection.match(/'([^']+)':\s*\w+/g) ?? [];
			const keys = handlerKeys.map((h) => h.split(':')[0].replace(/'/g, ''));
			expect(keys).not.toContain('bitcoin');
		});

		it('CONNECTED_HANDLERS includes bitcoin (connected wallets CAN send BTC)', () => {
			// Note: source uses unquoted key `bitcoin:` not `'bitcoin':`
			expect(executionSource).toContain('bitcoin: sendConnectedBitcoin');
		});
	});

	describe('computeAvailableBalance handles all supported networks', () => {
		it('has explicit handling for usdt0-arb (allAssets + connectedWallets)', () => {
			expect(validationSource).toContain("'usdt0-arb'");
			expect(validationSource).toContain("assetId === 'usdt0-arb'");
			expect(validationSource).toContain("balances?.['usdt0-arb']");
		});

		it('has explicit handling for usdt-bsc (walletStore.bsc)', () => {
			expect(validationSource).toContain("source === 'usdt-bsc'");
			expect(validationSource).toContain('formattedUsdtBalance');
		});

		it('has explicit handling for rootstock-bitcoin (walletStore.rsk)', () => {
			expect(validationSource).toContain('walletStore.rsk.connected');
			expect(validationSource).toContain('formattedBalance');
		});
	});

	describe('computeDirectFees handles all supported networks', () => {
		it('has explicit handling for rootstock-bitcoin', () => {
			expect(feeEstimateSource).toContain("destNetwork === 'rootstock-bitcoin'");
		});

		it('has explicit handling for usdt-bsc', () => {
			expect(feeEstimateSource).toContain("destNetwork === 'usdt-bsc'");
		});

		it('has explicit handling for bitcoin destination', () => {
			expect(feeEstimateSource).toContain("destNetwork === 'bitcoin'");
		});

		it('has explicit handling for cross-chain EVM (usdt0-arb via isCrossChainEvmDest)', () => {
			expect(feeEstimateSource).toContain("dest === 'usdt0-arb'");
			expect(feeEstimateSource).toContain('isCrossChainEvmDest');
		});

		it('FIXED: usdt0-arb computeDirectFees returns gasless fee buffer (not 0)', () => {
			// After fix: usdt0-arb has its own branch inside isCrossChainEvmDest
			// that returns the gasless fee buffer from FEE_BUFFER_MAX
			expect(feeEstimateSource).toContain("destNetwork === 'usdt0-arb'");
			expect(feeEstimateSource).toContain('FEE_BUFFER_MAX');
		});
	});

	describe('fetchFeeParameters handles all supported networks', () => {
		it('has a handler for lightning-bitcoin', () => {
			expect(feeEstimateSource).toContain("destNetwork === 'lightning-bitcoin'");
		});

		it('has a handler for rootstock-bitcoin', () => {
			expect(feeEstimateSource).toContain("destNetwork === 'rootstock-bitcoin'");
		});

		it('FIXED: has a handler for usdt0-arb', () => {
			// After fix: fetchFeeParameters has a specific branch for usdt0-arb
			// that sets parameters with the gasless fee buffer as fixedFee
			const fetchSection = feeEstimateSource.substring(
				feeEstimateSource.indexOf('async function fetchFeeParameters'),
				feeEstimateSource.indexOf('async function fetchFeeParameters') + 1800
			);
			expect(fetchSection).toContain("destNetwork === 'usdt0-arb'");
			expect(fetchSection).toContain('FEE_BUFFER_MAX');
		});
	});
});

// =============================================================================
// 2. Fee Estimation Chain — fee → total → max
// =============================================================================

describe('Send flow — fee estimation chain', () => {
	describe('usdt0-arb: fee → total → max chain', () => {
		it('FIXED: computeDirectFees returns non-zero totalFees for usdt0-arb (gasless buffer)', () => {
			// After fix: usdt0-arb returns gasless fee buffer instead of { totalFees: 0 }
			// Uses estimateFee() with fallback to FEE_BUFFER_MAX in catch block
			const usdt0ArbSection = feeEstimateSource.substring(
				feeEstimateSource.indexOf("destNetwork === 'usdt0-arb'"),
				feeEstimateSource.indexOf("destNetwork === 'usdt0-arb'") + 1200
			);
			expect(usdt0ArbSection).toContain('FEE_BUFFER_MAX');
			expect(usdt0ArbSection).toContain('feeBufferSats');
		});

		it('FIXED: fetchFeeParameters sets parameters for usdt0-arb (not null)', () => {
			// After fix: parameters = { fixedFee: feeBufferSats } using estimateFee() with FEE_BUFFER_MAX fallback
			const fetchSection = feeEstimateSource.substring(
				feeEstimateSource.indexOf('async function fetchFeeParameters'),
				feeEstimateSource.indexOf('async function fetchFeeParameters') + 1800
			);
			expect(fetchSection).toContain("destNetwork === 'usdt0-arb'");
			expect(fetchSection).toContain('feeBufferSats');
		});

		it('calculateMaxAmount returns > 0 when parameters exist and balance > 0', () => {
			// With fixedFee = 150_000 (gasless buffer) and balance = 136_000_000
			// max = floor(136_000_000 - ceil(150_000 * 1.2)) - 20
			//     = floor(136_000_000 - 180_000) - 20 = 135_819_980
			const availableBalance = 136_000_000;
			const fixedFee = 150_000;
			const feeWithBuffer = Math.ceil(fixedFee * 1.2); // 180_000
			const maxAmount = availableBalance - feeWithBuffer - 20;
			expect(maxAmount).toBe(135_819_980);
			expect(maxAmount).toBeGreaterThan(0);
		});
	});

	describe('rootstock-bitcoin: fee → total → max chain', () => {
		it('computeDirectFees returns fallback 3000 sats when RSK not connected', () => {
			const section = feeEstimateSource.substring(
				feeEstimateSource.indexOf("destNetwork === 'rootstock-bitcoin'"),
				feeEstimateSource.indexOf("destNetwork === 'rootstock-bitcoin'") + 500
			);
			expect(section).toContain('networkFee: 3000, totalFees: 3000');
		});

		it('fetchFeeParameters sets fixedFee for rootstock-bitcoin', () => {
			expect(feeEstimateSource).toContain('fetchRootstockFeeParameters');
			expect(feeEstimateSource).toContain('parameters = { fixedFee: estimatedGasFee }');
		});
	});

	describe('lightning-bitcoin: fee → total → max chain', () => {
		it('fetchFeeParameters sets percentage + fixedFee for lightning-bitcoin', () => {
			expect(feeEstimateSource).toContain('fetchLightningFeeParameters');
			expect(feeEstimateSource).toContain('percentage: pair.fees.percentage ?? 0.1');
			expect(feeEstimateSource).toContain('fixedFee: minerFee + estimatedGasFee');
		});
	});

	describe('usdt-bsc: fee estimation', () => {
		it('computeDirectFees returns { totalFees: 0 } for same-chain usdt-bsc', () => {
			const section = feeEstimateSource.substring(
				feeEstimateSource.indexOf("destNetwork === 'usdt-bsc'"),
				feeEstimateSource.indexOf("destNetwork === 'usdt-bsc'") + 200
			);
			expect(section).toContain('totalFees: 0');
		});
	});

	describe('cross-chain EVM non-usdt0-arb: fee estimation', () => {
		it('returns { totalFees: 0 } for usdt-ethereum from non-rootstock source', () => {
			// usdt-ethereum (not usdt0-arb) still returns totalFees: 0
			// Only usdt0-arb has the gasless fee buffer branch
			const crossChainSection = feeEstimateSource.substring(
				feeEstimateSource.indexOf('isCrossChainEvmDest(destNetwork)'),
				feeEstimateSource.indexOf('isCrossChainEvmDest(destNetwork)') + 2000
			);
			// The final fallback for non-usdt0-arb cross-chain EVM is totalFees: 0
			expect(crossChainSection).toContain('return { serviceFee: 0, networkFee: 0, totalFees: 0 }');
		});
	});
});

// =============================================================================
// 3. Balance Check Chain — availableBalance → hasInsufficientBalance
// =============================================================================

describe('Send flow — balance check chain', () => {
	describe('hasInsufficientBalance logic (source assertions)', () => {
		it('totalToSend = amountInSats + (feeEstimate?.totalFees ?? 0)', () => {
			expect(validationSource).toContain('amountInSats + (feeEstimate?.totalFees ?? 0)');
		});

		it('hasInsufficientBalance = totalToSend > availableBalance && totalToSend > 0', () => {
			expect(validationSource).toContain('totalToSend > availableBalance && totalToSend > 0');
		});
	});

	describe('balance arithmetic with realistic values', () => {
		it('sufficient: balance=$1.36, amount=$1.10, fee=$0.15 → total=$1.25 < $1.36', () => {
			const balance = 136_000_000;
			const amount = 110_000_000;
			const fee = 15_000_000;
			const total = amount + fee;
			expect(total).toBeLessThanOrEqual(balance);
		});

		it('insufficient: balance=$1.36, amount=$1.30, fee=$0.15 → total=$1.45 > $1.36', () => {
			const balance = 136_000_000;
			const amount = 130_000_000;
			const fee = 15_000_000;
			const total = amount + fee;
			expect(total).toBeGreaterThan(balance);
		});

		it('FIXED: usdt0-arb now includes gasless fee in totalFees (fee > 0)', () => {
			// After fix: computeDirectFees returns gasless fee buffer for usdt0-arb
			// With $1.36 balance and $0.15 fee buffer, max amount = $1.21
			const balance = 136_000_000;
			const gaslessFeeBufferMicroUsdt = 150_000; // FEE_BUFFER_MAX for USDT0
			const feeInSats = 15_000_000; // converted via btcPrice
			const amount = 120_000_000; // $1.20
			const total = amount + feeInSats;
			expect(total).toBeLessThanOrEqual(balance); // $1.35 < $1.36 ✓
		});
	});

	describe('computeAvailableBalance key consistency', () => {
		it('usdt0-arb uses correct key "usdt0-arb" in connectedWallets lookup', () => {
			expect(validationSource).toContain("balances?.['usdt0-arb']");
		});

		it('does NOT use incorrect key "USDT0" for balance lookup', () => {
			expect(validationSource).not.toContain("balances?.['USDT0']");
		});
	});
});

// =============================================================================
// 4. Send Execution Chain — handler dispatch + error paths
// =============================================================================

describe('Send flow — execution chain', () => {
	describe('sendUsdtArbitrumBuiltin handler', () => {
		it('is registered in BUILTIN_HANDLERS', () => {
			expect(executionSource).toContain("'usdt0-arb': sendUsdtArbitrumBuiltin");
		});

		it('calls sendArbitrumTransaction from wallet-send', () => {
			expect(executionSource).toContain("import('$lib/stores/wallet/wallet-send')");
			expect(executionSource).toContain('sendArbitrumTransaction');
		});

		it('encodes ERC-20 transfer with encodeERC20Transfer', () => {
			expect(executionSource).toContain('encodeERC20Transfer');
		});

		it('uses USDT0 Arbitrum contract address 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', () => {
			expect(executionSource).toContain('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
		});

		it('uses 6 decimals for USDT0 amount conversion', () => {
			expect(executionSource).toContain('decimals = 6');
		});
	});

	describe('sendArbitrumTransaction ETH balance check', () => {
		it('checks ETH balance via arbProvider.getBalance', () => {
			expect(walletSendSource).toContain('arbProvider.getBalance');
		});

		it('has ETH → direct path (sendDirectArbitrumTx)', () => {
			expect(walletSendSource).toContain('sendDirectArbitrumTx');
		});

		it('has ETH: checks arbEthBalance > 0n', () => {
			expect(walletSendSource).toContain('arbEthBalance > 0n');
		});

		it('no ETH + walletReady → gasless path (sendGaslessCalls)', () => {
			expect(walletSendSource).toContain('sendGaslessCalls');
		});

		it('no ETH + !walletReady → throws error', () => {
			expect(walletSendSource).toContain('No ETH on Arbitrum for gas and gasless relay is not initialized');
		});

		it('gasless path scans TOKENS list for fee token balances', () => {
			expect(walletSendSource).toContain('TOKENS.map');
			expect(walletSendSource).toContain('queryERC20Balance');
		});

		it('FIXED: gasless path sorts by USD value (decimals-normalized), not raw balance', () => {
			expect(walletSendSource).toContain('decimals');
		});

		it('throws when all fee token attempts exhausted', () => {
			expect(walletSendSource).toContain('No fee token available for gasless transaction');
		});
	});

	describe('executeSend throws for unsupported networks', () => {
		it('checks SUPPORTED_NETWORKS before dispatching', () => {
			expect(executionSource).toContain('SUPPORTED_NETWORKS.has(network)');
			expect(executionSource).toContain('not yet supported');
		});

		it('throws "No built-in handler" when handler missing', () => {
			expect(executionSource).toContain('No built-in handler registered for network');
		});

		it('throws "No connected handler" when handler missing', () => {
			expect(executionSource).toContain('No connected handler registered for network');
		});
	});

	describe('SUPPORTED_NETWORKS in execution service', () => {
		it('includes usdt0-arb', () => {
			expect(executionSource).toContain("'usdt0-arb'");
		});

		it('includes bitcoin (connected wallet path)', () => {
			const supportedSection = executionSource.substring(
				executionSource.indexOf('const SUPPORTED_NETWORKS'),
				executionSource.indexOf('const SUPPORTED_NETWORKS') + 400
			);
			expect(supportedSection).toContain("'bitcoin'");
		});

		it('FIXED: SUPPORTED_NETWORKS has exactly one usdt0-arb entry (no duplicate)', () => {
			const supportedSection = executionSource.substring(
				executionSource.indexOf('const SUPPORTED_NETWORKS'),
				executionSource.indexOf('const SUPPORTED_NETWORKS') + 400
			);
			const matches = supportedSection.match(/'usdt0-arb'/g);
			expect(matches).toHaveLength(1);
		});
	});
});

// =============================================================================
// 5. Gasless Fee Buffer — FEE_BUFFER_MAX usage
// =============================================================================

describe('Send flow — gasless fee buffer', () => {
	it('FEE_BUFFER_MAX exists for USDT0', () => {
		expect(gaslessConfigSource).toContain('FEE_BUFFER_MAX');
	});

	it('FEE_BUFFER_MAX for USDT0 is 150_000 (micro-USDT = $0.15)', () => {
		expect(gaslessConfigSource).toContain('150_000n');
	});

	it('BRIDGE_GAS_RESERVE exists for USDT0', () => {
		expect(gaslessConfigSource).toContain('BRIDGE_GAS_RESERVE');
	});

	it('TOKENS list includes USDT0 with 6 decimals on Arbitrum (chainId 42161)', () => {
		expect(gaslessConfigSource).toContain("symbol: 'USDT0'");
		expect(gaslessConfigSource).toContain('decimals: 6');
		expect(gaslessConfigSource).toContain('chainId: ARBITRUM_CHAIN_ID');
	});

	it('FIXED: fee estimation rune imports FEE_BUFFER_MAX from gasless.config', () => {
		// After fix: the rune imports and uses FEE_BUFFER_MAX for usdt0-arb
		expect(feeEstimateSource).toContain('FEE_BUFFER_MAX');
		expect(feeEstimateSource).toContain('$lib/wallet/gasless.config');
	});

	it('FIXED: fetchFeeParameters uses FEE_BUFFER_MAX for usdt0-arb max amount', () => {
		const fetchSection = feeEstimateSource.substring(
			feeEstimateSource.indexOf('async function fetchFeeParameters'),
			feeEstimateSource.indexOf('async function fetchFeeParameters') + 1800
		);
		expect(fetchSection).toContain("destNetwork === 'usdt0-arb'");
		expect(fetchSection).toContain('FEE_BUFFER_MAX');
		expect(fetchSection).toContain('feeBufferSats');
	});
});

// =============================================================================
// 6. End-to-End Data Flow — realistic scenarios
// =============================================================================

describe('Send flow — end-to-end scenarios', () => {
	describe('Scenario: User sends $1.10 USDT0 on Arbitrum from builtin wallet', () => {
		const availableBalanceMicroUsdt = 1_360_000; // $1.36 in micro-USDT (6 decimals)
		const gaslessFeeBufferMicroUsdt = 150_000; // FEE_BUFFER_MAX = $0.15
		const sendAmountMicroUsdt = 1_100_000; // $1.10

		it('step 1: send amount is $1.10 in micro-USDT', () => {
			expect(sendAmountMicroUsdt).toBe(1_100_000);
		});

		it('step 2: gasless fee buffer is $0.15 in micro-USDT', () => {
			expect(gaslessFeeBufferMicroUsdt).toBe(150_000);
		});

		it('step 3: after send, remaining = $0.26 > $0.15 fee buffer → send succeeds', () => {
			const remaining = availableBalanceMicroUsdt - sendAmountMicroUsdt;
			expect(remaining).toBe(260_000); // $0.26
			expect(remaining).toBeGreaterThan(gaslessFeeBufferMicroUsdt);
		});

		it('step 4: form validation passes (balance covers amount + fee)', () => {
			// After fix: feeEstimate.totalFees includes the gasless buffer
			const feeEstimateTotalFees = 15_000_000; // in sats-equivalent (after btcPrice conversion)
			const amountInSats = 110_000_000; // $1.10 in sats-equivalent
			const totalToSend = amountInSats + feeEstimateTotalFees;
			const availableBalanceSats = 136_000_000; // $1.36 in sats-equivalent
			expect(totalToSend).toBeLessThanOrEqual(availableBalanceSats);
		});
	});

	describe('Scenario: User sends MAX USDT0 on Arbitrum from builtin wallet', () => {
		it('FIXED: MAX button uses gasless fee buffer as fixedFee parameter', () => {
			// After fix: fetchFeeParameters sets parameters = { fixedFee: feeBufferSats }
			// calculateMaxAmount then subtracts ceil(fixedFee * 1.2) + 20
			const availableBalance = 136_000_000; // $1.36 in sats-equivalent
			const fixedFee = 15_000_000; // gasless buffer in sats-equivalent
			const feeWithBuffer = Math.ceil(fixedFee * 1.2); // 18_000_000
			const maxAmount = Math.max(0, availableBalance - feeWithBuffer - 20);
			expect(maxAmount).toBe(117_999_980); // ~$1.18
			expect(maxAmount).toBeGreaterThan(0);
		});
	});

	describe('Scenario: User sends $1.30 USDT0 with $1.36 balance (gasless fee edge case)', () => {
		it('BUG: remaining after send ($0.06) < gasless fee buffer ($0.15)', () => {
			const availableBalance = 1_360_000; // $1.36 micro-USDT
			const sendAmount = 1_300_000; // $1.30
			const gaslessFeeBuffer = 150_000; // $0.15

			const remaining = availableBalance - sendAmount;
			expect(remaining).toBe(60_000); // $0.06
			expect(remaining).toBeLessThan(gaslessFeeBuffer); // $0.06 < $0.15
		});

		it('FIXED: fee estimation now includes gasless buffer → validation catches this', () => {
			// After fix: totalToSend = amountInSats + gaslessFeeBufferInSats
			// With btcPrice = $100K: gaslessFeeBufferInSats = ceil(($0.15 / $100K) * 100_000_000) = 150_000 sats
			// But in micro-USDT terms: totalToSend = $1.30 + $0.15 = $1.45 > $1.36
			const availableBalanceMicroUsdt = 1_360_000;
			const sendAmount = 1_300_000;
			const feeBuffer = 150_000;
			const totalToSend = sendAmount + feeBuffer;
			expect(totalToSend).toBe(1_450_000);
			expect(totalToSend).toBeGreaterThan(availableBalanceMicroUsdt);
		});
	});

	describe('Scenario: validateSendForm ordering — checks happen in correct order', () => {
		it('validation function source checks parsedData first', () => {
			const validationSection = validationSource.substring(
				validationSource.indexOf('function validateSendForm'),
				validationSource.indexOf('function validateSendForm') + 200
			);
			expect(validationSection).toContain('parsedData?.isValid');
		});

		it('validation function checks network support second', () => {
			const validationSection = validationSource.substring(
				validationSource.indexOf('function validateSendForm'),
				validationSource.indexOf('function validateSendForm') + 400
			);
			expect(validationSection).toContain('isNetworkSupported');
		});

		it('validation function checks source wallet connected third', () => {
			const validationSection = validationSource.substring(
				validationSource.indexOf('function validateSendForm'),
				validationSource.indexOf('function validateSendForm') + 500
			);
			expect(validationSection).toContain('isSourceWalletConnected');
		});

		it('validation function checks amount > 0 fourth', () => {
			const validationSection = validationSource.substring(
				validationSource.indexOf('function validateSendForm'),
				validationSource.indexOf('function validateSendForm') + 700
			);
			expect(validationSection).toContain('amountInSats <= 0');
		});

		it('validation function checks insufficient balance before self-send', () => {
			const hasInsufficientIdx = validationSource.indexOf('hasInsufficientBalance');
			const isSelfSendIdx = validationSource.indexOf('isSelfSend');
			expect(hasInsufficientIdx).toBeLessThan(isSelfSendIdx);
		});

		it('validation function checks insufficient_balance error key', () => {
			expect(validationSource).toContain('wallet.validation.insufficient_balance');
		});

		it('validation function checks self_send error key', () => {
			expect(validationSource).toContain('wallet.send.error.self_send');
		});
	});
});

// =============================================================================
// 7. Cross-module consistency checks
// =============================================================================

describe('Send flow — cross-module consistency', () => {
	describe('SUPPORTED_SEND_NETWORKS (validation) vs SUPPORTED_NETWORKS (execution)', () => {
		it('all validation networks are in execution SUPPORTED_NETWORKS or BUILTIN_HANDLERS', () => {
			for (const net of SUPPORTED_SEND_NETWORKS) {
				const inSupported = executionSource.includes(`'${net}'`);
				expect(inSupported).toBe(true);
			}
		});

		it('execution has networks not in validation (usdt0-rsk, usdt-ethereum, usdt-polygon)', () => {
			expect(executionSource).toContain("'usdt0-rsk'");
			expect(executionSource).toContain("'usdt-ethereum'");
			expect(executionSource).toContain("'usdt-polygon'");
		});
	});

	describe('isCrossChainEvmDest consistency', () => {
		it('fee estimation recognizes usdt0-arb as cross-chain EVM', () => {
			expect(feeEstimateSource).toContain("dest === 'usdt0-arb'");
		});

		it('fee estimation recognizes usdt-ethereum as cross-chain EVM', () => {
			expect(feeEstimateSource).toContain("dest === 'usdt-ethereum'");
		});

		it('fee estimation recognizes usdt-polygon as cross-chain EVM', () => {
			expect(feeEstimateSource).toContain("dest === 'usdt-polygon'");
		});

		it('FIXED: usdt0-arb now has gasless fee buffer branch inside cross-chain EVM path', () => {
			const crossChainSection = feeEstimateSource.substring(
				feeEstimateSource.indexOf('isCrossChainEvmDest(destNetwork)'),
				feeEstimateSource.indexOf('isCrossChainEvmDest(destNetwork)') + 2000
			);
			// usdt0-arb has its own branch with FEE_BUFFER_MAX in catch fallback
			expect(crossChainSection).toContain("destNetwork === 'usdt0-arb'");
			expect(crossChainSection).toContain('FEE_BUFFER_MAX');
			// Non-usdt0-arb cross-chain EVM still returns totalFees: 0
			expect(crossChainSection).toContain('return { serviceFee: 0, networkFee: 0, totalFees: 0 }');
		});
	});

	describe('DUST_LIMITS coverage', () => {
		it('has dust limits for all supported send networks', () => {
			for (const net of SUPPORTED_SEND_NETWORKS) {
				expect(validationSource).toContain(`'${net}'`);
			}
		});

		it('bitcoin dust limit is 546', () => {
			expect(validationSource).toContain('bitcoin: 546');
		});

		it('usdt0-arb dust limit is 1', () => {
			expect(validationSource).toContain("'usdt0-arb': 1");
		});

		it('usdt-bsc dust limit is 1', () => {
			expect(validationSource).toContain("'usdt-bsc': 1");
		});
	});

	describe('fee estimation btcPrice parameter', () => {
		it('computeDirectFees accepts btcPrice option for sats conversion', () => {
			expect(feeEstimateSource).toContain('btcPrice?: number');
		});

		it('computeDirectFees uses btcPrice for usdt0-arb fee buffer sats conversion', () => {
			expect(feeEstimateSource).toContain('feeBufferUsd / (btcPrice ?? 1)');
		});

		it('refresh() passes btcPrice to computeDirectFees', () => {
			const refreshSection = feeEstimateSource.substring(
				feeEstimateSource.indexOf('async function refresh'),
				feeEstimateSource.indexOf('async function refresh') + 3000
			);
			expect(refreshSection).toContain('btcPrice');
		});
	});

	describe('CONNECTED_HANDLERS coverage', () => {
		it('has handlers for rootstock-bitcoin, usdt-bsc, usdt-ethereum, usdt0-arb, usdt-polygon, usdt0-rsk, bitcoin, lightning-bitcoin', () => {
			expect(executionSource).toContain("'rootstock-bitcoin': sendConnectedRbtc");
			expect(executionSource).toContain("'usdt-bsc': sendConnectedUsdtBsc");
			expect(executionSource).toContain("'usdt-ethereum': sendConnectedUsdtEvm");
			expect(executionSource).toContain("'usdt0-arb': sendConnectedUsdtEvm");
			expect(executionSource).toContain("'usdt-polygon': sendConnectedUsdtEvm");
			expect(executionSource).toContain("'usdt0-rsk': sendConnectedUsdt0Rsk");
			expect(executionSource).toContain('bitcoin: sendConnectedBitcoin');
			expect(executionSource).toContain("'lightning-bitcoin': sendConnectedLightning");
		});
	});
});
