import { describe, expect, it } from 'vitest';
import { load } from '../../../../routes/(protected)/dashboard/my-services/+page';

describe('dashboard/my-services redirect', () => {
	it('redirects to the earning my-services tab on the current origin', () => {
		try {
			load();
			throw new Error('Expected redirect');
		} catch (error) {
			expect(error).toMatchObject({
				status: 302,
				location: '/earning?tab=my-services'
			});
		}
	});
});
