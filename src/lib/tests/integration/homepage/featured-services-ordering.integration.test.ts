import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import Homepage from '../../../../routes/(company)/+page.svelte';

vi.mock('$lib/components/Logo.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/services/featuredTasks.service', () => ({
	FeaturedTasksService: {
		getFeaturedTasks: vi.fn().mockResolvedValue([
			{
				id: 'task-1',
				title: 'Featured Task',
				budget: 120,
				proposals: 3,
				timeLeft: '2 days',
				image: 'https://cdn.example.com/task.jpg'
			}
		])
	}
}));

vi.mock('$lib/services/featuredServices.service', () => ({
	FeaturedServicesService: {
		getFeaturedServices: vi.fn().mockResolvedValue({
			success: true,
			services: [
				{
					id: 'service-1',
					href: '/services/service-1',
					title: 'Featured Service',
					description: 'Service description',
					priceLabel: 'From $85',
					meta: ['Remote'],
					image: 'https://cdn.example.com/service.jpg',
					imageAlt: 'Featured Service',
					ctaLabel: 'View Service'
				}
			]
		})
	}
}));

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

describe('homepage featured services ordering', () => {
	it('renders why, then featured tasks, then featured services', async () => {
		const renderOpts = {
			props: {
				data: {
					title: 'BitTasker',
					description: 'BitTasker home',
					keywords: '',
					canonical: 'https://bittasker.com',
					ogTitle: 'BitTasker',
					ogDescription: 'BitTasker home',
					ogImage: 'https://bittasker.com/og.png',
					twitterTitle: 'BitTasker',
					twitterDescription: 'BitTasker home',
					twitterImage: 'https://bittasker.com/og.png',
					jsonLd: {
						'@context': 'https://schema.org',
						'@type': 'Organization',
						name: 'BitTasker',
						legalName: 'BitTasker Inc',
						description: 'BitTasker home',
						url: 'https://bittasker.com',
						logo: { '@type': 'ImageObject', url: 'https://bittasker.com/logo.png' },
						sameAs: [],
						contactPoint: {
							'@type': 'ContactPoint',
							contactType: 'customer service',
							email: 'support@bittasker.com',
							url: 'https://bittasker.com/support',
							availableLanguage: ['en']
						},
						foundingDate: '2024-01-01',
						founders: [],
						address: { '@type': 'PostalAddress', addressCountry: 'US' },
						industry: 'Technology'
					},
					homepageData: {
						services: [
							{
								id: 'service-1',
								href: '/services/service-1',
								title: 'Featured Service',
								description: 'Service description',
								priceLabel: 'From $85',
								meta: ['Remote'],
								image: 'https://cdn.example.com/service.jpg',
								imageAlt: 'Featured Service',
								ctaLabel: 'View Service'
							}
						],
						tasks: [
							{
								id: 'task-1',
								title: 'Featured Task',
								budget: 120,
								proposals: 3,
								timeLeft: '2 days',
								image: 'https://cdn.example.com/task.jpg'
							}
						]
					}
				}
			}
		} as unknown as Parameters<typeof render<typeof Homepage>>[1];
		const { container } = render(Homepage, renderOpts);

		// Wait for async services to load and component to render
		await waitFor(() => expect(screen.getByTestId('homepage-featured-services')).toBeTruthy(), {
			timeout: 5000
		});
		await waitFor(() => expect(screen.getByTestId('homepage-featured-tasks')).toBeTruthy(), {
			timeout: 5000
		});

		const servicesSection = screen.getByTestId('homepage-featured-services');
		const benefitsSection = screen.getByTestId('homepage-benefits');
		const tasksSection = screen.getByTestId('homepage-featured-tasks');
		const hero = screen.getByTestId('homepage-hero');
		const trust = screen.getByTestId('homepage-trust');
		const how = screen.getByTestId('homepage-how');
		const nodes = Array.from(container.querySelector('[data-testid="homepage"]')?.children ?? []);

		expect(nodes.indexOf(hero)).toBeLessThan(nodes.indexOf(trust));
		expect(nodes.indexOf(trust)).toBeLessThan(nodes.indexOf(how));
		expect(nodes.indexOf(how)).toBeLessThan(nodes.indexOf(benefitsSection));
		expect(nodes.indexOf(benefitsSection)).toBeLessThan(nodes.indexOf(tasksSection));
		expect(nodes.indexOf(tasksSection)).toBeLessThan(nodes.indexOf(servicesSection));
		expect(screen.getByTestId('hero-browse-tasks').className).toContain('min-h-14');
		expect(screen.queryByTestId('popular-services')).toBeNull();
	});
});
