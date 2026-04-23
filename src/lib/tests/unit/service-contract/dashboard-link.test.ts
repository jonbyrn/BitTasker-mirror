import { describe, expect, it } from 'vitest';
import { buildContractsDashboardLink } from '$lib/utils/service-contract/dashboard-link';

describe('buildContractsDashboardLink', () => {
	it('builds a service contracts link with context and highlight continuity', () => {
		expect(
			buildContractsDashboardLink({
				baseUrl: 'https://bittasker.test/',
				contextType: 'service',
				escrowId: 'svc-123'
			})
		).toBe('https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123');
	});

	it('builds a task contracts link without the service context filter', () => {
		expect(
			buildContractsDashboardLink({
				baseUrl: 'https://bittasker.test',
				contextType: 'task',
				escrowId: 'task-123'
			})
		).toBe('https://bittasker.test/dashboard?tab=contracts&highlight=task-123');
	});

	it('omits highlight when the escrow id is blank', () => {
		expect(
			buildContractsDashboardLink({
				baseUrl: 'https://bittasker.test',
				contextType: 'service',
				escrowId: '   '
			})
		).toBe('https://bittasker.test/dashboard?tab=contracts&context=services');
	});
});
