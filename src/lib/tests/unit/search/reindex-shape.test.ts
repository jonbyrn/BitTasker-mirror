import { describe, expect, it } from 'vitest';
import { mergeActions } from '$lib/search/documents.js';
import { collectionSchema } from '$lib/search/search-api.js';

describe('mergeActions', () => {
	it('keeps upserts that identify themselves on document.id', () => {
		const actions = mergeActions([
			[
				{ op: 'upsert', collection: 'tasks', document: { id: 'task-a', title: 'one' } },
				{ op: 'upsert', collection: 'tasks', document: { id: 'task-b', title: 'two' } },
				{
					op: 'upsert',
					collection: 'services',
					document: { id: 'service-a', pricing: { amount: 22.99 } }
				}
			]
		]);

		expect(actions).toHaveLength(3);
		expect(actions.map((action) => action.document?.id)).toEqual(['task-a', 'task-b', 'service-a']);
	});

	it('still collapses a repeated document and keeps distinct removes', () => {
		const actions = mergeActions([
			[
				{ op: 'upsert', collection: 'tasks', document: { id: 'task-a', title: 'old' } },
				{ op: 'upsert', collection: 'tasks', document: { id: 'task-a', title: 'new' } },
				{ op: 'remove', collection: 'tasks', id: 'gone' },
				{ op: 'remove-filter', collection: 'tasks', filter: 'event_id:=1' },
				{ op: 'remove-filter', collection: 'tasks', filter: 'event_id:=2' }
			]
		]);

		expect(actions).toHaveLength(4);
		expect(actions[0].document?.title).toBe('new');
		expect(actions.map((action) => action.id || action.filter)).toEqual([
			undefined,
			'gone',
			'event_id:=1',
			'event_id:=2'
		]);
	});
});

describe('listing card fields', () => {
	it('stores budget and pricing without indexing them', () => {
		for (const name of ['dev_tasks', 'dev_services', 'rgb_shifts']) {
			const fields = collectionSchema(name).fields;
			expect(fields.find((field) => field.name === 'budget')).toMatchObject({
				type: 'object',
				optional: true,
				index: false
			});
			expect(fields.find((field) => field.name === 'pricing')).toMatchObject({
				type: 'object',
				optional: true,
				index: false
			});
			expect(fields.find((field) => field.name === 'price_usd')).toMatchObject({
				type: 'float',
				sort: true
			});
		}
	});

	it('leaves profiles without the card objects', () => {
		const names = collectionSchema('dev_profiles').fields.map((field) => field.name);
		expect(names).not.toContain('budget');
		expect(names).not.toContain('pricing');
	});
});
