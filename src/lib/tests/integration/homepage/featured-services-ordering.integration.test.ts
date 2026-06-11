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
	it('renders featured services before the benefits and featured tasks sections', async () => {
		const { container } = render(Homepage, {
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
					jsonLd: {},
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
		});

		// Wait for async services to load and component to render
		await waitFor(
			() => expect(screen.getByTestId('homepage-featured-services')).toBeTruthy(),
			{ timeout: 5000 }
		);
		await waitFor(
			() => expect(screen.getByTestId('homepage-featured-tasks')).toBeTruthy(),
			{ timeout: 5000 }
		);

		const servicesSection = screen.getByTestId('homepage-featured-services');
		const benefitsSection = screen.getByTestId('homepage-benefits');
		const tasksSection = screen.getByTestId('homepage-featured-tasks');
		const nodes = Array.from(container.querySelector('.min-h-screen')?.children ?? []);

		expect(nodes.indexOf(servicesSection)).toBeGreaterThan(-1);
		expect(nodes.indexOf(benefitsSection)).toBeGreaterThan(-1);
		expect(nodes.indexOf(tasksSection)).toBeGreaterThan(-1);
		expect(nodes.indexOf(servicesSection)).toBeLessThan(nodes.indexOf(benefitsSection));
		expect(nodes.indexOf(benefitsSection)).toBeLessThan(nodes.indexOf(tasksSection));
	});
});
