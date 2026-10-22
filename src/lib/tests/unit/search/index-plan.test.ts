import { describe, expect, it } from 'vitest';
import {
	INDEXER_KINDS,
	authorPubkey,
	chunkAuthors,
	hasValidBudget,
	planIndexBatch,
	profileAddress,
	replaceableAddress,
	testPubkeysFromEnv
} from '$lib/search/index-plan.js';

const pubkey = 'ab'.repeat(32);
const other = 'cd'.repeat(32);
const NOW = Date.parse('2026-10-21T12:00:00Z');

function event(partial: Record<string, unknown> = {}) {
	const content = {
		title: 'Trusted Cleaner en La Costa',
		description: 'House clean',
		status: 'OPEN',
		taskType: 'in-person',
		budget: { amount: 40, currency: 'USD' },
		pickupLocation: { displayName: 'La Costa, El Salvador' },
		...((partial.content as object) || {})
	};
	const { content: _ignored, ...rest } = partial;
	return {
		kind: 31000,
		id: '11'.repeat(32),
		pubkey,
		created_at: 1_700_000_000,
		tags: [['d', 'cleaner']],
		...rest,
		content: JSON.stringify(content)
	};
}

describe('relay index plan', () => {
	it('uses the replaceable address and keeps only the newest created_at', () => {
		const older = event({
			created_at: 100,
			id: 'aa'.repeat(32),
			content: { title: 'Old cleaner' }
		});
		const newer = event({
			created_at: 200,
			id: 'bb'.repeat(32),
			content: { title: 'New cleaner' }
		});
		expect(replaceableAddress(newer)).toBe(`31000:${pubkey}:cleaner`);
		const first = planIndexBatch([older, newer], NOW);
		const upserts = first.actions.filter((action) => action.op === 'upsert');
		expect(upserts.at(-1)?.document).toMatchObject({ title: 'New cleaner' });
		const second = planIndexBatch([older], NOW, first.seen);
		expect(second.actions).toEqual([]);
	});

	it('removes a listing when a kind 5 delete names its address', () => {
		const listed = event();
		const planned = planIndexBatch([listed], NOW);
		expect(planned.actions.some((action) => action.op === 'upsert')).toBe(true);
		const deleted = planIndexBatch(
			[
				{
					kind: 5,
					id: 'ee'.repeat(32),
					pubkey,
					created_at: 1_800_000_000,
					tags: [['a', `31000:${pubkey}:cleaner`]],
					content: ''
				}
			],
			NOW,
			planned.seen
		);
		expect(deleted.actions).toEqual([
			expect.objectContaining({ op: 'remove', collection: 'tasks' })
		]);
	});

	it('drops expired, probe, non-SV, and unpriced listings', () => {
		const expired = event({
			content: { deadline: '2020-01-01T00:00:00.000Z', title: 'Trusted Cleaner en La Costa' }
		});
		const probeTag = event({
			tags: [
				['d', 'cleaner'],
				['t', 'bittasker-probe']
			]
		});
		const probeTitle = event({ content: { title: 'probe listing in El Zonte' } });
		const testTitle = event({ content: { title: 'TEST cleaner en La Costa' } });
		const known = event({ pubkey: other });
		const foreign = event({
			content: { pickupLocation: { displayName: 'Austin, Texas' }, title: 'Move a sofa' }
		});
		const free = event({ content: { budget: { amount: 0, currency: 'USD' } } });
		const blank = event({ content: { budget: { amount: '40', currency: 'USD' } } });
		const missing = event({ content: { budget: null } });
		const remote = event({
			content: {
				title: 'Landing Page Development',
				taskType: 'remote',
				pickupLocation: { displayName: '' },
				budget: { amount: 25, currency: 'USD' }
			}
		});
		const batch = planIndexBatch(
			[expired, probeTag, probeTitle, testTitle, known, foreign, free, blank, missing, remote],
			NOW,
			new Map(),
			{ testPubkeys: testPubkeysFromEnv({ BITTASKER_TEST_PUBKEYS: other }) }
		);
		const upserts = batch.actions.filter((action) => action.op === 'upsert');
		expect(upserts).toHaveLength(1);
		expect(upserts[0].document).toMatchObject({ title: 'Landing Page Development' });
		expect(batch.actions.filter((action) => action.op === 'remove').length).toBeGreaterThan(0);
	});

	it('guards service pricing and shift rates field by field', () => {
		expect(hasValidBudget(30402, { pricing: { type: 'FIXED', amount: 20 } })).toBe(true);
		expect(hasValidBudget(30402, { pricing: { type: 'HOURLY', hourlyRate: 8 } })).toBe(true);
		expect(
			hasValidBudget(30402, { pricing: { type: 'TIERED', tiers: [{ price: 0 }, { price: 15 }] } })
		).toBe(true);
		expect(hasValidBudget(30402, { pricing: { type: 'FIXED', amount: '20' } })).toBe(false);
		expect(hasValidBudget(30402, { pricing: { type: 'HOURLY' } })).toBe(false);
		expect(hasValidBudget(30402, { pricing: null })).toBe(false);
		expect(hasValidBudget(30402, {})).toBe(false);
		expect(hasValidBudget(31150, { job: { title: 'Cleaning shift', hourlyRateUsd: 4 } })).toBe(
			true
		);
		expect(hasValidBudget(31150, { job: { title: 'Cleaning shift', hourlyRateUsd: 0 } })).toBe(
			false
		);
		expect(hasValidBudget(31000, { budget: { amount: Number.NaN } })).toBe(false);

		const shift = {
			kind: 31150,
			id: 'ff'.repeat(32),
			pubkey,
			created_at: 300,
			tags: [['d', 'shift-1']],
			content: JSON.stringify({
				v: 1,
				job: {
					title: 'Cleaning shift in La Libertad',
					requirements: 'Bring supplies',
					location: 'La Libertad',
					role: 'cleaning',
					status: 'open',
					date: '2026-10-22',
					endDate: '2026-10-22',
					hourlyRateUsd: 4
				}
			})
		};
		const planned = planIndexBatch([shift], NOW);
		expect(planned.actions[0]).toMatchObject({
			op: 'upsert',
			collection: 'shifts',
			document: { category: 'cleaning', price_usd: 4, address: `31150:${pubkey}:shift-1` }
		});

		const expiredShift = {
			...shift,
			id: 'ee'.repeat(32),
			created_at: 400,
			content: JSON.stringify({
				v: 1,
				job: {
					title: 'Cleaning shift in La Libertad',
					requirements: 'Bring supplies',
					location: 'La Libertad',
					role: 'cleaning',
					status: 'open',
					date: '2020-01-01',
					endDate: '2020-01-01',
					hourlyRateUsd: 4
				}
			})
		};
		const kept = planIndexBatch([shift, expiredShift], NOW);
		expect(
			kept.actions.filter((action) => action.collection === 'shifts' && action.op === 'remove')
		).toEqual([]);
		expect(kept.actions.filter((action) => action.op === 'upsert')).toHaveLength(1);

		const deletion = {
			kind: 5,
			id: 'ab'.repeat(32),
			pubkey,
			created_at: 500,
			tags: [['a', `31150:${pubkey}:shift-1`]],
			content: ''
		};
		const deleted = planIndexBatch([deletion], NOW);
		expect(deleted.actions.filter((action) => action.collection === 'shifts')).toEqual([]);
	});

	it('keeps a kind 0 profile even when it has no budget or place', () => {
		const person = {
			kind: 0,
			id: '12'.repeat(32),
			pubkey,
			created_at: 400,
			tags: [],
			content: JSON.stringify({
				display_name: 'Ana Diseñador',
				about: 'Diseño',
				picture: 'https://example.com/ana.png'
			})
		};
		const older = { ...person, created_at: 100, content: JSON.stringify({ display_name: 'Old' }) };
		expect(profileAddress(person)).toBe(`0:${pubkey}`);
		expect(INDEXER_KINDS).toContain(0);
		expect(INDEXER_KINDS).toContain(30000);
		expect(INDEXER_KINDS.indexOf(31000)).toBeLessThan(INDEXER_KINDS.indexOf(0));
		expect(authorPubkey({ kind: 31000, pubkey })).toBe(pubkey);
		expect(authorPubkey({ kind: 0, pubkey })).toBe('');
		expect(chunkAuthors([pubkey, other], 1)).toEqual([[pubkey], [other]]);
		const planned = planIndexBatch([older, person], NOW);
		const patches = planned.actions.filter((action) => action.op === 'patch');
		expect(patches).toHaveLength(2);
		expect(patches.at(-1)?.fields).toMatchObject({
			title: 'Ana Diseñador',
			picture: 'https://example.com/ana.png',
			pubkey
		});
		const again = planIndexBatch([older], NOW, planned.seen);
		expect(again.actions).toEqual([]);
	});

	it('keeps an active goods listing and drops one without a price', () => {
		expect(
			hasValidBudget(31160, {
				listing: { title: 'Techos y goteras', priceUsd: 40, status: 'active' }
			})
		).toBe(true);
		expect(
			hasValidBudget(31160, { listing: { title: 'Sold', priceUsd: 40, status: 'sold' } })
		).toBe(false);
		expect(hasValidBudget(31160, { listing: { title: 'Free', priceUsd: 0 } })).toBe(false);
		expect(hasValidBudget(31000, { budget: { amount: 12 } })).toBe(true);
	});
});
