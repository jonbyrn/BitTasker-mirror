import type { Page } from '@playwright/test';

type TasksMockMode = 'happy' | 'empty' | 'slow' | 'error';

type TasksApiMockOptions = {
	mode?: TasksMockMode;
	delayMs?: number;
};

type MockTaskRecord = {
	id: string;
	npub: string;
	status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
	title: string;
	description: string;
	taskType: 'REMOTE' | 'ONSITE';
	createdAt: number;
	creator: { username: string; avatar: string; rating: number };
	pickupLocation?: {
		displayName: string;
		longitude: number;
		latitude: number;
		zipCode: string;
		locationLoaded: boolean;
	} | null;
	dropOffLocation?: {
		displayName: string;
		longitude: number;
		latitude: number;
		zipCode: string;
		locationLoaded: boolean;
	} | null;
};

const NOW_SECONDS = Math.floor(Date.now() / 1000);

const BASE_TASKS: MockTaskRecord[] = [
	{
		id: 'task-open-remote-1',
		npub: 'npub-test-a',
		status: 'OPEN',
		title: 'Mock Open Remote Task',
		description: 'Deterministic mock task used for E2E drawer and bid flows.',
		taskType: 'REMOTE',
		createdAt: NOW_SECONDS - 50,
		creator: { username: 'mock-user-a', avatar: '', rating: 4.9 },
		pickupLocation: null,
		dropOffLocation: null
	},
	{
		id: 'task-open-onsite-2',
		npub: 'npub-test-b',
		status: 'OPEN',
		title: 'Mock Onsite Task',
		description: 'Contains map-ready coordinates for deterministic map flows.',
		taskType: 'ONSITE',
		createdAt: NOW_SECONDS - 100,
		creator: { username: 'mock-user-b', avatar: '', rating: 4.8 },
		pickupLocation: {
			displayName: 'Austin, TX',
			longitude: -97.7431,
			latitude: 30.2672,
			zipCode: '78701',
			locationLoaded: true
		},
		dropOffLocation: null
	},
	{
		id: 'task-assigned-3',
		npub: 'npub-test-c',
		status: 'ASSIGNED',
		title: 'Mock Assigned Task',
		description: 'Closed bidding task to verify disabled state handling.',
		taskType: 'REMOTE',
		createdAt: NOW_SECONDS - 150,
		creator: { username: 'mock-user-c', avatar: '', rating: 4.7 },
		pickupLocation: null,
		dropOffLocation: null
	}
];

function toTaskPayload(task: MockTaskRecord) {
	return {
		estimatedHours: 4,
		id: task.id,
		npub: task.npub,
		status: task.status,
		title: task.title,
		taskType: task.taskType,
		description: task.description,
		budget: { amount: 250_000, currency: 'SATS', type: 'FIXED' },
		deadline: null,
		dateRange: null,
		pickupLocation: task.pickupLocation ?? null,
		dropOffLocation: task.dropOffLocation ?? null,
		skills: ['TypeScript', 'Testing'],
		categories: [],
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: task.createdAt,
		updatedAt: new Date(task.createdAt * 1000).toISOString(),
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: [],
		creator: task.creator,
		bids: []
	};
}

function buildEvents(tasks: MockTaskRecord[]) {
	return tasks.map((task, index) => ({
		id: `event-${task.id}-${index}`,
		pubkey: task.npub,
		created_at: task.createdAt,
		kind: 30000,
		tags: [['d', task.id]],
		content: JSON.stringify(toTaskPayload(task)),
		sig: `sig-${task.id}`
	}));
}

export async function mockTasksEventsApi(
	page: Page,
	{ mode = 'happy', delayMs = 0 }: TasksApiMockOptions = {}
): Promise<void> {
	await page.route('**/api/v1/events**', async (route, request) => {
		if (request.method() !== 'GET') {
			await route.continue();
			return;
		}

		if (delayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}

		if (mode === 'error') {
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'Mocked tasks API failure' })
			});
			return;
		}

		const events = mode === 'empty' ? [] : buildEvents(BASE_TASKS);
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: events })
		});
	});
}
