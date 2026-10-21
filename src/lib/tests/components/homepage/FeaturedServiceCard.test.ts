import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FeaturedServiceCard from '$lib/components/homepage/FeaturedServiceCard.svelte';
import type { FeaturedService } from '$lib/services/featuredServices.service';

describe('FeaturedServiceCard', () => {
	it('projects featured service data through the shared homepage card shell', () => {
		const service: FeaturedService = {
			id: 'service-1',
			href: '/services/service-1',
			title: 'SEO Audit',
			description: 'Technical and content audit for search visibility.',
			priceLabel: 'From $120',
			meta: ['Remote', '3-5 days'],
			image: 'https://cdn.example.com/seo-audit.jpg',
			imageAlt: 'SEO audit preview',
			ctaLabel: 'View Service'
		};

		render(FeaturedServiceCard, {
			props: { service }
		});

		const card = screen.getByTestId('featured-service-card');
		expect(card.tagName).toBe('A');
		expect(card).toHaveAttribute('href', '/services/service-1');
		expect(card).toHaveAttribute('data-homepage-card-shell', 'true');
		expect(screen.getByRole('img', { name: 'SEO audit preview' })).toHaveAttribute(
			'src',
			'https://cdn.example.com/seo-audit.jpg'
		);
		expect(screen.getByText('From $120')).toBeTruthy();
		expect(screen.getByText('Remote')).toBeTruthy();
		expect(screen.getByText('3-5 days')).toBeTruthy();
	});
});
