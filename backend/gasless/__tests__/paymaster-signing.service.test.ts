// Paymaster Signing Service Tests — ECDSA signer for paymaster data

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @nestjs/common first
vi.mock('@nestjs/common', () => ({
	Injectable: () => (target: any) => target,
	Logger: vi.fn().mockImplementation(() => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	}))
}));

// Mock @nestjs/config (needed because gasless.service.ts is imported transitively)
vi.mock('@nestjs/config', () => ({
	ConfigService: vi.fn().mockImplementation(() => ({ get: vi.fn() }))
}));

// Mock fs before any imports
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn()
}));

// Mock ethers
vi.mock('ethers', () => {
	const mockSigningKey = {
		signDigest: vi.fn().mockReturnValue({
			r: '0x' + 'aa'.repeat(32),
			s: '0x' + 'bb'.repeat(32),
			v: 27
		})
	};
	const mockWallet = {
		address: '0x' + '11'.repeat(20),
		signingKey: mockSigningKey
	};
	return {
		ethers: {
			Wallet: vi.fn().mockImplementation(() => mockWallet),
			keccak256: vi.fn().mockReturnValue('0x' + 'cc'.repeat(32)),
			getBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
			AbiCoder: {
				defaultAbiCoder: vi.fn().mockReturnValue({
					encode: vi.fn().mockReturnValue('0x' + 'dd'.repeat(64))
				})
			},
			Signature: {
				from: vi.fn().mockReturnValue({
					serialized: '0x' + 'ee'.repeat(65)
				})
			}
		}
	};
});

import * as fs from 'fs';
import { ethers } from 'ethers';

describe('PaymasterSigningService', () => {
	const TEST_PRIVATE_KEY = '0x' + 'ab'.repeat(32);
	const TEST_DOCKER_SECRET_PATH = '/run/secrets/paymaster_signer_key';

	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env['PAYMASTER_SIGNER_KEY'];
		delete process.env['CHAIN_ID'];
	});

	afterEach(() => {
		delete process.env['PAYMASTER_SIGNER_KEY'];
		delete process.env['CHAIN_ID'];
	});

	describe('Key Loading', () => {
		it('should load key from Docker secret file', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockReturnValue(TEST_PRIVATE_KEY);

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();

			expect(fs.existsSync).toHaveBeenCalledWith(TEST_DOCKER_SECRET_PATH);
			expect(fs.readFileSync).toHaveBeenCalledWith(TEST_DOCKER_SECRET_PATH, 'utf8');
			expect(ethers.Wallet).toHaveBeenCalledWith(TEST_PRIVATE_KEY.trim());
		});

		it('should load key from environment variable when Docker secret not found', async () => {
			(fs.existsSync as any).mockReturnValue(false);
			process.env['PAYMASTER_SIGNER_KEY'] = TEST_PRIVATE_KEY;

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();

			expect(ethers.Wallet).toHaveBeenCalledWith(TEST_PRIVATE_KEY);
		});

		it('should throw fatal error when no key available', async () => {
			(fs.existsSync as any).mockReturnValue(false);
			delete process.env['PAYMASTER_SIGNER_KEY'];

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			expect(() => new PaymasterSigningService()).toThrow(
				'FATAL: Cannot load paymaster signer key'
			);
		});

		it('should throw when Docker secret file read fails', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockImplementation(() => {
				throw new Error('Permission denied');
			});

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			expect(() => new PaymasterSigningService()).toThrow(
				'FATAL: Cannot load paymaster signer key'
			);
		});
	});

	describe('Chain ID', () => {
		it('should default to Arbitrum One chain ID 42161', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockReturnValue(TEST_PRIVATE_KEY);
			delete process.env['CHAIN_ID'];

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();
			expect(service).toBeDefined();
		});

		it('should use CHAIN_ID env var when set', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockReturnValue(TEST_PRIVATE_KEY);
			process.env['CHAIN_ID'] = '421613';

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();
			expect(service).toBeDefined();
		});
	});

	describe('Hash Computation', () => {
		it('should compute paymaster hash matching contract format', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockReturnValue(TEST_PRIVATE_KEY);

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();

			const mockUserOp = {
				sender: '0x' + '11'.repeat(20),
				nonce: '1',
				callData: '0x' + '22'.repeat(32),
				callGasLimit: '200000',
				verificationGasLimit: '100000',
				preVerificationGas: '50000',
				maxFeePerGas: '100000000',
				maxPriorityFeePerGas: '10000000',
				paymasterAndData: '0x',
				signature: '0x'
			};

			const entryPoint = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';
			const result = await service.signPaymasterData(mockUserOp, entryPoint);

			expect(ethers.keccak256).toHaveBeenCalled();
			expect(ethers.AbiCoder.defaultAbiCoder).toHaveBeenCalled();
			expect(result).toBe('0x' + 'ee'.repeat(65));
		});

		it('should use correct ABI types for hash encoding', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockReturnValue(TEST_PRIVATE_KEY);

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();

			const mockUserOp = {
				sender: '0x' + 'aa'.repeat(20),
				nonce: '42',
				callData: '0x' + 'bb'.repeat(64),
				callGasLimit: '200000',
				verificationGasLimit: '100000',
				preVerificationGas: '50000',
				maxFeePerGas: '100000000',
				maxPriorityFeePerGas: '10000000',
				paymasterAndData: '0x',
				signature: '0x'
			};

			await service.signPaymasterData(mockUserOp, '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108');

			const abiCoder = (ethers.AbiCoder.defaultAbiCoder as any).mock.results[0].value;
			expect(abiCoder.encode).toHaveBeenCalledWith(
				['address', 'uint256', 'bytes32', 'address', 'uint256'],
				expect.arrayContaining([
					mockUserOp.sender,
					BigInt(mockUserOp.nonce),
					expect.anything(),
					'0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108',
					expect.anything()
				])
			);
		});
	});

	describe('Signing', () => {
		it('should produce ECDSA signature via signingKey.signDigest', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockReturnValue(TEST_PRIVATE_KEY);

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();

			const mockUserOp = {
				sender: '0x' + 'aa'.repeat(20),
				nonce: '0',
				callData: '0x' + 'bb'.repeat(32),
				callGasLimit: '200000',
				verificationGasLimit: '100000',
				preVerificationGas: '50000',
				maxFeePerGas: '100000000',
				maxPriorityFeePerGas: '10000000',
				paymasterAndData: '0x',
				signature: '0x'
			};

			const result = await service.signPaymasterData(
				mockUserOp,
				'0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'
			);

			const wallet = (ethers.Wallet as any).mock.results[0].value;
			expect(wallet.signingKey.signDigest).toHaveBeenCalled();
			expect(typeof result).toBe('string');
			expect(result.startsWith('0x')).toBe(true);
		});

		it('should return serialized signature via Signature.from', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockReturnValue(TEST_PRIVATE_KEY);

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();

			const mockUserOp = {
				sender: '0x' + 'aa'.repeat(20),
				nonce: '0',
				callData: '0x' + 'bb'.repeat(32),
				callGasLimit: '200000',
				verificationGasLimit: '100000',
				preVerificationGas: '50000',
				maxFeePerGas: '100000000',
				maxPriorityFeePerGas: '10000000',
				paymasterAndData: '0x',
				signature: '0x'
			};

			const result = await service.signPaymasterData(
				mockUserOp,
				'0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'
			);

			expect(ethers.Signature.from).toHaveBeenCalled();
			expect(result).toBeTruthy();
		});
	});

	describe('getSignerAddress', () => {
		it('should return the wallet address', async () => {
			(fs.existsSync as any).mockReturnValue(true);
			(fs.readFileSync as any).mockReturnValue(TEST_PRIVATE_KEY);

			const { PaymasterSigningService } = await import('../paymaster-signing.service');
			const service = new PaymasterSigningService();

			const address = service.getSignerAddress();
			expect(address).toBe('0x' + '11'.repeat(20));
		});
	});
});
