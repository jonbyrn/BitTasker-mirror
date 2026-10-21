import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FeaturedHomepageCardShell from '$lib/components/homepage/FeaturedHomepageCardShell.svelte';
import FeaturedServiceCard from '$lib/components/homepage/FeaturedServiceCard.svelte';
import LiveTaskCard from '$lib/components/homepage/LiveTaskCard.svelte';

describe('homepage featured card shell', () => {
	it('renders the shared card frame without a thumbnail when the listing has no image', () => {
		render(FeaturedHomepageCardShell, {
			props: {
				href: '/services/logo-design',
				title: 'Logo Design',
				description: 'Brand identity package',
				meta: ['From $85', 'Remote'],
				image: '',
				ctaLabel: 'View Service',
				testId: 'homepage-card'
			}
		});

		const card = screen.getByTestId('homepage-card');
		expect(card).toHaveAttribute('data-homepage-card-shell', 'true');
		expect(screen.getByText('View Service')).toBeTruthy();
		expect(screen.queryByRole('img')).toBeNull();
	});

	it('keeps service and task homepage cards on the shared shell path', () => {
		render(FeaturedServiceCard, {
			props: {
				service: {
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
			}
		});

		render(LiveTaskCard, {
			props: {
				task: {
					id: 'task-1',
					title: 'Featured Task',
					budget: 120,
					proposals: 4,
					timeLeft: '2 days',
					image: 'https://cdn.example.com/task.jpg'
				}
			}
		});

		expect(screen.getByTestId('featured-service-card')).toHaveAttribute(
			'data-homepage-card-shell',
			'true'
		);
		expect(screen.getByTestId('featured-task-card')).toHaveAttribute(
			'data-homepage-card-shell',
			'true'
		);
		expect(screen.getByRole('link', { name: /Featured Service/i })).toHaveAttribute(
			'href',
			'/services/service-1'
		);
		expect(screen.getByRole('link', { name: /Featured Task/i })).toHaveAttribute(
			'href',
			'/tasks/task-1'
		);
	});
});
