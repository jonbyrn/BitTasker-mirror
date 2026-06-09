// Preflight Simulation Service Tests

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@nestjs/config', () => ({
	ConfigService: vi.fn().mockImplementation(() => ({ get: vi.fn() }))
}));

vi.mock('@nestjs/common', () => ({
	Injectable: () => (target: any) => target,
	BadRequestException: class BadRequestException extends Error {
		constructor(message: string) {
			super(message);
			this.name = 'BadRequestException';
		}
	},
	Logger: vi.fn().mockImplementation(() => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('ethers', () => {
	const mockStaticCall = vi.fn();
	return {
		ethers: {
			JsonRpcProvider: vi.fn().mockImplementation(() => ({})),
			Contract: vi.fn().mockImplementation(() => ({
				simulateValidation: { staticCall: mockStaticCall }
			}))
		},
		__mockStaticCall: mockStaticCall
	};
});

vi.mock('../gasless.config', () => ({
	ENTRY_POINT_ADDRESS: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'
}));

import { ethers } from 'ethers';
const { __mockStaticCall: mockStaticCall } = (await import('ethers')) as any;

describe('PreflightSimulationService', () => {
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

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Successful Simulation', () => {
		it('should resolve when staticCall succeeds', async () => {
			mockStaticCall.mockResolvedValue([
				21000n,
				100000000000000n,
				false,
				'0x' + 'cc'.repeat(20),
				0n
			]);
			const { PreflightSimulationService } = await import('../preflight-simulation.service');
			const service = new PreflightSimulationService();
			await expect(service.simulate(mockUserOp)).resolves.toBeUndefined();
			expect(mockStaticCall).toHaveBeenCalledTimes(1);
		});
	});

	describe('Failed Simulation', () => {
		it('should throw BadRequestException when staticCall throws', async () => {
			mockStaticCall.mockRejectedValue(new Error('execution reverted'));
			const { PreflightSimulationService } = await import('../preflight-simulation.service');
			const service = new PreflightSimulationService();
			await expect(service.simulate(mockUserOp)).rejects.toThrow('UserOp simulation failed');
		});

		it('should parse revert reason from error data', async () => {
			const revertError = new Error('execution reverted');
			(revertError as any).data =
				'0x08c379a0' + Buffer.from('Insufficient balance').toString('hex').padStart(128, '0');
			mockStaticCall.mockRejectedValue(revertError);
			const { PreflightSimulationService } = await import('../preflight-simulation.service');
			const service = new PreflightSimulationService();
			await expect(service.simulate(mockUserOp)).rejects.toThrow();
		});

		it('should handle error.reason field', async () => {
			const revertError = new Error('execution reverted');
			(revertError as any).reason = 'Invalid signature';
			mockStaticCall.mockRejectedValue(revertError);
			const { PreflightSimulationService } = await import('../preflight-simulation.service');
			const service = new PreflightSimulationService();
			await expect(service.simulate(mockUserOp)).rejects.toThrow('Invalid signature');
		});

		it('should handle error.message with revert reason string', async () => {
			const revertError = new Error("VM Exception: reverted with reason string 'Nonce too high'");
			mockStaticCall.mockRejectedValue(revertError);
			const { PreflightSimulationService } = await import('../preflight-simulation.service');
			const service = new PreflightSimulationService();
			await expect(service.simulate(mockUserOp)).rejects.toThrow('Nonce too high');
		});

		it('should return Unknown error when no reason found', async () => {
			mockStaticCall.mockRejectedValue({});
			const { PreflightSimulationService } = await import('../preflight-simulation.service');
			const service = new PreflightSimulationService();
			await expect(service.simulate(mockUserOp)).rejects.toThrow('Unknown error');
		});
	});

	describe('UserOp Conversion', () => {
		it('should convert string nonce to BigInt', async () => {
			mockStaticCall.mockResolvedValue([21000n, 0n, false, '0x' + '00'.repeat(20), 0n]);
			const { PreflightSimulationService } = await import('../preflight-simulation.service');
			const service = new PreflightSimulationService();
			await service.simulate({ ...mockUserOp, nonce: '42' });
			expect(mockStaticCall.mock.calls[0][0].nonce).toBe(42n);
		});

		it('should convert string gas limits to BigInt', async () => {
			mockStaticCall.mockResolvedValue([21000n, 0n, false, '0x' + '00'.repeat(20), 0n]);
			const { PreflightSimulationService } = await import('../preflight-simulation.service');
			const service = new PreflightSimulationService();
			await service.simulate(mockUserOp);
			const called = mockStaticCall.mock.calls[0][0];
			expect(called.callGasLimit).toBe(200000n);
			expect(called.verificationGasLimit).toBe(100000n);
			expect(called.preVerificationGas).toBe(50000n);
			expect(called.maxFeePerGas).toBe(100000000n);
			expect(called.maxPriorityFeePerGas).toBe(10000000n);
		});
	});
});
