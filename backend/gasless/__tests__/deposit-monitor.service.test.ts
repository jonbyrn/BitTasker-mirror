// Deposit Monitor Service Tests — Paymaster deposit health monitoring

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
	Injectable: () => (target: any) => target,
	Logger: vi.fn().mockImplementation(() => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('ethers', () => {
	const mockBalanceOf = vi.fn();
	return {
		ethers: {
			JsonRpcProvider: vi.fn().mockImplementation(() => ({})),
			Contract: vi.fn().mockImplementation(() => ({
				balanceOf: mockBalanceOf
			})),
			parseEther: vi.fn((val: string) => BigInt(Math.round(parseFloat(val) * 1e18))),
			formatEther: vi.fn((val: bigint) => (Number(val) / 1e18).toString())
		},
		__mockBalanceOf: mockBalanceOf
	};
});

vi.mock('../gasless.config', () => ({
	ENTRY_POINT_ADDRESS: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'
}));

import { ethers } from 'ethers';
const { __mockBalanceOf: mockBalanceOf } = (await import('ethers')) as any;

describe('DepositMonitorService', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		process.env['PAYMASTER_ADDRESS'] = '0x' + 'aa'.repeat(20);
		process.env['ARBITRUM_RPC_URL'] = 'https://arb1.arbitrum.io/rpc';
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.useRealTimers();
	});

	describe('Healthy Deposit', () => {
		it('should report healthy when deposit is 0.05 ETH', async () => {
			mockBalanceOf.mockResolvedValue(BigInt('50000000000000000'));
			const { DepositMonitorService } = await import('../deposit-monitor.service');
			const service = new DepositMonitorService();
			vi.clearAllTimers();
			await service.checkDeposit();
			expect(await service.isHealthy()).toBe(true);
		});
	});

	describe('Low Deposit', () => {
		it('should log warning but remain healthy at 0.008 ETH', async () => {
			mockBalanceOf.mockResolvedValue(BigInt('8000000000000000'));
			const { DepositMonitorService } = await import('../deposit-monitor.service');
			const service = new DepositMonitorService();
			vi.clearAllTimers();
			await service.checkDeposit();
			expect(await service.isHealthy()).toBe(true);
		});
	});

	describe('Critical Deposit', () => {
		it('should pause relay when deposit is 0.004 ETH', async () => {
			mockBalanceOf.mockResolvedValue(BigInt('4000000000000000'));
			const { DepositMonitorService } = await import('../deposit-monitor.service');
			const service = new DepositMonitorService();
			vi.clearAllTimers();
			await service.checkDeposit();
			expect(await service.isHealthy()).toBe(false);
		});

		it('should pause at 0.0049 ETH (below threshold)', async () => {
			mockBalanceOf.mockResolvedValue(BigInt('4900000000000000'));
			const { DepositMonitorService } = await import('../deposit-monitor.service');
			const service = new DepositMonitorService();
			vi.clearAllTimers();
			await service.checkDeposit();
			expect(await service.isHealthy()).toBe(false);
		});
	});

	describe('Recovery', () => {
		it('should resume relay when deposit increases above threshold', async () => {
			// Constructor calls checkDeposit() which consumes the first mock value
			// Then we manually call checkDeposit() twice more
			mockBalanceOf.mockResolvedValueOnce(BigInt('4000000000000000')); // constructor call
			mockBalanceOf.mockResolvedValueOnce(BigInt('4000000000000000')); // first manual call
			mockBalanceOf.mockResolvedValueOnce(BigInt('50000000000000000')); // second manual call
			const { DepositMonitorService } = await import('../deposit-monitor.service');
			const service = new DepositMonitorService();
			vi.clearAllTimers();
			await service.checkDeposit();
			expect(await service.isHealthy()).toBe(false);
			await service.checkDeposit();
			expect(await service.isHealthy()).toBe(true);
		});
	});

	describe('Edge Cases', () => {
		it('should handle zero deposit', async () => {
			mockBalanceOf.mockResolvedValue(0n);
			const { DepositMonitorService } = await import('../deposit-monitor.service');
			const service = new DepositMonitorService();
			vi.clearAllTimers();
			await service.checkDeposit();
			expect(await service.isHealthy()).toBe(false);
		});

		it('should handle PAYMASTER_ADDRESS not set', async () => {
			delete process.env['PAYMASTER_ADDRESS'];
			const { DepositMonitorService } = await import('../deposit-monitor.service');
			const service = new DepositMonitorService();
			vi.clearAllTimers();
			await service.checkDeposit();
			expect(service).toBeDefined();
		});

		it('should handle RPC error gracefully', async () => {
			mockBalanceOf.mockRejectedValue(new Error('RPC connection failed'));
			const { DepositMonitorService } = await import('../deposit-monitor.service');
			const service = new DepositMonitorService();
			vi.clearAllTimers();
			await service.checkDeposit();
			expect(service).toBeDefined();
		});
	});
});
