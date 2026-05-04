import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FeaturedHomepageSection from '$lib/components/homepage/FeaturedHomepageSection.svelte';

describe('homepage featured section shell', () => {
	it('preserves the shared CTA contract for the services section', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [{ title: 'Logo Design' }],
				loading: false,
				error: null,
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.getByTestId('homepage-featured-services')).toHaveAttribute(
			'data-homepage-featured-shell',
			'true'
		);
		expect(screen.getByTestId('homepage-featured-services-browse-cta')).toHaveAttribute(
			'href',
			'/services'
		);
	});

	it('keeps loading and hide-when-empty behavior deterministic for the tasks section', () => {
		const { rerender } = render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Tasks',
				browseHref: '/tasks',
				browseLabel: 'Browse Tasks',
				items: [],
				loading: true,
				error: null,
				hideWhenEmpty: true,
				sectionTestId: 'homepage-featured-tasks'
			}
		});

		expect(screen.getByTestId('homepage-featured-tasks-loading-status')).toHaveTextContent(
			'Loading Featured Tasks.'
		);

		rerender({
			title: 'Featured Tasks',
			browseHref: '/tasks',
			browseLabel: 'Browse Tasks',
			items: [],
			loading: false,
			error: null,
			hideWhenEmpty: true,
			sectionTestId: 'homepage-featured-tasks'
		});

		expect(screen.queryByTestId('homepage-featured-tasks')).toBeNull();
	});
});
