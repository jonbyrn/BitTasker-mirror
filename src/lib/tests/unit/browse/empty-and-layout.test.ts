import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
	return readFileSync(path, 'utf8');
}

describe('empty states and control size', () => {
	it('gives staff and goods an empty-state action in English and Spanish', () => {
		const shifts = source('src/routes/(app)/shifts/+page.svelte');
		expect(shifts).toContain('data-testid="shifts-empty-post"');
		expect(shifts).toContain('{copy.post}');
		const board = source('src/lib/components/browse/BrowseBoard.svelte');
		expect(board).toContain('data-testid="staff-empty-post"');
		expect(board).toContain('{copy.postShift}');
		expect(board).toContain('checked={showExpired}');
		expect(board).not.toContain('checked={!showExpired}');
		const goods = source('src/routes/(app)/browse/goods/+page.svelte');
		expect(goods).toContain('data-testid="goods-empty-sell"');
		expect(goods).toContain('{copy.listItem}');
		const market = source('src/lib/market/copy.ts');
		expect(market).toContain("listItem: 'List an item'");
		expect(market).toContain("listItem: 'Publicar un artículo'");
		const staff = source('src/lib/staffing/copy.ts');
		expect(staff).toContain("post: 'Post a shift'");
		expect(staff).toContain("post: 'Publicar un turno'");
	});

	it('keeps buttons 40px tall and Sign Up on one line', () => {
		const css = source('src/app.css');
		expect(css).toMatch(/\.ui-action,\n\.btn \{\n\tmin-height: 40px;/);
		const header = source('src/lib/components/topbar/PublicTopBar.svelte');
		expect(header).toContain('whitespace-nowrap');
		expect(header).toContain('min-height: 40px');
		expect(header).toContain('height: 73px');
		expect(header).not.toContain('min-height: 32px');
	});
});
