import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FeaturedHomepageSection from '$lib/components/homepage/FeaturedHomepageSection.svelte';

describe('FeaturedHomepageSection', () => {
	it('renders deterministic skeleton cards while loading', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				viewAllLabel: 'View All',
				viewAllHref: '/services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [],
				loading: true,
				error: null,
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.getByTestId('homepage-featured-services')).toBeTruthy();
		expect(screen.getByTestId('homepage-featured-services')).toHaveAttribute('aria-busy', 'true');
		expect(screen.getByTestId('homepage-featured-services-loading-status')).toHaveTextContent(
			'Loading Featured Services.'
		);
		expect(screen.getByTestId('homepage-featured-services-skeletons')).toBeTruthy();
		expect(screen.getByTestId('homepage-featured-services-skeletons')).toHaveAttribute(
			'aria-hidden',
			'true'
		);
		expect(screen.getByTestId('homepage-featured-card-skeleton-1')).toBeTruthy();
	});

	it('hides the section after loading when configured to hide on empty', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				viewAllLabel: 'View All',
				viewAllHref: '/services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [],
				loading: false,
				error: null,
				hideWhenEmpty: true,
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.queryByTestId('homepage-featured-services')).toBeNull();
	});

	it('shows an inline warning when loading completed with an error', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				viewAllLabel: 'View All',
				viewAllHref: '/services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [],
				loading: false,
				error: 'Failed to load featured services',
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.getByRole('alert')).toHaveTextContent('Failed to load featured services');
	});

	it('shows the empty-state message when configured to remain visible without items', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				viewAllLabel: 'View All',
				viewAllHref: '/services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [],
				loading: false,
				error: null,
				emptyMessage: 'No featured services right now.',
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.getByTestId('homepage-featured-services-empty')).toHaveTextContent(
			'No featured services right now.'
		);
	});

	it('exposes loaded featured cards as a labeled list', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				viewAllLabel: 'View All',
				viewAllHref: '/services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [{ title: 'Logo Design' }, { title: 'SEO Audit' }],
				loading: false,
				error: null,
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.getByTestId('homepage-featured-services')).toHaveAttribute(
			'data-homepage-featured-shell',
			'true'
		);
		expect(screen.getByTestId('homepage-featured-services-view-all')).toHaveAttribute(
			'href',
			'/services'
		);
		expect(screen.getByTestId('homepage-featured-services-browse-cta')).toHaveAttribute(
			'href',
			'/services'
		);
		expect(screen.getByRole('list', { name: 'Featured Services' })).toBeTruthy();
		expect(screen.getAllByRole('listitem')).toHaveLength(2);
	});
});
