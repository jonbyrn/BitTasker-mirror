import { describe, expect, it } from 'vitest';
import {
	categoryPatch,
	listingPatchFromDraft,
	servicePatchFromDraft,
	taskPatchFromDraft
} from '$lib/qvac/apply';
import { classifyUpstream } from '$lib/qvac/gate.js';
import { parseCategory, parseDraft } from '$lib/qvac/parse.js';
import { catalogLines, draftMessages } from '$lib/qvac/prompts.js';
import { GOODS_LISTING_CATEGORIES, RENTAL_LISTING_CATEGORIES } from '$lib/qvac/listing-ids.js';
import { pinAssistant } from '$lib/qvac/assistant-core.js';
import { GOODS_CATEGORIES, RENTAL_CATEGORIES } from '$lib/market/types';
import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import { isEnabled, isQvacEnabled, FEATURE_FLAGS } from '$lib/services/feature-flags';

const budget = {
	amount: 0,
	currency: 'USDt',
	type: BudgetTypeEnum.FIXED,
	estimatedHours: 0,
	escrow: true
};

describe('qvac parsing', () => {
	it('turns a model reply into a title, a catalog category, and an El Salvador range', () => {
		const draft = parseDraft(
			'```json\n{"title":"Clean the kitchen","description":"Deep clean the kitchen and the floors.","categoryId":"cleaning","priceLow":20,"priceHigh":40}\n```'
		);
		expect(draft).toMatchObject({
			title: 'Clean the kitchen',
			categoryId: 'cleaning',
			priceLow: 20,
			priceHigh: 40,
			priceUnit: 'project'
		});
	});

	it('drops an unknown category and replaces an absurd price with the catalog range', () => {
		const draft = parseDraft(
			'{"title":"Fix the sink","description":"The kitchen sink is leaking.","categoryId":"not-a-job","priceLow":90000,"priceHigh":1}'
		);
		expect(draft.categoryId).toBe('');
		expect(draft.priceLow).toBe(15);
		expect(draft.priceHigh).toBe(45);
	});

	it('uses the category starting price when the model omits a number', () => {
		const draft = parseDraft(
			'{"title":"Mow the yard","description":"Cut the grass in the front yard.","categoryId":"gardening"}'
		);
		expect(draft.priceLow).toBe(15);
		expect(draft.priceHigh).toBe(45);
		expect(draft.priceUnit).toBe('project');
	});

	it('rejects temporary staff and unknown category ids', () => {
		expect(parseCategory('{"categoryId":"temp-staff"}')).toBe('');
		expect(parseCategory('{"categoryId":"nope"}')).toBe('');
		expect(parseCategory('{"categoryId":"cleaning"}')).toBe('cleaning');
	});

	it('lists catalog ids in the prompt and names no outside model API', () => {
		const lines = catalogLines();
		expect(lines.some((line) => line.startsWith('cleaning |'))).toBe(true);
		expect(lines.some((line) => line.startsWith('temp-staff |'))).toBe(false);
		const prompt = JSON.stringify(draftMessages('limpiar la cocina'));
		expect(prompt).toContain('limpiar la cocina');
		expect(prompt).not.toContain('openai');
		expect(prompt).not.toContain('api.anthropic');
	});

	it('keeps the local model flag off unless the build turns it on', () => {
		expect(isQvacEnabled()).toBe(false);
		expect(isEnabled(FEATURE_FLAGS.QVAC_ENABLED)).toBe(false);
	});

	it('refuses third-party model hosts and accepts a loopback origin', () => {
		expect(classifyUpstream('https://api.openai.com').ok).toBe(false);
		expect(classifyUpstream('https://api.groq.com/openai').ok).toBe(false);
		expect(classifyUpstream('https://user:pass@127.0.0.1:11434').ok).toBe(false);
		expect(classifyUpstream('')).toEqual({ ok: false, reason: 'missing' });
		expect(classifyUpstream('http://127.0.0.1:11434')).toEqual({
			ok: true,
			origin: 'http://127.0.0.1:11434'
		});
		expect(classifyUpstream('https://models.example.test')).toEqual({
			ok: true,
			origin: 'https://models.example.test'
		});
	});

	it('fills the task form from a draft without publishing anything', () => {
		const patch = taskPatchFromDraft(
			{
				title: 'Clean the kitchen',
				description: 'Deep clean the kitchen.',
				categoryId: 'cleaning',
				priceLow: 15,
				priceHigh: 45,
				priceUnit: 'project'
			},
			budget
		);
		expect(patch.title).toBe('Clean the kitchen');
		expect(patch.taskType).toBe(TaskTypeEnum.IN_PERSON);
		expect(patch.budget?.amount).toBe(30);
		expect(patch.budget?.type).toBe(BudgetTypeEnum.FIXED);
		expect(patch.categories?.[0]?.id).toBe('1');
		expect(categoryPatch('development')?.mode).toBe('remote');
	});

	it('marks a remote suggestion as remote and clears the meeting place', () => {
		const patch = taskPatchFromDraft(
			{
				title: 'Write a page',
				description: 'Write a short page in Spanish.',
				categoryId: 'writing',
				priceLow: 5,
				priceHigh: 15,
				priceUnit: 'hour'
			},
			budget
		);
		expect(patch.taskType).toBe(TaskTypeEnum.REMOTE);
		expect(patch.budget?.type).toBe(BudgetTypeEnum.HOURLY);
		expect(patch.pickupLocation?.displayName).toBe('');
	});

	it('reads a single suggested price and keeps listing categories on the goods list', () => {
		const draft = parseDraft(
			'{"title":"Ladder","description":"A folding ladder.","categoryId":"tools","price":25}',
			{ kind: 'listing', offer: 'sell' }
		);
		expect(draft).toMatchObject({ categoryId: 'tools', priceLow: 25, priceHigh: 25 });
		const foreign = parseDraft(
			'{"title":"Ladder","description":"A folding ladder.","categoryId":"cleaning","price":25}',
			{ kind: 'listing', offer: 'sell' }
		);
		expect(foreign.categoryId).toBe('');
		expect(GOODS_LISTING_CATEGORIES.map((item) => item.id)).toEqual([...GOODS_CATEGORIES]);
		expect(RENTAL_LISTING_CATEGORIES.map((item) => item.id)).toEqual([...RENTAL_CATEGORIES]);
	});

	it('fills a service or a listing draft and does not publish it', () => {
		const draft = {
			title: 'Fix a roof',
			description: 'Patch the leaking roof.',
			categoryId: 'handyman',
			priceLow: 40,
			priceHigh: 40,
			priceUnit: 'project' as const
		};
		const service = servicePatchFromDraft(draft, {
			type: ServicePricingTypeEnum.FIXED,
			currency: 'USDt',
			amount: 0
		});
		expect(service.title).toBe('Fix a roof');
		expect(service.pricing?.amount).toBe(40);
		expect(service).not.toHaveProperty('published');
		const listing = listingPatchFromDraft({ ...draft, categoryId: 'tools' });
		expect(listing).toEqual({
			title: 'Fix a roof',
			description: 'Patch the leaking roof.',
			category: 'tools',
			price: '40'
		});
	});

	it('pins the assistant even when the inbox is empty', () => {
		const rows = pinAssistant([], 'Ab'.repeat(32), 'BitTasker Assistant', (pubkey, name) => ({
			pubkey,
			profile: { name },
			created_at: 0
		}));
		expect(rows).toHaveLength(1);
		expect(rows[0].profile.name).toBe('BitTasker Assistant');
		expect(rows[0].created_at).toBe(0);
		const again = pinAssistant(
			[{ pubkey: 'ff'.repeat(32), profile: { name: 'Sam' } }, rows[0]],
			rows[0].pubkey,
			'BitTasker Assistant',
			() => rows[0]
		);
		expect(again[0].pubkey).toBe(rows[0].pubkey);
	});
});
