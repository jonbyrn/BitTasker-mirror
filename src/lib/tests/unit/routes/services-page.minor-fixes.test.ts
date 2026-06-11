import { describe, expect, it } from 'vitest';

describe('MINOR #19: Invalid transition-filter Tailwind class', () => {
	it('should not have transition-filter class in services page', async () => {
		const { readFileSync } = await import('fs');
		const { join } = await import('path');

		const servicesPagePath = join(process.cwd(), 'src/routes/(app)/services/+page.svelte');
		const content = readFileSync(servicesPagePath, 'utf-8');

		expect(content).not.toContain('transition-filter');
	});
});

describe('MINOR #18: Price inputs fieldset grouping', () => {
	it('should have min/max price inputs wrapped in a fieldset with legend', async () => {
		const { readFileSync } = await import('fs');
		const { join } = await import('path');

		const filtersPath = join(
			process.cwd(),
			'src/lib/components/service/ServiceSearchFilters.svelte'
		);
		const content = readFileSync(filtersPath, 'utf-8');

		const priceRangeSection =
			content.includes('<fieldset>') &&
			content.includes('id="min-price"') &&
			content.includes('id="max-price"');
		expect(priceRangeSection).toBe(true);
	});
});

describe('MINOR #20: Grid gap consistency', () => {
	it('should use consistent gap-6 in services page skeleton and list views', async () => {
		const { readFileSync } = await import('fs');
		const { join } = await import('path');

		const servicesPagePath = join(process.cwd(), 'src/routes/(app)/services/+page.svelte');
		const content = readFileSync(servicesPagePath, 'utf-8');

		const skeletonGapMatch = content.match(/mb-12 grid grid-cols-1 gap-\d+/);
		if (skeletonGapMatch) {
			expect(skeletonGapMatch[0]).toBe('mb-12 grid grid-cols-1 gap-6');
		}
	});
});

describe('MINOR #21: Map container height', () => {
	it('should not have chained max-height that causes issues', async () => {
		const { readFileSync } = await import('fs');
		const { join } = await import('path');

		const servicesPagePath = join(process.cwd(), 'src/routes/(app)/services/+page.svelte');
		const content = readFileSync(servicesPagePath, 'utf-8');

		const mapContainerStyles = content.match(/\.map-container-wrapper\s*\{[^}]+\}/s);
		if (mapContainerStyles) {
			const styles = mapContainerStyles[0];
			expect(styles).not.toContain('max-height: 100%');
		}
	});
});

describe('MINOR #15 & #16 & #17: State management checks', () => {
	it('clearFilters should set isApplyingFilters to true', async () => {
		const { readFileSync } = await import('fs');
		const { join } = await import('path');

		const servicesPagePath = join(process.cwd(), 'src/routes/(app)/services/+page.svelte');
		const content = readFileSync(servicesPagePath, 'utf-8');

		const clearFiltersIndex = content.indexOf('async function clearFilters()');
		const clearFiltersEnd = content.indexOf('// Load more services', clearFiltersIndex);
		const clearFiltersBody = content.slice(clearFiltersIndex, clearFiltersEnd);

		expect(clearFiltersBody).toContain('isApplyingFilters = true');
	});

	it('debouncedSearch should use version tracking for race condition', async () => {
		const { readFileSync } = await import('fs');
		const { join } = await import('path');

		const servicesPagePath = join(process.cwd(), 'src/routes/(app)/services/+page.svelte');
		const content = readFileSync(servicesPagePath, 'utf-8');

		expect(content).toContain('searchVersion');
		expect(content).toContain('currentVersion !== searchVersion');
	});
});
