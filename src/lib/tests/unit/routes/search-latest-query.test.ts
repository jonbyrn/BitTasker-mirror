import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('latest search wins', () => {
	it('does not skip a new task search just because the previous one is loading', () => {
		const page = readFileSync('src/routes/(app)/tasks/+page.svelte', 'utf8');
		expect(page).not.toContain('if ($tasksStore.loading) return;');
		expect(page).toContain('beginTasksSearch()');
		expect(page).toContain('searchAbortController.abort()');
		expect(page).toContain('findTasks(searchParams, activeEpoch, signal)');
	});

	it('starts a services search by invalidating the previous epoch and hiding the skeleton once cards exist', () => {
		const page = readFileSync('src/routes/(app)/services/+page.svelte', 'utf8');
		expect(page).toContain('const epoch = beginServicesSearch()');
		expect(page).toContain('findServicesWithTimeout(searchParams, epoch, signal)');
		expect(page).toContain('visibleServices.length === 0');
	});
});
