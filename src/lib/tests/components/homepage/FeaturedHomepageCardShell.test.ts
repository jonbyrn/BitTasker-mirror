import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FeaturedHomepageCardShell from '$lib/components/homepage/FeaturedHomepageCardShell.svelte';

describe('FeaturedHomepageCardShell', () => {
	it('renders the shared homepage card shell and skips a thumbnail when the listing has no image', () => {
		render(FeaturedHomepageCardShell, {
			props: {
				href: '/services/logo-design',
				title: 'Logo Design',
				description: 'Brand identity and launch assets.',
				meta: ['From $85', 'Remote'],
				ctaLabel: 'View Service',
				testId: 'homepage-card-shell'
			}
		});

		const card = screen.getByTestId('homepage-card-shell');
		expect(card).toHaveAttribute('data-homepage-card-shell', 'true');
		expect(screen.queryByRole('img')).toBeNull();
		expect(screen.getByText('Brand identity and launch assets.')).toBeTruthy();
		expect(screen.getByText('From $85')).toBeTruthy();
		expect(screen.getByText('Remote')).toBeTruthy();
		expect(screen.getByText('View Service')).toBeTruthy();
	});

	it('prefers the provided image, alt text, and loading mode', () => {
		render(FeaturedHomepageCardShell, {
			props: {
				href: '/tasks/launch-campaign',
				title: 'Launch Campaign',
				image: 'https://cdn.example.com/launch.jpg',
				imageAlt: 'Launch illustration',
				imageLoading: 'eager',
				ctaLabel: 'View Task'
			}
		});

		const image = screen.getByRole('img', { name: 'Launch illustration' });
		expect(image).toHaveAttribute('src', 'https://cdn.example.com/launch.jpg');
		expect(image).toHaveAttribute('loading', 'eager');
		expect(screen.getByText('View Task')).toBeTruthy();
	});
});
