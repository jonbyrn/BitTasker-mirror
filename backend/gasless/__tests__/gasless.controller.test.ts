// Gasless Controller Tests

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@nestjs/common', () => {
	const noop = () => () => {};
	const noopTarget = () => (target: any) => target;
	return {
		Injectable: noopTarget,
		Controller: noopTarget,
		Post: noop,
		Body: noop,
		Req: noop,
		UseGuards: noopTarget,
		HttpCode: noopTarget,
		HttpStatus: { OK: 200 },
		Logger: vi.fn().mockImplementation(() => ({
			log: vi.fn(),
			error: vi.fn(),
			warn: vi.fn()
		}))
	};
});

vi.mock('../guards/gasless-auth.guard', () => ({
	GaslessAuthGuard: class MockGaslessAuthGuard {
		canActivate() {
			return true;
		}
	}
}));

const mockRelay = vi.fn();
const mockEstimate = vi.fn();

vi.mock('../gasless.service', () => ({
	GaslessService: class MockGaslessService {
		relay = mockRelay;
		estimate = mockEstimate;
	}
}));

// Import after mocks are set up
import { GaslessController } from '../gasless.controller';

describe('GaslessController', () => {
	let controller: GaslessController;

	beforeEach(() => {
		vi.clearAllMocks();
		controller = new GaslessController({
			relay: mockRelay,
			estimate: mockEstimate
		} as any);
	});

	describe('relay endpoint', () => {
		it('should call gaslessService.relay with dto and userId', async () => {
			const dto = {
				sender: '0x' + 'aa'.repeat(20),
				userOp: {
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
				}
			};
			const req = { user: { sub: 'user-123' } };
			const expected = { userOpHash: '0x' + 'dd'.repeat(32) };
			mockRelay.mockResolvedValue(expected);

			const result = await controller.relay(dto as any, req as any);
			expect(mockRelay).toHaveBeenCalledWith(dto, 'user-123');
			expect(result).toEqual(expected);
		});

		it('should propagate errors', async () => {
			mockRelay.mockRejectedValue(new Error('Relay failed'));
			await expect(
				controller.relay({ sender: '0x', userOp: {} } as any, { user: { sub: 'u1' } } as any)
			).rejects.toThrow('Relay failed');
		});
	});

	describe('estimate endpoint', () => {
		it('should call gaslessService.estimate with dto and userId', async () => {
			const dto = {
				token: '0x' + 'aa'.repeat(20),
				amount: '1000',
				recipient: '0x' + 'bb'.repeat(20)
			};
			const req = { user: { sub: 'user-456' } };
			const expected = {
				feeBuffer: '100',
				feeCostUSD: 0.01,
				feeTier: 'Low',
				totalWithBuffer: '1100'
			};
			mockEstimate.mockResolvedValue(expected);

			const result = await controller.estimate(dto as any, req as any);
			expect(mockEstimate).toHaveBeenCalledWith(dto, 'user-456');
			expect(result).toEqual(expected);
		});

		it('should propagate errors', async () => {
			mockEstimate.mockRejectedValue(new Error('Estimation failed'));
			await expect(
				controller.estimate(
					{ token: '0x', amount: '0', recipient: '0x' } as any,
					{ user: { sub: 'u1' } } as any
				)
			).rejects.toThrow('Estimation failed');
		});
	});
});
