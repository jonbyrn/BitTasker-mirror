import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const serviceEvents = Array.from({ length: 10 }, (_, index) => createServiceEvent(index + 1));
const taskEvents = Array.from({ length: 3 }, (_, index) => createTaskEvent(index + 1));

test.describe('homepage featured services', () => {
	test('renders featured services above featured tasks with the shared shell contract', async ({
		page
	}) => {
		await mockHomepageFeaturedRequests(page, { serviceEvents, taskEvents });
		await page.goto('/');

		const servicesSection = page.getByTestId('homepage-featured-services');
		const tasksSection = page.getByTestId('homepage-featured-tasks');

		await expect(servicesSection).toBeVisible();
		await expect(tasksSection).toBeVisible();
		await expect(servicesSection).toHaveAttribute('data-homepage-featured-shell', 'true');
		await expect(tasksSection).toHaveAttribute('data-homepage-featured-shell', 'true');
		await expect(servicesSection.getByTestId('homepage-featured-services-cards')).toBeVisible();
		await expect(tasksSection.getByTestId('homepage-featured-tasks-cards')).toBeVisible();
		await expect(servicesSection.getByTestId('homepage-featured-services-view-all')).toHaveAttribute(
			'href',
			'/services'
		);
		await expect(servicesSection.getByTestId('homepage-featured-services-browse-cta')).toHaveAttribute(
			'href',
			'/services'
		);
		await expect(tasksSection.getByTestId('homepage-featured-tasks-view-all')).toHaveAttribute(
			'href',
			'/tasks'
		);
		await expect(tasksSection.getByTestId('homepage-featured-tasks-browse-cta')).toHaveAttribute(
			'href',
			'/tasks'
		);

		const serviceBox = await servicesSection.boundingBox();
		const benefitsBox = await page.getByTestId('homepage-benefits').boundingBox();
		const taskBox = await tasksSection.boundingBox();
		expect(serviceBox?.y ?? Number.MAX_SAFE_INTEGER).toBeLessThan(taskBox?.y ?? 0);
		expect(benefitsBox?.y ?? Number.MAX_SAFE_INTEGER).toBeLessThan(taskBox?.y ?? 0);

		const serviceCards = page.getByTestId('featured-service-card');
		await expect(serviceCards).toHaveCount(8);

		const firstServiceCard = serviceCards.first();
		await expect(firstServiceCard).toContainText('Featured service 1');
		await expect(firstServiceCard).toContainText('From $85');
		await expect(firstServiceCard).toContainText('Remote');
		await expect(firstServiceCard).toHaveAttribute('href', '/services/featured-service-1');
		await expect(firstServiceCard).toHaveAttribute('data-homepage-card-shell', 'true');
		await expect(page.getByTestId('featured-task-card').first()).toHaveAttribute(
			'data-homepage-card-shell',
			'true'
		);
		await expect(serviceCards.nth(7)).toContainText('Featured service 8');

		await page.goto('/services/featured-service-1');
		await expect(page).toHaveURL(/\/services\/featured-service-1$/);
	});

	test('hides the featured services section when the service query returns no items', async ({
		page
	}) => {
		await mockHomepageFeaturedRequests(page, {
			serviceEvents: [],
			taskEvents
		});

		await page.goto('/');

		await expect(page.getByTestId('homepage-featured-services')).toHaveCount(0);
		await expect(page.getByTestId('homepage-featured-tasks')).toBeVisible();
	});

	test('hides the featured services section when the service query fails', async ({ page }) => {
		await mockHomepageFeaturedRequests(page, {
			serviceEvents,
			taskEvents,
			failServices: true
		});

		await page.goto('/');

		await expect(page.getByTestId('homepage-featured-services')).toHaveCount(0);
		await expect(page.getByTestId('homepage-featured-tasks')).toBeVisible();
	});
});

async function mockHomepageFeaturedRequests(
	page: Page,
	options: {
		serviceEvents: Array<Record<string, unknown>>;
		taskEvents: Array<Record<string, unknown>>;
		failServices?: boolean;
	}
) {
	await page.route('**/api/v1/events/request', async (route) => {
		const requestBody = route.request().postData() ?? '';
		const isServiceRequest = requestBody.includes('30402');

		if (isServiceRequest && options.failServices) {
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'featured services failed' })
			});
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: isServiceRequest ? options.serviceEvents : options.taskEvents })
		});
	});

	await page.route('**/api/v1/events**', async (route) => {
		const requestUrl = new URL(route.request().url());
		const rawKinds = requestUrl.searchParams
			.getAll('kinds')
			.concat(requestUrl.searchParams.getAll('kinds[]'));
		const isServiceRequest = rawKinds.some((kind) => kind.includes('30402'));

		if (isServiceRequest && options.failServices) {
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'featured services failed' })
			});
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: isServiceRequest ? options.serviceEvents : options.taskEvents })
		});
	});
}

function createServiceEvent(index: number) {
	return {
		id: `service-event-${index}`,
		pubkey: 'b'.repeat(64),
		created_at: 1_700_000_100 - index,
		kind: 30402,
		tags: [['d', `featured-service-${index}`]],
		content: JSON.stringify({
			uniqueId: `featured-service-${index}`,
			status: 'active',
			title: `Featured service ${index}`,
			description: `Provider description ${index}`,
			serviceLocationTypes: ['remote'],
			locationDetails: {},
			pricing: {
				type: index === 1 ? 'TIERED' : 'FIXED',
				amount: index === 1 ? undefined : 40 + index,
				tiers:
					index === 1
						? [
								{
									id: 'basic',
									name: 'Basic',
									description: 'Base package',
									price: 85,
									features: ['One revision']
								}
							]
						: undefined
			},
			skills: ['Design'],
			categories: [{ id: 'cat-design', name: 'Design', slug: 'design' }],
			portfolio: [
				{
					url: `https://cdn.example.com/featured-service-${index}.jpg`,
					type: 'image/jpeg',
					alt: `Featured service ${index}`
				}
			],
			createdAt: 1_700_000_100 - index,
			creator: {
				username: `provider-${index}`,
				avatar: ''
			}
		}),
		sig: 'c'.repeat(128)
	};
}

function createTaskEvent(index: number) {
	return {
		id: `task-event-${index}`,
		pubkey: 'd'.repeat(64),
		created_at: 1_700_100_000 + index,
		kind: 30023,
		tags: [['d', `featured-task-${index}`]],
		content: JSON.stringify({
			title: `Featured task ${index}`,
			description: `Task description ${index}`,
			status: 'OPEN',
			budget: {
				amount: 120 + index,
				currency: 'USD'
			},
			attachments: [
				{
					url: `https://cdn.example.com/featured-task-${index}.jpg`,
					type: 'image/jpeg',
					alt: `Featured task ${index}`
				}
			],
			deadline: '2030-01-01T00:00:00.000Z',
			categories: [{ id: 'cat-writing', name: 'Writing', slug: 'writing' }],
			skills: ['Writing']
		}),
		sig: 'e'.repeat(128)
	};
}
