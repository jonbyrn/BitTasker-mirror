import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BaseApiService import cycle regression', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('imports auth service without BaseApiService TDZ errors', async () => {
		await expect(import('$lib/api/services/auth.service')).resolves.toBeDefined();
	});

	it('imports apiService module and exposes BaseApiService', async () => {
		const module = await import('$lib/api/apiService');
		expect(module.BaseApiService).toBeTypeOf('function');
	});
});
