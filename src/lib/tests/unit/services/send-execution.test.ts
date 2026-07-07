/**
 * Unit tests for send-execution.service.ts
 *
 * Tests all network send handlers extracted from SendPaymentForm.handleSend():
 *   - Built-in wallet handlers: sendRbtcDirect, sendUsdtBsc, sendLightningBuiltin, sendLiquidBitcoin
 *   - Connected wallet handlers: sendConnectedRbtc, sendConnectedUsdtBsc, sendConnectedUsdtEvm,
 *     sendConnectedBitcoin, sendConnectedLightning
 *   - Strategy maps: BUILTIN_HANDLERS, CONNECTED_HANDLERS
 *   - Amount conversions: sats → USD → 18 decimal units, sats → BigInt
 *   - Edge cases: unknown network, early returns, LNURL resolution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — shared between vi.mock factories and test assertions
// ---------------------------------------------------------------------------

const {
	mockSendRBTC,
	mockSendBSCUSDT,
	mockCreateSubmarineSwap,
	mockLockSubmarineSwapFunds,
	mockIsLNURL,
	mockFetchLNURLPayInvoice,
	mockGetChainIdForNetwork,
	mockEncodeERC20Transfer,
	mockGetBSCUSDTContractAddress,
	mockGetUSDTContractAddressForNetwork,
	mockEvmSigner,
	mockBitcoinSigner,
	mockGetHandle,
	mockGetBitcoinSigner,
	mockStartSwapChain,
	mockGetSwapChainStatus
} = vi.hoisted(() => {
	const evmSigner = {
		type: 'evm' as const,
		label: 'MetaMask',
		address: '0xAAaA000000000000000000000000000000000001',
		chainId: 30,
		sendTransaction: vi.fn(),
		getAddress: vi.fn(() => '0xAAaA000000000000000000000000000000000001'),
		isConnected: vi.fn(() => true)
	};

	const bitcoinSigner = {
		type: 'bitcoin' as const,
		label: 'Trezor',
		address: 'tb1qtest',
		xpub: 'xpub6test',
		derivationPath: "m/84'/0'/0'",
		sendBitcoin: vi.fn(),
		signPSBT: vi.fn(),
		getXPUB: vi.fn(() => 'xpub6test'),
		getAddress: vi.fn(() => 'tb1qtest'),
		deriveChangeAddress: vi.fn(),
		isConnected: vi.fn(() => true)
	};

	return {
		mockSendRBTC: vi.fn(),
		mockSendBSCUSDT: vi.fn(),
		mockCreateSubmarineSwap: vi.fn(),
		mockLockSubmarineSwapFunds: vi.fn(),
		mockIsLNURL: vi.fn(),
		mockFetchLNURLPayInvoice: vi.fn(),
		mockGetChainIdForNetwork: vi.fn(),
		mockEncodeERC20Transfer: vi.fn(),
		mockGetBSCUSDTContractAddress: vi.fn(),
		mockGetUSDTContractAddressForNetwork: vi.fn(),
		mockEvmSigner: evmSigner,
		mockBitcoinSigner: bitcoinSigner,
		mockGetHandle: vi.fn(),
		mockGetBitcoinSigner: vi.fn(),
		mockStartSwapChain: vi.fn(),
		mockGetSwapChainStatus: vi.fn()
	};
});

// ---------------------------------------------------------------------------
// Mock module factories
// ---------------------------------------------------------------------------

vi.mock('$lib/stores/wallet.store', () => ({
	walletManager: {
		sendRBTC: mockSendRBTC,
		sendBSCUSDT: mockSendBSCUSDT,
		createSubmarineSwap: mockCreateSubmarineSwap,
		lockSubmarineSwapFunds: mockLockSubmarineSwapFunds
	}
}));

vi.mock('$lib/services/lnurl-pay.service', () => ({
	isLNURL: mockIsLNURL,
	fetchLNURLPayInvoice: mockFetchLNURLPayInvoice
}));

vi.mock('$lib/services/external-wallet/chain-utils', () => ({
	getChainIdForNetwork: mockGetChainIdForNetwork,
	encodeERC20Transfer: mockEncodeERC20Transfer,
	getBSCUSDTContractAddress: mockGetBSCUSDTContractAddress,
	getUSDTContractAddressForNetwork: mockGetUSDTContractAddressForNetwork
}));

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getHandle: mockGetHandle,
	getBitcoinSigner: mockGetBitcoinSigner
}));

vi.mock('$lib/services/swap-chain.service', () => ({
	startSwapChain: mockStartSwapChain,
	getSwapChainStatus: mockGetSwapChainStatus
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
	sendRbtcDirect,
	sendUsdtBsc,
	sendLightningBuiltin,
	sendConnectedRbtc,
	sendConnectedUsdtBsc,
	sendConnectedUsdtEvm,
	sendConnectedBitcoin,
	sendConnectedLightning,
	BUILTIN_HANDLERS,
	CONNECTED_HANDLERS,
	convertUsdToERC20Units,
	convertSatsToBigInt,
	executeSend,
	type SendParams,
	type ConnectedSendParams,
	type ExecuteSendParams
} from '$lib/services/send-execution.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSendParams(overrides?: Partial<SendParams>): SendParams {
	return {
		recipient: '0xRecipient111111111111111111111111111111111111',
		amountInSats: 100_000, // 0.001 BTC
		amountInUSD: 50.0,
		network: 'rootstock-bitcoin',
		memo: 'test payment',
		walletManager: {
			sendRBTC: mockSendRBTC,
			sendBSCUSDT: mockSendBSCUSDT,
			createSubmarineSwap: mockCreateSubmarineSwap,
			lockSubmarineSwapFunds: mockLockSubmarineSwapFunds
		} as unknown as SendParams['walletManager'],
		parsedPayment: { data: null },
		...overrides
	};
}

function makeConnectedParams(overrides?: Partial<ConnectedSendParams>): ConnectedSendParams {
	return {
		...makeSendParams(),
		evmSigner: mockEvmSigner,
		bitcoinSigner: undefined,
		walletId: 'metamask-1',
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('send-execution.service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetChainIdForNetwork.mockReturnValue(30);
		mockEncodeERC20Transfer.mockReturnValue('0xencoded');
		mockGetBSCUSDTContractAddress.mockReturnValue('0xBSCToken');
		mockGetUSDTContractAddressForNetwork.mockReturnValue('0xUSDToken');
		mockIsLNURL.mockReturnValue(false);
		mockEvmSigner.sendTransaction.mockResolvedValue({
			txHash: '0xtxhash123',
			from: '0xAAaA000000000000000000000000000000000001',
			chainId: 30
		});
		mockBitcoinSigner.sendBitcoin.mockResolvedValue({
			txHash: '0xbtctxhash456',
			signedPSBT: 'signedpsbt',
			fee: 1000n,
			change: 0n,
			inputs: [],
			outputs: []
		});
		mockSendRBTC.mockResolvedValue('0xrbtctx789');
		mockSendBSCUSDT.mockResolvedValue('0xbsctx012');
		mockCreateSubmarineSwap.mockResolvedValue({
			swapId: 'swap-abc-123',
			swapData: {
				lockupAddress: '0xBoltzLockupAddress',
				expectedAmount: 50000
			}
		});
		mockLockSubmarineSwapFunds.mockResolvedValue({ txHash: '0xlockuptx345' });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -----------------------------------------------------------------------
	// Pure conversion helpers
	// -----------------------------------------------------------------------

	describe('convertUsdToERC20Units', () => {
		it('converts $50.00 to 18-decimal ERC20 units', () => {
			const result = convertUsdToERC20Units(50.0);
			expect(result).toBe(50n * 10n ** 18n);
		});

		it('converts $0.01 to 18-decimal ERC20 units', () => {
			const result = convertUsdToERC20Units(0.01);
			expect(result).toBe(10n ** 16n); // 0.01 * 1e18 = 1e16
		});

		it('converts $1.50 to 18-decimal ERC20 units', () => {
			const result = convertUsdToERC20Units(1.5);
			expect(result).toBe(15n * 10n ** 17n); // 1.5 * 1e18
		});

		it('converts $0.00 to 18-decimal ERC20 units', () => {
			const result = convertUsdToERC20Units(0);
			expect(result).toBe(0n);
		});

		it('converts $100.99 to 18-decimal ERC20 units', () => {
			const result = convertUsdToERC20Units(100.99);
			// 100.99 * 1e18 = 100990000000000000000 + 99000000000000000
			// = 100_990_000_000_000_000_000n (approximately, accounting for floating point)
			expect(result).toBe(100_990_000_000_000_000_000n);
		});

		it('converts $50.00 to 6-decimal USDT units (EVM chains)', () => {
			const result = convertUsdToERC20Units(50.0, 6);
			expect(result).toBe(50_000_000n);
		});

		it('converts $0.01 to 6-decimal USDT units (EVM chains)', () => {
			const result = convertUsdToERC20Units(0.01, 6);
			expect(result).toBe(10_000n);
		});

		it('converts $100.99 to 6-decimal USDT units (EVM chains)', () => {
			const result = convertUsdToERC20Units(100.99, 6);
			expect(result).toBe(100_990_000n);
		});

		it('converts $0.00 to 6-decimal USDT units (EVM chains)', () => {
			const result = convertUsdToERC20Units(0, 6);
			expect(result).toBe(0n);
		});
	});

	describe('convertSatsToBigInt', () => {
		it('converts 100000 sats to BigInt', () => {
			const result = convertSatsToBigInt(100000);
			expect(result).toBe(100000n);
		});

		it('converts 0 sats to BigInt', () => {
			const result = convertSatsToBigInt(0);
			expect(result).toBe(0n);
		});

		it('converts 1 sat to BigInt', () => {
			const result = convertSatsToBigInt(1);
			expect(result).toBe(1n);
		});

		it('converts large amount to BigInt', () => {
			const result = convertSatsToBigInt(21_000_000_00_000_000);
			expect(result).toBe(21_000_000_00_000_000n);
		});
	});

	// -----------------------------------------------------------------------
	// BUILTIN_HANDLERS strategy map
	// -----------------------------------------------------------------------

	describe('BUILTIN_HANDLERS', () => {
		it('maps rootstock-bitcoin to sendRbtcDirect', () => {
			expect(BUILTIN_HANDLERS['rootstock-bitcoin']).toBe(sendRbtcDirect);
		});

		it('maps usdt-bsc to sendUsdtBsc', () => {
			expect(BUILTIN_HANDLERS['usdt-bsc']).toBe(sendUsdtBsc);
		});

		it('maps lightning-bitcoin to sendLightningBuiltin', () => {
			expect(BUILTIN_HANDLERS['lightning-bitcoin']).toBe(sendLightningBuiltin);
		});

		it('does not include liquid-bitcoin (unsupported)', () => {
			expect(BUILTIN_HANDLERS['liquid-bitcoin']).toBeUndefined();
		});
	});

	describe('CONNECTED_HANDLERS', () => {
		it('maps rootstock-bitcoin to sendConnectedRbtc', () => {
			expect(CONNECTED_HANDLERS['rootstock-bitcoin']).toBe(sendConnectedRbtc);
		});

		it('maps usdt-bsc to sendConnectedUsdtBsc', () => {
			expect(CONNECTED_HANDLERS['usdt-bsc']).toBe(sendConnectedUsdtBsc);
		});

		it('maps bitcoin to sendConnectedBitcoin', () => {
			expect(CONNECTED_HANDLERS['bitcoin']).toBe(sendConnectedBitcoin);
		});

		it('maps lightning-bitcoin to sendConnectedLightning', () => {
			expect(CONNECTED_HANDLERS['lightning-bitcoin']).toBe(sendConnectedLightning);
		});
	});

	// -----------------------------------------------------------------------
	// sendRbtcDirect
	// -----------------------------------------------------------------------

	describe('sendRbtcDirect', () => {
		it('sends RBTC via walletManager.sendRBTC', async () => {
			const params = makeSendParams({ amountInSats: 100_000_000 }); // 1 RBTC
			const result = await sendRbtcDirect(params);
			expect(mockSendRBTC).toHaveBeenCalledWith(params.recipient, '1.00000000');
			expect(result.txHash).toBe('0xrbtctx789');
			expect(result.pendingSwapId).toBeUndefined();
		});

		it('converts sats to RBTC correctly for 0.5 RBTC', async () => {
			const params = makeSendParams({ amountInSats: 50_000_000 }); // 0.5 RBTC
			await sendRbtcDirect(params);
			expect(mockSendRBTC).toHaveBeenCalledWith(params.recipient, '0.50000000');
		});

		it('returns null txHash on sendRBTC failure', async () => {
			mockSendRBTC.mockRejectedValueOnce(new Error('insufficient funds'));
			const params = makeSendParams();
			await expect(sendRbtcDirect(params)).rejects.toThrow('insufficient funds');
		});
	});

	// -----------------------------------------------------------------------
	// sendUsdtBsc
	// -----------------------------------------------------------------------

	describe('sendUsdtBsc', () => {
		it('sends USDT via walletManager.sendBSCUSDT', async () => {
			const params = makeSendParams({ amountInUSD: 25.5, network: 'usdt-bsc' });
			const result = await sendUsdtBsc(params);
			expect(mockSendBSCUSDT).toHaveBeenCalledWith(params.recipient, '25.50');
			expect(result.txHash).toBe('0xbsctx012');
		});

		it('formats USDT amount to 2 decimal places', async () => {
			const params = makeSendParams({ amountInUSD: 100.0, network: 'usdt-bsc' });
			await sendUsdtBsc(params);
			expect(mockSendBSCUSDT).toHaveBeenCalledWith(params.recipient, '100.00');
		});
	});

	// -----------------------------------------------------------------------
	// sendLightningBuiltin
	// -----------------------------------------------------------------------

	describe('sendLightningBuiltin', () => {
		it('creates submarine swap and locks funds', async () => {
			const params = makeSendParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			const result = await sendLightningBuiltin(params);
			expect(mockCreateSubmarineSwap).toHaveBeenCalledWith('lnbc500n1test', 'test payment');
			expect(mockLockSubmarineSwapFunds).toHaveBeenCalled();
			expect(result.txHash).toBe('0xlockuptx345');
			expect(result.pendingSwapId).toBe('swap-abc-123');
			expect(result.earlyReturn).toBe(true);
		});

		it('resolves LNURL to invoice before creating swap', async () => {
			mockIsLNURL.mockReturnValue(true);
			mockFetchLNURLPayInvoice.mockResolvedValue('lnbc-resolved');
			const params = makeSendParams({
				network: 'lightning-bitcoin',
				recipient: 'https://lnurl.example.com/pay',
				amountInSats: 100_000,
				parsedPayment: {
					data: { address: 'https://lnurl.example.com/pay' } as never,
					lnurlCallback: 'https://lnurl.example.com/callback'
				}
			});
			await sendLightningBuiltin(params);
			expect(mockIsLNURL).toHaveBeenCalledWith('https://lnurl.example.com/pay');
			expect(mockFetchLNURLPayInvoice).toHaveBeenCalledWith(
				'https://lnurl.example.com/callback',
				100_000_000 // amountInSats * 1000 = msats
			);
			expect(mockCreateSubmarineSwap).toHaveBeenCalledWith('lnbc-resolved', 'test payment');
		});

		it('returns early with pendingSwapId when txHash is truthy', async () => {
			const params = makeSendParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			const result = await sendLightningBuiltin(params);
			expect(result.earlyReturn).toBe(true);
			expect(result.pendingSwapId).toBe('swap-abc-123');
		});

		it('returns null txHash when lockSubmarineSwapFunds fails', async () => {
			mockLockSubmarineSwapFunds.mockRejectedValueOnce(new Error('lock failed'));
			const params = makeSendParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			await expect(sendLightningBuiltin(params)).rejects.toThrow('lock failed');
		});
	});

	// -----------------------------------------------------------------------
	// sendConnectedRbtc
	// -----------------------------------------------------------------------

	describe('sendConnectedRbtc', () => {
		it('sends RBTC via EVM signer sendTransaction', async () => {
			const params = makeConnectedParams({
				network: 'rootstock-bitcoin',
				amountInSats: 100_000_000 // 1 RBTC = 1e8 sats
			});
			const result = await sendConnectedRbtc(params);
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledWith({
				to: params.recipient,
				value: 100_000_000n * 10n ** 10n, // sats → wei
				chainId: 30
			});
			expect(result.txHash).toBe('0xtxhash123');
		});

		it('uses chainId from getChainIdForNetwork', async () => {
			mockGetChainIdForNetwork.mockReturnValue(31); // testnet
			const params = makeConnectedParams({ network: 'rootstock-bitcoin' });
			await sendConnectedRbtc(params);
			expect(mockGetChainIdForNetwork).toHaveBeenCalledWith('rootstock-bitcoin');
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledWith(
				expect.objectContaining({ chainId: 31 })
			);
		});
	});

	// -----------------------------------------------------------------------
	// sendConnectedUsdtBsc
	// -----------------------------------------------------------------------

	describe('sendConnectedUsdtBsc', () => {
		it('sends USDT (BEP-20) via EVM signer', async () => {
			const params = makeConnectedParams({
				network: 'usdt-bsc',
				amountInUSD: 50.0
			});
			const result = await sendConnectedUsdtBsc(params);
			expect(mockEncodeERC20Transfer).toHaveBeenCalledWith(params.recipient, 50n * 10n ** 18n);
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledWith({
				to: '0xBSCToken',
				data: '0xencoded',
				chainId: 30
			});
			expect(result.txHash).toBe('0xtxhash123');
		});

		it('uses BSC contract address', async () => {
			const params = makeConnectedParams({ network: 'usdt-bsc', amountInUSD: 10.0 });
			await sendConnectedUsdtBsc(params);
			expect(mockGetBSCUSDTContractAddress).toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// sendConnectedUsdtEvm
	// -----------------------------------------------------------------------

	describe('sendConnectedUsdtEvm', () => {
		it('sends USDT on generic EVM chain via EVM signer', async () => {
			const params = makeConnectedParams({
				network: 'usdt-arbitrum',
				amountInUSD: 75.25
			});
			const result = await sendConnectedUsdtEvm(params);
			expect(mockGetUSDTContractAddressForNetwork).toHaveBeenCalledWith('usdt-arbitrum');
			expect(mockGetChainIdForNetwork).toHaveBeenCalledWith('usdt-arbitrum');
			expect(mockEncodeERC20Transfer).toHaveBeenCalled();
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledWith({
				to: '0xUSDToken',
				data: '0xencoded',
				chainId: 30
			});
			expect(result.txHash).toBe('0xtxhash123');
		});

		it('handles usdt-ethereum', async () => {
			const params = makeConnectedParams({ network: 'usdt-ethereum', amountInUSD: 100.0 });
			await sendConnectedUsdtEvm(params);
			expect(mockGetUSDTContractAddressForNetwork).toHaveBeenCalledWith('usdt-ethereum');
		});

		it('handles usdt-polygon', async () => {
			const params = makeConnectedParams({ network: 'usdt-polygon', amountInUSD: 25.0 });
			await sendConnectedUsdtEvm(params);
			expect(mockGetUSDTContractAddressForNetwork).toHaveBeenCalledWith('usdt-polygon');
		});
	});

	// -----------------------------------------------------------------------
	// sendConnectedBitcoin
	// -----------------------------------------------------------------------

	describe('sendConnectedBitcoin', () => {
		it('sends BTC via Bitcoin signer', async () => {
			const params = makeConnectedParams({
				network: 'bitcoin',
				amountInSats: 50000,
				bitcoinSigner: mockBitcoinSigner
			});
			const result = await sendConnectedBitcoin(params);
			expect(mockBitcoinSigner.sendBitcoin).toHaveBeenCalledWith({
				recipient: params.recipient,
				amount: 50000n,
				feeRateSatsPerVbyte: 10
			});
			expect(result.txHash).toBe('0xbtctxhash456');
		});

		it('throws BitcoinSignerNotAvailableError when bitcoinSigner is missing', async () => {
			const params = makeConnectedParams({
				network: 'bitcoin',
				bitcoinSigner: undefined
			});
			await expect(sendConnectedBitcoin(params)).rejects.toThrow('Bitcoin signer not available');
		});

		it('converts amountInSats to BigInt for the signer', async () => {
			const params = makeConnectedParams({
				network: 'bitcoin',
				amountInSats: 1_000_000, // 0.01 BTC
				bitcoinSigner: mockBitcoinSigner
			});
			await sendConnectedBitcoin(params);
			const callArg = mockBitcoinSigner.sendBitcoin.mock.calls[0][0];
			expect(callArg.amount).toBe(1_000_000n);
		});
	});

	// -----------------------------------------------------------------------
	// sendConnectedLightning
	// -----------------------------------------------------------------------

	describe('sendConnectedLightning', () => {
		it('creates submarine swap and locks via EVM signer', async () => {
			const params = makeConnectedParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			const result = await sendConnectedLightning(params);
			expect(mockCreateSubmarineSwap).toHaveBeenCalledWith('lnbc500n1test', 'test payment');
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalled();
			expect(result.txHash).toBe('0xtxhash123');
			expect(result.earlyReturn).toBe(true);
		});

		it('resolves LNURL before creating submarine swap', async () => {
			mockIsLNURL.mockReturnValue(true);
			mockFetchLNURLPayInvoice.mockResolvedValue('lnbc-resolved');
			const params = makeConnectedParams({
				network: 'lightning-bitcoin',
				recipient: 'https://lnurl.example.com/pay',
				parsedPayment: {
					data: { address: 'https://lnurl.example.com/pay' } as never,
					lnurlCallback: 'https://lnurl.example.com/callback'
				}
			});
			await sendConnectedLightning(params);
			expect(mockFetchLNURLPayInvoice).toHaveBeenCalledWith(
				'https://lnurl.example.com/callback',
				expect.any(Number)
			);
		});

		it('sends RBTC to Boltz lockup address', async () => {
			const params = makeConnectedParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			await sendConnectedLightning(params);
			const txCall = mockEvmSigner.sendTransaction.mock.calls[0][0];
			expect(txCall.to).toBe('0xBoltzLockupAddress');
			expect(txCall.value).toBe(50000n);
			expect(txCall.data).toBe('0x');
		});

		it('extracts lockup address from nested swapData.lockupDetails', async () => {
			mockCreateSubmarineSwap.mockResolvedValueOnce({
				swapId: 'swap-nested',
				swapData: {
					lockupDetails: { lockupAddress: '0xNestedLockupAddress' },
					expectedAmount: 25000
				}
			});
			const params = makeConnectedParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			await sendConnectedLightning(params);
			const txCall = mockEvmSigner.sendTransaction.mock.calls[0][0];
			expect(txCall.to).toBe('0xNestedLockupAddress');
		});

		it('throws when lockup address is missing', async () => {
			mockCreateSubmarineSwap.mockResolvedValueOnce({
				swapId: 'swap-no-lockup',
				swapData: { expectedAmount: 10000 }
			});
			const params = makeConnectedParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			await expect(sendConnectedLightning(params)).rejects.toThrow(
				'Could not extract lockup address'
			);
		});

		it('throws when lockup amount is missing', async () => {
			mockCreateSubmarineSwap.mockResolvedValueOnce({
				swapId: 'swap-no-amount',
				swapData: { lockupAddress: '0xLockupAddr' }
			});
			const params = makeConnectedParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			await expect(sendConnectedLightning(params)).rejects.toThrow(
				'Could not extract lockup amount'
			);
		});

		it('returns early with pendingSwapId when lockup tx succeeds', async () => {
			const params = makeConnectedParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			const result = await sendConnectedLightning(params);
			expect(result.earlyReturn).toBe(true);
			expect(result.pendingSwapId).toBe('swap-abc-123');
		});

		it('returns null txHash when evmSigner.sendTransaction returns falsy hash', async () => {
			mockEvmSigner.sendTransaction.mockResolvedValueOnce({
				txHash: '',
				from: '0xaddr',
				chainId: 30
			});
			const params = makeConnectedParams({
				network: 'lightning-bitcoin',
				recipient: 'lnbc500n1test'
			});
			const result = await sendConnectedLightning(params);
			expect(result.txHash).toBeNull();
			expect(result.earlyReturn).toBeUndefined();
		});
	});

	// -----------------------------------------------------------------------
	// Edge cases
	// -----------------------------------------------------------------------

	describe('edge cases', () => {
		it('handles very small USDT amounts (fractional cents)', async () => {
			const params = makeConnectedParams({
				network: 'usdt-bsc',
				amountInUSD: 0.01
			});
			await sendConnectedUsdtBsc(params);
			expect(mockEncodeERC20Transfer).toHaveBeenCalledWith(
				params.recipient,
				10n ** 16n // 0.01 * 1e18
			);
		});

		it('handles zero sats for Bitcoin signer', async () => {
			const params = makeConnectedParams({
				network: 'bitcoin',
				amountInSats: 0,
				bitcoinSigner: mockBitcoinSigner
			});
			await sendConnectedBitcoin(params);
			expect(mockBitcoinSigner.sendBitcoin).toHaveBeenCalledWith(
				expect.objectContaining({ amount: 0n })
			);
		});

		it('handles large amounts for RBTC connected send', async () => {
			const params = makeConnectedParams({
				network: 'rootstock-bitcoin',
				amountInSats: 21_000_000_00_000_000 // 21M BTC
			});
			await sendConnectedRbtc(params);
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledWith(
				expect.objectContaining({
					value: 21_000_000_00_000_000n * 10n ** 10n
				})
			);
		});
	});

	// -------------------------------------------------------------------
	// executeSend orchestrator
	// -------------------------------------------------------------------

	describe('executeSend orchestrator', () => {
		function makeExecuteSendParams(overrides?: Partial<ExecuteSendParams>): ExecuteSendParams {
			return {
				network: 'rootstock-bitcoin',
				recipient: '0xRecipient111111111111111111111111111111111111',
				amountInSats: 100_000,
				amountInUSD: 50.0,
				memo: 'test payment',
				selectedWalletId: 'builtin',
				parsedPayment: { data: null },
				walletManager: {
					sendRBTC: mockSendRBTC,
					sendBSCUSDT: mockSendBSCUSDT,
					createSubmarineSwap: mockCreateSubmarineSwap,
					lockSubmarineSwapFunds: mockLockSubmarineSwapFunds
				} as unknown as ExecuteSendParams['walletManager'],
				route: null,
				sourceWalletId: 'rbtc',
				dest: null,
				...overrides
			};
		}

		beforeEach(() => {
			mockGetHandle.mockReturnValue({
				id: 'wallet-1',
				walletName: 'MetaMask',
				address: '0xConnectedAddr',
				evmSigner: mockEvmSigner,
				bitcoinSigner: mockBitcoinSigner
			});
			mockGetBitcoinSigner.mockReturnValue(mockBitcoinSigner);
			mockGetSwapChainStatus.mockReturnValue({
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: ''
			});
		});

		it('dispatches to correct BUILTIN_HANDLERS entry for built-in wallet', async () => {
			const result = await executeSend(
				makeExecuteSendParams({
					network: 'rootstock-bitcoin',
					selectedWalletId: 'builtin'
				})
			);

			expect(mockSendRBTC).toHaveBeenCalled();
			expect(result.txHash).toBe('0xrbtctx789');
		});

		it('dispatches to lightning builtin handler', async () => {
			const result = await executeSend(
				makeExecuteSendParams({
					network: 'lightning-bitcoin',
					selectedWalletId: 'builtin',
					recipient: 'lnbc500n1test'
				})
			);

			expect(mockCreateSubmarineSwap).toHaveBeenCalled();
			expect(result.pendingSwapId).toBe('swap-abc-123');
			expect(result.earlyReturn).toBe(true);
		});

		it('dispatches to correct CONNECTED_HANDLERS entry for connected wallet', async () => {
			const result = await executeSend(
				makeExecuteSendParams({
					network: 'rootstock-bitcoin',
					selectedWalletId: 'wallet-1'
				})
			);

			expect(mockGetHandle).toHaveBeenCalledWith('wallet-1');
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalled();
			expect(result.txHash).toBe('0xtxhash123');
		});

		it('dispatches connected bitcoin handler', async () => {
			const result = await executeSend(
				makeExecuteSendParams({
					network: 'bitcoin',
					selectedWalletId: 'wallet-1'
				})
			);

			expect(mockGetBitcoinSigner).toHaveBeenCalledWith('wallet-1');
			expect(mockBitcoinSigner.sendBitcoin).toHaveBeenCalled();
			expect(result.txHash).toBe('0xbtctxhash456');
		});

		it('throws for unknown network with built-in wallet', async () => {
			await expect(
				executeSend(
					makeExecuteSendParams({
						network: 'unknown-network',
						selectedWalletId: 'builtin'
					})
				)
			).rejects.toThrow('not yet supported');
		});

		it('throws for unknown network with connected wallet', async () => {
			await expect(
				executeSend(
					makeExecuteSendParams({
						network: 'unknown-network',
						selectedWalletId: 'wallet-1'
					})
				)
			).rejects.toThrow('not yet supported');
		});

		it('propagates handler errors', async () => {
			mockSendRBTC.mockRejectedValueOnce(new Error('insufficient funds'));
			await expect(
				executeSend(
					makeExecuteSendParams({
						network: 'rootstock-bitcoin',
						selectedWalletId: 'builtin'
					})
				)
			).rejects.toThrow('insufficient funds');
		});

		it('calls startSwapChain when route has hops > 1', async () => {
			const mockSwapState = {
				phase: 'SWAP_1_PENDING',
				route: { id: 'route-1', hops: [{}, {}] },
				sourceWallet: 'rbtc',
				destination: { type: 'invoice', network: 'lightning', invoice: 'lnbc...' },
				sourceConnectedWalletId: null,
				amount: '100000',
				swap1Id: null,
				swap2Id: null,
				swap1Details: null,
				swap2Details: null,
				error: null,
				updatedAt: Date.now()
			};
			mockStartSwapChain.mockResolvedValue({ data: mockSwapState, error: null });

			const route = {
				id: 'route-1',
				label: 'RBTC → Lightning',
				hops: [
					{
						service: 'boltz' as const,
						fromAsset: 'RBTC',
						fromChain: 'rsk',
						toAsset: 'BTC',
						toChain: 'lightning',
						feePercent: 0.5,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					},
					{
						service: 'direct' as const,
						fromAsset: 'BTC',
						fromChain: 'lightning',
						toAsset: 'BTC',
						toChain: 'lightning',
						feePercent: 0,
						estimatedTimeMin: 1,
						estimatedTimeMax: 2
					}
				],
				totalFeePercent: 0.5,
				estimatedTime: '10-30 min',
				recommended: true
			};

			const dest = {
				type: 'invoice' as const,
				network: 'lightning' as const,
				invoice: 'lnbc...'
			};

			const result = await executeSend(
				makeExecuteSendParams({
					network: 'lightning-bitcoin',
					selectedWalletId: 'builtin',
					route,
					sourceWalletId: 'rbtc',
					dest
				})
			);

			expect(mockStartSwapChain).toHaveBeenCalledWith(
				route,
				'rbtc',
				dest,
				'100000',
				null // builtin → no connected wallet ID
			);
			expect(result.txHash).toBeNull();
			expect(result.pendingSwapChain).toEqual(mockSwapState);
		});

		it('passes connected wallet ID to startSwapChain for connected source', async () => {
			const mockSwapState = {
				phase: 'SWAP_1_PENDING',
				route: null,
				sourceWallet: null,
				destination: null,
				sourceConnectedWalletId: 'wallet-1',
				amount: '50000',
				swap1Id: null,
				swap2Id: null,
				swap1Details: null,
				swap2Details: null,
				error: null,
				updatedAt: Date.now()
			};
			mockStartSwapChain.mockResolvedValue({ data: mockSwapState, error: null });

			const route = {
				id: 'route-2',
				label: 'Test route',
				hops: [
					{
						service: 'boltz' as const,
						fromAsset: 'RBTC',
						fromChain: 'rsk',
						toAsset: 'BTC',
						toChain: 'lightning',
						feePercent: 0.5,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					},
					{
						service: 'direct' as const,
						fromAsset: 'BTC',
						fromChain: 'lightning',
						toAsset: 'BTC',
						toChain: 'lightning',
						feePercent: 0,
						estimatedTimeMin: 1,
						estimatedTimeMax: 2
					}
				],
				totalFeePercent: 0.5,
				estimatedTime: '10-30 min',
				recommended: true
			};

			const dest = {
				type: 'invoice' as const,
				network: 'lightning' as const,
				invoice: 'lnbc...'
			};

			await executeSend(
				makeExecuteSendParams({
					network: 'lightning-bitcoin',
					selectedWalletId: 'wallet-1',
					route,
					sourceWalletId: 'rbtc',
					dest
				})
			);

			expect(mockStartSwapChain).toHaveBeenCalledWith(
				route,
				'rbtc',
				dest,
				'100000',
				'wallet-1' // connected wallet ID
			);
		});

		it('throws when swap chain returns error', async () => {
			mockStartSwapChain.mockResolvedValue({
				data: null,
				error: new Error('Swap chain failed: timeout')
			});

			const route = {
				id: 'route-err',
				label: 'Test',
				hops: [
					{
						service: 'boltz' as const,
						fromAsset: 'RBTC',
						fromChain: 'rsk',
						toAsset: 'BTC',
						toChain: 'lightning',
						feePercent: 0.5,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					},
					{
						service: 'direct' as const,
						fromAsset: 'BTC',
						fromChain: 'lightning',
						toAsset: 'BTC',
						toChain: 'lightning',
						feePercent: 0,
						estimatedTimeMin: 1,
						estimatedTimeMax: 2
					}
				],
				totalFeePercent: 0.5,
				estimatedTime: '10-30 min',
				recommended: true
			};

			await expect(
				executeSend(
					makeExecuteSendParams({
						selectedWalletId: 'builtin',
						route,
						sourceWalletId: 'rbtc',
						dest: { type: 'invoice' as const, network: 'lightning' as const, invoice: 'lnbc...' }
					})
				)
			).rejects.toThrow('Swap chain failed: timeout');
		});

		it('throws when swap chain status is failed', async () => {
			const failedState = {
				phase: 'FAILED',
				route: null,
				sourceWallet: null,
				destination: null,
				sourceConnectedWalletId: null,
				amount: '100000',
				swap1Id: null,
				swap2Id: null,
				swap1Details: null,
				swap2Details: null,
				error: 'Hop execution failed',
				updatedAt: Date.now()
			};
			mockStartSwapChain.mockResolvedValue({ data: failedState, error: null });
			mockGetSwapChainStatus.mockReturnValue({
				isActive: false,
				isComplete: false,
				isFailed: true,
				isPartial: false,
				message: 'Hop execution failed'
			});

			const route = {
				id: 'route-fail',
				label: 'Test',
				hops: [
					{
						service: 'boltz' as const,
						fromAsset: 'RBTC',
						fromChain: 'rsk',
						toAsset: 'BTC',
						toChain: 'lightning',
						feePercent: 0.5,
						estimatedTimeMin: 10,
						estimatedTimeMax: 30
					},
					{
						service: 'direct' as const,
						fromAsset: 'BTC',
						fromChain: 'lightning',
						toAsset: 'BTC',
						toChain: 'lightning',
						feePercent: 0,
						estimatedTimeMin: 1,
						estimatedTimeMax: 2
					}
				],
				totalFeePercent: 0.5,
				estimatedTime: '10-30 min',
				recommended: true
			};

			await expect(
				executeSend(
					makeExecuteSendParams({
						selectedWalletId: 'builtin',
						route,
						sourceWalletId: 'rbtc',
						dest: { type: 'invoice' as const, network: 'lightning' as const, invoice: 'lnbc...' }
					})
				)
			).rejects.toThrow('Hop execution failed');
		});

		it('throws EVMSignerNotAvailableError when evmSigner is missing', async () => {
			mockGetHandle.mockReturnValue({
				id: 'wallet-1',
				walletName: 'Trezor',
				address: '0xAddr',
				evmSigner: undefined,
				bitcoinSigner: mockBitcoinSigner
			});

			await expect(
				executeSend(
					makeExecuteSendParams({
						network: 'rootstock-bitcoin',
						selectedWalletId: 'wallet-1'
					})
				)
			).rejects.toThrow('EVM signer not available');
		});

		it('does not enter swap-chain path when route has only 1 hop', async () => {
			const result = await executeSend(
				makeExecuteSendParams({
					network: 'rootstock-bitcoin',
					selectedWalletId: 'builtin',
					route: {
						id: 'single-hop',
						label: 'Direct',
						hops: [
							{
								service: 'direct',
								fromAsset: 'RBTC',
								fromChain: 'rsk',
								toAsset: 'RBTC',
								toChain: 'rsk',
								feePercent: 0,
								estimatedTimeMin: 1,
								estimatedTimeMax: 2
							}
						],
						totalFeePercent: 0,
						estimatedTime: '1-2 min',
						recommended: true
					}
				})
			);

			// Should fall through to the built-in handler, not swap chain
			expect(mockStartSwapChain).not.toHaveBeenCalled();
			expect(mockSendRBTC).toHaveBeenCalled();
			expect(result.txHash).toBe('0xrbtctx789');
		});

		it('does not enter swap-chain path when route is null', async () => {
			const result = await executeSend(
				makeExecuteSendParams({
					network: 'rootstock-bitcoin',
					selectedWalletId: 'builtin',
					route: null
				})
			);

			expect(mockStartSwapChain).not.toHaveBeenCalled();
			expect(result.txHash).toBe('0xrbtctx789');
		});
	});
});
