import { describe, expect, it } from 'vitest';
import { resultTotal, withServicePricing, withTaskBudget } from '$lib/search/card-shape';

describe('card shape', () => {
	it('maps a Typesense task price onto budget.amount', () => {
		const task = withTaskBudget({
			id: 'test-dev-tasks-0',
			title: '[TEST] Logo design',
			price_usd: 25,
			status: 'open'
		});
		expect(task.budget.amount).toBe(25);
		expect(task.budget.currency).toBe('USD');
		expect(task.budget.type).toBe('FIXED');
	});

	it('keeps an existing nostr budget and fills a missing one with zero', () => {
		expect(
			withTaskBudget({ budget: { amount: 20, currency: 'USD', type: 'FIXED' } }).budget.amount
		).toBe(20);
		expect(withTaskBudget({ title: 'origin-probe', status: 'OPEN' }).budget.amount).toBe(0);
	});

	it('maps a Typesense service price onto pricing and forces list fields to arrays', () => {
		const service = withServicePricing({
			id: 'test-dev-services-0',
			title: '[TEST] House cleaning',
			price_usd: 35,
			status: 'open',
			pubkey: 'test'
		});
		expect(service.pricing.amount).toBe(35);
		expect(service.pricing.type).toBe('FIXED');
		expect(service.serviceLocationTypes).toBeUndefined();
		expect(withServicePricing({ portfolio: 'not-a-list', skills: 'spanish' }).portfolio).toEqual(
			[]
		);
		expect(withServicePricing({ title: 'Quote only' }).pricing).toBeUndefined();
	});

	it('counts returned hits instead of a larger Typesense found value', () => {
		const tasks = [{ id: 'a' }, { id: 'b' }];
		expect(resultTotal({ type: 'task' }, { tasks, services: [] })).toBe(2);
		expect(resultTotal({ type: 'service' }, { tasks, services: [] })).toBe(0);
	});
});
