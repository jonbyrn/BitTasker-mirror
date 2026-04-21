import { describe, expect, it } from 'vitest';
import { REVIEWS_SCHEMA_VERSION, reviewSubjectTypeSchema } from '@bittasker/reviews-contracts';

describe('Contracts Package Integration Smoke Test', () => {
	it('correctly imports REVIEWS_SCHEMA_VERSION', () => {
		expect(REVIEWS_SCHEMA_VERSION).toBe(1);
	});

	it('correctly validates a subject type using the schema', () => {
		const result = reviewSubjectTypeSchema.safeParse('task');
		expect(result.success).toBe(true);
	});

	it('rejects an invalid subject type', () => {
		const result = reviewSubjectTypeSchema.safeParse('invalid_type');
		expect(result.success).toBe(false);
	});
});
