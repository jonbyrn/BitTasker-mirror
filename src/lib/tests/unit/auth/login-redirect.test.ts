import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loginPath } from '$lib/utils/helpers/login-redirect';

describe('signed-out booking', () => {
	it('sends the visitor to login and back to an internal listing', () => {
		expect(loginPath('/tasks/abc?ref=1')).toBe(
			'/auth/login?returnTo=' + encodeURIComponent('/tasks/abc?ref=1')
		);
		expect(loginPath('//evil.example')).toBe('/auth/login?returnTo=%2F');
		expect(loginPath('https://evil.example')).toBe('/auth/login?returnTo=%2F');
	});

	it('closes the payment drawer until the visitor is signed in', () => {
		const service = readFileSync('src/lib/components/service/ServiceDetailsView.svelte', 'utf8');
		const book = service.slice(service.indexOf('function openInstantBuy'));
		expect(book.indexOf('redirectSignedOut')).toBeGreaterThan(-1);
		expect(book.indexOf('redirectSignedOut')).toBeLessThan(book.indexOf('instantBuyOpen = true'));

		const task = readFileSync('src/lib/components/task/TaskDetailsView.svelte', 'utf8');
		const bid = task.slice(task.indexOf('const handleBidNow'));
		expect(bid.indexOf('redirectSignedOut')).toBeLessThan(bid.indexOf('isSidebarOpen = true'));
		expect(task).toContain('loginPath(currentListingPath())');

		const tasks = readFileSync('src/routes/(app)/tasks/+page.svelte', 'utf8');
		expect(tasks).toContain('loginPath(`/tasks/${task.id}`)');
		expect(tasks).not.toContain("goto('/auth/signup')");

		const shift = readFileSync('src/routes/(app)/shifts/[id]/+page.svelte', 'utf8');
		expect(shift).toContain('goto(loginPath(currentListingPath()))');

		const seat = readFileSync('src/lib/components/staffing/ShiftSeat.svelte', 'utf8');
		const run = seat.slice(seat.indexOf('async function run'));
		expect(run.indexOf('redirectSignedOut')).toBeLessThan(run.indexOf('prepareSigner()'));
	});
});
