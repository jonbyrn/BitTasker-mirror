import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import ComingSoon from '$lib/components/ComingSoon.svelte';

vi.mock('svelte-i18n', () => {
	const translations: Record<string, string> = {
		'common.coming_soon.title': 'Coming soon',
		'common.coming_soon.subtitle': 'Stay tuned',
		'common.coming_soon.description': 'We are building this now'
	};
	return {
		t: readable((key: string) => translations[key] ?? key)
	};
});

describe('ComingSoon', () => {
	it('renders translated defaults and reacts to prop updates', async () => {
		const { rerender } = render(ComingSoon, { showIcon: false, showGlow: false });

		expect(screen.getByText('Coming soon')).toBeDefined();
		expect(screen.getByText('Stay tuned')).toBeDefined();

		await rerender({
			title: 'Custom title',
			subtitle: 'Custom subtitle',
			description: 'Custom description',
			showIcon: false,
			showGlow: false
		});

		expect(screen.getByText('Custom title')).toBeDefined();
		expect(screen.getByText('Custom subtitle')).toBeDefined();
		expect(screen.getByText('Custom description')).toBeDefined();
	});
});
