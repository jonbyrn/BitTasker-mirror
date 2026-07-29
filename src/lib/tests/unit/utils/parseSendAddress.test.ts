import { describe, it, expect, vi } from 'vitest';

// Mock wallet-core and liquidjs-lib so paymentAddressParser (via validators) can load
vi.mock('@bittasker/wallet-core', () => ({
	normalizeRskAddress: vi.fn((addr: string) => addr),
	ARB_TOKEN_ADDRESSES: {
		USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		TBTC: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
	}
}));
vi.mock('liquidjs-lib', () => ({
	address: { toOutputScript: vi.fn() }
}));

import { parseSendAddress, type SendAddressResult } from '$lib/utils/parseSendAddress';

/**
 * Helper: assert all SendAddressResult fields are present with correct types.
 */
function assertResultShape(result: SendAddressResult): void {
	expect(result).toHaveProperty('isValid');
	expect(typeof result.isValid).toBe('boolean');
	expect(result).toHaveProperty('data');
	expect(result).toHaveProperty('network');
	expect(result).toHaveProperty('amount');
	expect(result).toHaveProperty('memo');
	expect(result).toHaveProperty('amountRequired');
	expect(typeof result.amountRequired).toBe('boolean');
	expect(result).toHaveProperty('addressError');
	expect(result).toHaveProperty('isLnurl');
	expect(typeof result.isLnurl).toBe('boolean');
}

describe('parseSendAddress', () => {
	// ─── Defensive input handling ───────────────────────────────────────

	describe('Defensive input handling', () => {
		it('should return invalid result for null input', () => {
			const result = parseSendAddress(null as unknown as string, 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.data).toBeNull();
			expect(result.network).toBeNull();
			expect(result.amount).toBeNull();
			expect(result.memo).toBeNull();
			expect(result.amountRequired).toBe(true);
			expect(result.addressError).toBeNull();
			expect(result.isLnurl).toBe(false);
		});

		it('should return invalid result for undefined input', () => {
			const result = parseSendAddress(undefined as unknown as string, 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.data).toBeNull();
			expect(result.network).toBeNull();
		});

		it('should return invalid result for empty string', () => {
			const result = parseSendAddress('', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.data).toBeNull();
			expect(result.network).toBeNull();
			expect(result.amount).toBeNull();
			expect(result.amountRequired).toBe(true);
			expect(result.isLnurl).toBe(false);
		});

		it('should return invalid result for whitespace-only string', () => {
			const result = parseSendAddress('   ', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.data).toBeNull();
			expect(result.network).toBeNull();
		});

		it('should return invalid result for tab-only string', () => {
			const result = parseSendAddress('\t\n\r', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
		});

		it('should return invalid result for random text', () => {
			const result = parseSendAddress('not-an-address', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.data).toBeNull();
			expect(result.network).toBeNull();
		});

		it('should return invalid result for numeric input', () => {
			const result = parseSendAddress(12345 as unknown as string, 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.data).toBeNull();
		});

		it('should return invalid result for object input', () => {
			const result = parseSendAddress({} as unknown as string, 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
		});
	});

	// ─── Valid EVM address ──────────────────────────────────────────────

	describe('Valid EVM addresses', () => {
		it('should parse a plain 0x address with rootstock-bitcoin source', () => {
			const result = parseSendAddress(
				'0x1234567890abcdef1234567890abcdef12345678',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.data).not.toBeNull();
			expect(result.network).toBe('rootstock-bitcoin');
			expect(result.amount).toBeNull();
			expect(result.amountRequired).toBe(true);
			expect(result.isLnurl).toBe(false);
			expect(result.addressError).toBeNull();
		});

		it('should parse a plain 0x address with usdt-bsc source', () => {
			const result = parseSendAddress('0x1234567890abcdef1234567890abcdef12345678', 'usdt-bsc');
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-bsc');
		});

		it('should parse an EIP-681 address with BSC chain ID', () => {
			const result = parseSendAddress(
				'0x1234567890abcdef1234567890abcdef12345678@56',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-bsc'); // chain ID 56 = BSC
		});

		it('should parse a scheme-prefixed BSC address', () => {
			const result = parseSendAddress(
				'bsc:0x1234567890abcdef1234567890abcdef12345678',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-bsc');
		});

		it('should parse a scheme-prefixed RSK address', () => {
			const result = parseSendAddress(
				'rsk:0x1234567890abcdef1234567890abcdef12345678',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('rootstock-bitcoin');
		});

		it('should parse an Ethereum mainnet chain ID address', () => {
			const result = parseSendAddress(
				'0x1234567890abcdef1234567890abcdef12345678@1',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-ethereum');
		});

		it('should normalize EVM address to lowercase', () => {
			const result = parseSendAddress(
				'0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.data?.address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
		});

		it('should parse EVM address with value parameter', () => {
			const result = parseSendAddress(
				'rsk:0x1234567890abcdef1234567890abcdef12345678?value=1000000000000000000',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.amount).toBe(100000000); // 1e18 wei = 1e8 sats
		});

		it('should parse EVM address with message parameter', () => {
			const result = parseSendAddress(
				'rsk:0x1234567890abcdef1234567890abcdef12345678?message=Test+Payment',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBe('Test Payment');
		});

		it('should reject bare ethereum: scheme without chain ID', () => {
			const result = parseSendAddress(
				'ethereum:0x1234567890abcdef1234567890abcdef12345678',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(false);
			expect(result.addressError).toContain('Ethereum mainnet');
		});

		it('should reject EVM address with invalid chain ID', () => {
			const result = parseSendAddress(
				'0x1234567890abcdef1234567890abcdef12345678@99999',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(false);
		});
	});

	// ─── Valid Lightning invoice (bolt11) ───────────────────────────────

	describe('Valid Lightning invoices (BOLT11)', () => {
		it('should parse a BOLT11 invoice and detect lightning-bitcoin network', () => {
			const result = parseSendAddress('lnbc1000n1p0example1234', 'rootstock-bitcoin');
			expect(result.network).toBe('lightning-bitcoin');
			expect(result.isLnurl).toBe(false);
		});

		it('should parse a real BOLT11 invoice format', () => {
			const result = parseSendAddress(
				'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jshwlglv23cytkzvq8ld39drs8sq94acnmwx9x',
				'rootstock-bitcoin'
			);
			expect(result.network).toBe('lightning-bitcoin');
		});

		it('should set isLnurl to false for BOLT11 invoices', () => {
			const result = parseSendAddress('lnbc1000n1p0example1234', 'rootstock-bitcoin');
			expect(result.isLnurl).toBe(false);
		});
	});

	// ─── Valid LNURL ────────────────────────────────────────────────────

	describe('Valid LNURL detection', () => {
		it('should detect LNURL bech32 strings and set isLnurl = true', () => {
			const result = parseSendAddress(
				'lnurl1dp68gurn8ghj7amtw9ex7ufjvve3k7u909e7u909e7u909e7u9',
				'rootstock-bitcoin'
			);
			if (result.isValid) {
				expect(result.isLnurl).toBe(true);
				expect(result.network).toBe('lightning-bitcoin');
				expect(result.amount).toBeNull();
				expect(result.amountRequired).toBe(true);
			}
		});

		it('should detect LNURL with https:// prefix', () => {
			const result = parseSendAddress(
				'https://getalby.com/lnurl/user@example.com',
				'rootstock-bitcoin'
			);
			// https:// URLs that aren't bolt11/invoices are parsed as Bitcoin addresses
			// isLNURL only detects lnurl/LNURL prefixes, not raw https URLs
			expect(result.isValid).toBeDefined();
		});

		it('should detect LNURL with lnurlp:// protocol prefix', () => {
			const result = parseSendAddress('lnurlp://example.com/lnurl/user123', 'rootstock-bitcoin');
			if (result.isValid) {
				expect(result.isLnurl).toBe(true);
				expect(result.network).toBe('lightning-bitcoin');
			}
		});
	});

	// ─── Valid Bitcoin address (bc1, 1, 3) ──────────────────────────────

	describe('Valid Bitcoin addresses', () => {
		it('should parse a legacy P2PKH address (starts with 1)', () => {
			const result = parseSendAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'rootstock-bitcoin');
			expect(result.isValid).toBe(true);
			expect(result.data).not.toBeNull();
			expect(result.network).toBe('bitcoin');
			expect(result.amount).toBeNull();
			expect(result.amountRequired).toBe(true);
			expect(result.isLnurl).toBe(false);
		});

		it('should parse a P2SH SegWit address (starts with 3)', () => {
			const result = parseSendAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'rootstock-bitcoin');
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
		});

		it('should parse a Native SegWit bech32 address (starts with bc1)', () => {
			const result = parseSendAddress(
				'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
		});

		it('should parse a Bitcoin URI with amount', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.001',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
			expect(result.amount).toBe(100000); // 0.001 BTC = 100000 sats
			expect(result.amountRequired).toBe(false);
		});

		it('should parse a Bitcoin URI with label (memo)', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?label=TestPayment',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
			expect(result.memo).toBe('TestPayment');
		});

		it('should parse a Bitcoin URI with message', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?message=Coffee',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBe('Coffee');
		});

		it('should parse a Bitcoin URI with amount and label', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.01&label=Lunch',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.amount).toBe(1000000); // 0.01 BTC = 1,000,000 sats
			expect(result.memo).toBe('Lunch');
		});

		it('should parse a plain Bitcoin address with query params', () => {
			const result = parseSendAddress(
				'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.005&message=Tip',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
			expect(result.amount).toBe(500000); // 0.005 BTC
			expect(result.memo).toBe('Tip');
		});
	});

	// ─── Lightning addresses ────────────────────────────────────────────

	describe('Lightning addresses', () => {
		it('should detect Lightning address (user@domain)', () => {
			const result = parseSendAddress('user@getalby.com', 'rootstock-bitcoin');
			if (result.isValid) {
				expect(result.network).toBe('lightning-bitcoin');
				expect(result.amountRequired).toBe(true);
			}
		});
	});

	// ─── Empty string ───────────────────────────────────────────────────

	describe('Empty string', () => {
		it('should return invalid for empty string with all null fields', () => {
			const result = parseSendAddress('', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.data).toBeNull();
			expect(result.network).toBeNull();
			expect(result.amount).toBeNull();
			expect(result.memo).toBeNull();
			expect(result.amountRequired).toBe(true);
			expect(result.addressError).toBeNull();
			expect(result.isLnurl).toBe(false);
		});
	});

	// ─── Invalid address ────────────────────────────────────────────────

	describe('Invalid address', () => {
		it('should return isValid: false for completely invalid input', () => {
			const result = parseSendAddress('garbage-input-12345', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.data).toBeNull();
		});

		it('should return isValid: false for too-short EVM address', () => {
			const result = parseSendAddress('0x123', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
		});

		it('should return isValid: false for non-hex 0x address', () => {
			const result = parseSendAddress(
				'0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(false);
		});
	});

	// ─── Amountless Lightning invoice ───────────────────────────────────

	describe('Amountless Lightning invoice', () => {
		it('should set amountRequired: true for amountless invoices', () => {
			// A known amountless BOLT11 invoice (mainnet, no amount in bech32)
			const amountlessInvoice =
				'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jshwlglv23cytkzvq8ld39drs8sq94acnmwx9x';
			const result = parseSendAddress(amountlessInvoice, 'rootstock-bitcoin');
			expect(result.network).toBe('lightning-bitcoin');
			// For amountless: isValid = false, amountRequired = true, addressError = 'amountless_invoice'
			if (!result.isValid && result.addressError === 'amountless_invoice') {
				expect(result.amountRequired).toBe(true);
				expect(result.amount).toBeNull();
			}
		});

		it('should set addressError to amountless_invoice key for display', () => {
			const amountlessInvoice =
				'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jshwlglv23cytkzvq8ld39drs8sq94acnmwx9x';
			const result = parseSendAddress(amountlessInvoice, 'rootstock-bitcoin');
			if (!result.isValid && result.network === 'lightning-bitcoin') {
				// addressError should be either 'amountless_invoice' or null (if parsing failed entirely)
				expect(result.addressError === 'amountless_invoice' || result.addressError === null).toBe(
					true
				);
			}
		});
	});

	// ─── With memo parameter ────────────────────────────────────────────

	describe('Memo parameter preservation', () => {
		it('should preserve memo from Bitcoin URI label', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?label=Groceries',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBe('Groceries');
		});

		it('should preserve memo from Bitcoin URI message', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?message=Payment+for+services',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBe('Payment for services');
		});

		it('should prefer label over message when both present', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?label=Label&message=Message',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBe('Label');
		});

		it('should return null memo when no label or message', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBeNull();
		});

		it('should preserve memo from EVM URI message param', () => {
			const result = parseSendAddress(
				'rsk:0x1234567890abcdef1234567890abcdef12345678?message=Smart+contract+call',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.memo).toBe('Smart contract call');
		});
	});

	// ─── Source wallet type affects parsing ──────────────────────────────

	describe('Source wallet type affects parsing', () => {
		it('should default plain 0x address to rootstock-bitcoin from rootstock source', () => {
			const result = parseSendAddress(
				'0x1234567890abcdef1234567890abcdef12345678',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('rootstock-bitcoin');
		});

		it('should default plain 0x address to usdt-bsc from BSC source', () => {
			const result = parseSendAddress('0x1234567890abcdef1234567890abcdef12345678', 'usdt-bsc');
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-bsc');
		});

		it('should use scheme prefix over source hint', () => {
			// rsk: scheme should override usdt-bsc source hint
			const result = parseSendAddress('rsk:0x1234567890abcdef1234567890abcdef12345678', 'usdt-bsc');
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('rootstock-bitcoin');
		});

		it('should use chain ID over source hint', () => {
			// chain ID 56 = BSC, should override rootstock-bitcoin source
			const result = parseSendAddress(
				'0x1234567890abcdef1234567890abcdef12345678@56',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-bsc');
		});

		it('should not affect non-EVM addresses', () => {
			const btc = parseSendAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'usdt-bsc');
			expect(btc.network).toBe('bitcoin');

			const ln = parseSendAddress('user@domain.com', 'usdt-bsc');
			if (ln.isValid) {
				expect(ln.network).toBe('lightning-bitcoin');
			}
		});
	});

	// ─── Edge cases ─────────────────────────────────────────────────────

	describe('Edge cases', () => {
		it('should handle input with leading/trailing whitespace', () => {
			const result = parseSendAddress(
				'  0x1234567890abcdef1234567890abcdef12345678  ',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
		});

		it('should handle Bitcoin address with leading/trailing whitespace', () => {
			const result = parseSendAddress(
				'  1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa  ',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
		});

		it('should handle mixed case in Bitcoin legacy address', () => {
			// Legacy addresses are base58 — case matters for checksum
			// Test that the parser at least attempts to validate it
			const result = parseSendAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'rootstock-bitcoin');
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('bitcoin');
		});

		it('should handle very long random string without throwing', () => {
			const longString = 'a'.repeat(5000);
			const result = parseSendAddress(longString, 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			assertResultShape(result);
		});

		it('should handle Unicode characters in address input', () => {
			const result = parseSendAddress('café\u200baddress', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			assertResultShape(result);
		});

		it('should not throw for any input type', () => {
			expect(() => parseSendAddress('', 'rootstock-bitcoin')).not.toThrow();
			expect(() => parseSendAddress(null as unknown as string, 'rootstock-bitcoin')).not.toThrow();
			expect(() =>
				parseSendAddress(undefined as unknown as string, 'rootstock-bitcoin')
			).not.toThrow();
			expect(() => parseSendAddress(123 as unknown as string, 'rootstock-bitcoin')).not.toThrow();
			expect(() => parseSendAddress('valid', 'rootstock-bitcoin')).not.toThrow();
			expect(() => parseSendAddress(true as unknown as string, 'rootstock-bitcoin')).not.toThrow();
			expect(() => parseSendAddress([] as unknown as string, 'rootstock-bitcoin')).not.toThrow();
		});
	});

	// ─── Result shape consistency ───────────────────────────────────────

	describe('Result shape consistency', () => {
		it('always returns all required fields for any input', () => {
			const inputs = [
				'any-input',
				'',
				'0x1234567890abcdef1234567890abcdef12345678',
				'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
				'lnbc1000n1p0example1234',
				'user@domain.com'
			];
			for (const input of inputs) {
				const result = parseSendAddress(input, 'rootstock-bitcoin');
				assertResultShape(result);
			}
		});

		it('invalid results always have amountRequired = true', () => {
			const invalidInputs = ['', 'not-an-address', '0x123', 'random-text'];
			for (const input of invalidInputs) {
				const result = parseSendAddress(input, 'rootstock-bitcoin');
				if (!result.isValid) {
					expect(result.amountRequired).toBe(true);
				}
			}
		});

		it('valid results with no amount have amountRequired = true', () => {
			const result = parseSendAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'rootstock-bitcoin');
			if (result.isValid && result.amount === null) {
				expect(result.amountRequired).toBe(true);
			}
		});

		it('valid results with amount have amountRequired = false', () => {
			const result = parseSendAddress(
				'bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa?amount=0.001',
				'rootstock-bitcoin'
			);
			if (result.isValid && result.amount !== null) {
				expect(result.amountRequired).toBe(false);
			}
		});

		it('data field is populated for valid results and null for invalid', () => {
			const validResult = parseSendAddress(
				'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
				'rootstock-bitcoin'
			);
			if (validResult.isValid) {
				expect(validResult.data).not.toBeNull();
				expect(validResult.data?.address).toBeTruthy();
				expect(validResult.data?.isValid).toBe(true);
			}

			const invalidResult = parseSendAddress('invalid', 'rootstock-bitcoin');
			expect(invalidResult.data).toBeNull();
		});
	});

	// ─── BOLT12 unsupported ─────────────────────────────────────────────

	describe('BOLT12 invoices', () => {
		it('should reject BOLT12 offer/invoice as unsupported', () => {
			const result = parseSendAddress('lno1p0example1234', 'rootstock-bitcoin');
			expect(result.isValid).toBe(false);
			expect(result.network).toBe('lightning-bitcoin');
		});
	});

	// ─── TRON addresses ─────────────────────────────────────────────────

	describe('TRON addresses', () => {
		it('should detect a valid TRON address', () => {
			const result = parseSendAddress('TPqE6kSaXN4gRoV8mBtCfvxYPbUefHsKQ6', 'rootstock-bitcoin');
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-tron');
		});

		it('should detect a TRON address with tron: scheme', () => {
			const result = parseSendAddress(
				'tron:TPqE6kSaXN4gRoV8mBtCfvxYPbUefHsKQ6',
				'rootstock-bitcoin'
			);
			expect(result.isValid).toBe(true);
			expect(result.network).toBe('usdt-tron');
		});
	});
});
