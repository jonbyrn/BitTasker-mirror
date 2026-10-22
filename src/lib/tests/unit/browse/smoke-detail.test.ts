import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
	return readFileSync(resolve(path), 'utf8');
}

describe('smoke detail shell', () => {
	it('shows a service category and profile without a header edit', () => {
		const view = source('src/lib/components/service/ServiceDetailsView.svelte');
		expect(view).toContain('data-testid="service-category"');
		expect(view).toContain('data-testid="service-profile"');
		expect(view).toContain('classifiedLabel');
		const lookup = source('src/lib/nostr/service.ts');
		expect(lookup).toContain('timeoutMs: SEARCH_PROVIDER_MS');
	});

	it('paints a two-column task shell and keeps the sidebar under the header', () => {
		const view = source('src/lib/components/task/TaskDetailsView.svelte');
		expect(view).toContain('data-testid="task-detail-skeleton"');
		expect(view).toContain('lg:grid-cols-3');
		expect(view).toContain('data-testid="task-detail-sidebar"');
		expect(view).toContain('lg:sticky');
		expect(view).toContain('lg:top-20');
		expect(view).toContain('lg:z-0');
		expect(view).not.toContain('sticky top-6');
		const header = source('src/lib/components/topbar/PublicTopBar.svelte');
		expect(header).not.toContain('task-detail-sidebar');
	});
});
