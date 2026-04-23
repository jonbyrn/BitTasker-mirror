import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

test.describe('tasks and services public browse regression', () => {
	test('loads the task browse shell without breaking shared listing behavior', async ({ page }) => {
		await mockListingRequests(page);
		await assertBrowseShell(page, {
			path: '/tasks',
			panelSelector: '#panel-find-tasks',
			contentSelector: 'section[data-tasks-content-area]'
		});
	});

	test('loads the service browse shell without breaking shared listing behavior', async ({
		page
	}) => {
		await mockListingRequests(page);
		await assertBrowseShell(page, {
			path: '/services',
			panelSelector: '#panel-find-services',
			contentSelector: 'section[data-services-content-area]'
		});
	});
});

async function assertBrowseShell(
	page: Page,
	{
		path,
		panelSelector,
		contentSelector
	}: {
		path: '/tasks' | '/services';
		panelSelector: string;
		contentSelector: string;
	}
) {
	await page.goto(path);

	const panel = page.locator(panelSelector);
	await expect(panel).toBeVisible();
	await expect(panel.locator(contentSelector)).toBeVisible();
	await expect(panel.locator('input[type="text"]').first()).toBeVisible();
	await expect(panel.locator('nav[aria-label="Search actions"]')).toBeVisible();
	await expect(panel.locator('nav[aria-label="Search actions"] button').first()).toBeVisible();
}

async function mockListingRequests(page: Page) {
	const taskEvents = [createTaskEvent()];
	const serviceEvents = [createServiceEvent()];

	await page.route('**/api/v1/events/request', async (route) => {
		const requestBody = route.request().postData() ?? '';
		const isServiceRequest = requestBody.includes('30402');

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: isServiceRequest ? serviceEvents : taskEvents })
		});
	});

	await page.route('**/api/v1/events**', async (route) => {
		const requestUrl = new URL(route.request().url());
		const rawKinds = requestUrl.searchParams
			.getAll('kinds')
			.concat(requestUrl.searchParams.getAll('kinds[]'));
		const isServiceRequest = rawKinds.some((kind) => kind.includes('30402'));

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: isServiceRequest ? serviceEvents : taskEvents })
		});
	});
}

function createTaskEvent() {
	return {
		id: 'task-regression-event-1',
		pubkey: 'd'.repeat(64),
		created_at: 1_700_100_001,
		kind: 30023,
		tags: [['d', 'task-regression-1']],
		content: JSON.stringify({
			title: 'Regression task',
			description: 'Regression task description',
			status: 'OPEN',
			budget: {
				amount: 125,
				currency: 'USD'
			},
			attachments: [],
			deadline: '2030-01-01T00:00:00.000Z',
			categories: [{ id: 'cat-writing', name: 'Writing', slug: 'writing' }],
			skills: ['Writing']
		}),
		sig: 'e'.repeat(128)
	};
}

function createServiceEvent() {
	return {
		id: 'service-regression-event-1',
		pubkey: 'b'.repeat(64),
		created_at: 1_700_000_100,
		kind: 30402,
		tags: [['d', 'service-regression-1']],
		content: JSON.stringify({
			uniqueId: 'service-regression-1',
			status: 'active',
			title: 'Regression service',
			description: 'Regression service description',
			serviceLocationTypes: ['remote'],
			locationDetails: {},
			pricing: {
				type: 'FIXED',
				amount: 85
			},
			skills: ['Design'],
			categories: [{ id: 'cat-design', name: 'Design', slug: 'design' }],
			portfolio: [],
			creator: {
				username: 'regression-provider',
				avatar: ''
			},
			createdAt: 1_700_000_100
		}),
		sig: 'c'.repeat(128)
	};
}
