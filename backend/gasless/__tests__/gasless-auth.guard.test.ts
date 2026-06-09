// Gasless Auth Guard Tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@nestjs/common', () => ({
	Injectable: () => (target: any) => target,
	UnauthorizedException: class UnauthorizedException extends Error {
		constructor(message: string) {
			super(message);
			this.name = 'UnauthorizedException';
		}
	},
	CanActivate: () => () => true,
	ExecutionContext: {},
	Logger: vi.fn().mockImplementation(() => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('express', () => ({ default: {}, Request: {} }));

vi.mock('jsonwebtoken', () => ({
	default: { verify: vi.fn() },
	verify: vi.fn()
}));

import * as jwt from 'jsonwebtoken';

function createMockExecutionContext(authHeader: string | undefined) {
	const req: any = { headers: {}, user: undefined };
	if (authHeader !== undefined) req.headers.authorization = authHeader;
	return {
		switchToHttp: () => ({ getRequest: () => req })
	};
}

describe('GaslessAuthGuard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env['JWT_SECRET'] = 'test-secret';
	});

	afterEach(() => {
		delete process.env['JWT_SECRET'];
		vi.resetModules(); // Reset modules to clear cached imports
	});

	describe('Valid Bearer Token', () => {
		it('should pass with valid Bearer token', async () => {
			const payload = { sub: 'user-123', walletAddress: '0x' + 'aa'.repeat(20) };
			(jwt.verify as any).mockReturnValue(payload);
			const { GaslessAuthGuard } = await import('../guards/gasless-auth.guard');
			const guard = new GaslessAuthGuard();
			const context = createMockExecutionContext('Bearer valid-token-123');
			expect(guard.canActivate(context as any)).toBe(true);
		});

		it('should attach user payload to request', async () => {
			const payload = { sub: 'user-456' };
			(jwt.verify as any).mockReturnValue(payload);
			const { GaslessAuthGuard } = await import('../guards/gasless-auth.guard');
			const guard = new GaslessAuthGuard();
			const req = { headers: { authorization: 'Bearer my-token' }, user: undefined };
			const context = { switchToHttp: () => ({ getRequest: () => req }) } as any;
			guard.canActivate(context);
			expect(req.user).toEqual(payload);
		});
	});

	describe('Missing Authorization Header', () => {
		it('should throw when no header', async () => {
			const { GaslessAuthGuard } = await import('../guards/gasless-auth.guard');
			const guard = new GaslessAuthGuard();
			const context = createMockExecutionContext(undefined) as any;
			expect(() => guard.canActivate(context)).toThrow('Missing Authorization header');
		});
	});

	describe('Invalid Format', () => {
		it('should throw when no Bearer prefix', async () => {
			const { GaslessAuthGuard } = await import('../guards/gasless-auth.guard');
			const guard = new GaslessAuthGuard();
			const context = createMockExecutionContext('Token some-token') as any;
			expect(() => guard.canActivate(context)).toThrow('Invalid Authorization header format');
		});
	});

	describe('Invalid/Expired Token', () => {
		it('should throw when jwt.verify fails', async () => {
			(jwt.verify as any).mockImplementation(() => {
				throw new Error('jwt expired');
			});
			const { GaslessAuthGuard } = await import('../guards/gasless-auth.guard');
			const guard = new GaslessAuthGuard();
			const context = createMockExecutionContext('Bearer expired-token') as any;
			expect(() => guard.canActivate(context)).toThrow('Invalid or expired token');
		});
	});

	describe('JWT Secret', () => {
		it('should use JWT_SECRET env var', async () => {
			process.env['JWT_SECRET'] = 'my-custom-secret';
			(jwt.verify as any).mockReturnValue({ sub: 'user-1' });
			const { GaslessAuthGuard } = await import('../guards/gasless-auth.guard');
			const guard = new GaslessAuthGuard();
			const context = createMockExecutionContext('Bearer token') as any;
			guard.canActivate(context);
			expect(jwt.verify).toHaveBeenCalledWith('token', 'my-custom-secret');
		});
	});
});
