import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FeaturedHomepageSection from '$lib/components/homepage/FeaturedHomepageSection.svelte';

describe('homepage featured sections accessibility smoke', () => {
	it('keeps the shared section shell heading and CTA links accessible while loading', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [],
				loading: true,
				error: null,
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.getByRole('heading', { level: 2, name: 'Featured Services' })).toBeTruthy();
		expect(screen.getByTestId('homepage-featured-services')).toHaveAttribute('aria-busy', 'true');
		expect(screen.getByRole('status')).toHaveTextContent('Loading Featured Services.');
		expect(screen.getByRole('link', { name: 'Browse Services' })).toHaveAttribute(
			'href',
			'/services'
		);
		expect(screen.getByTestId('homepage-featured-services-skeletons')).toBeTruthy();
		expect(screen.getByTestId('homepage-featured-services-skeletons')).toHaveAttribute(
			'aria-hidden',
			'true'
		);
	});

	it('keeps the shared section shell navigable when loading completes with an inline warning', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [],
				loading: false,
				error: 'Failed to load featured services',
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.getByRole('heading', { level: 2, name: 'Featured Services' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Browse Services' })).toBeTruthy();
		expect(screen.getByRole('alert')).toHaveTextContent('Failed to load featured services');
	});

	it('keeps the loaded featured shell exposed as a labeled list', () => {
		render(FeaturedHomepageSection, {
			props: {
				title: 'Featured Services',
				browseHref: '/services',
				browseLabel: 'Browse Services',
				items: [{ id: 1 }, { id: 2 }, { id: 3 }],
				loading: false,
				error: null,
				sectionTestId: 'homepage-featured-services'
			}
		});

		expect(screen.getByRole('list', { name: 'Featured Services' })).toBeTruthy();
		expect(screen.getAllByRole('listitem')).toHaveLength(3);
	});
});
