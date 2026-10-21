import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom';

const hoisted = vi.hoisted(() => {
	function readable<T>(initialValue: T) {
		let value = initialValue;
		return {
			set(next: T) {
				value = next;
			},
			subscribe(fn: (v: T) => void) {
				fn(value);
				return () => {};
			}
		};
	}

	const translations: Record<string, string> = {
		'dashboard.task_details_by_task.bid_now': 'Bid Now',
		'dashboard.task_details_by_task.deadline_expired_message': 'Bidding is closed.',
		'dashboard.task_details_by_task.you_are_owner': 'You are the owner',
		'dashboard.task_details_by_task.interested_in_task': 'Interested?',
		'dashboard.task_details_by_task.login': 'Login',
		'dashboard.task_details_by_task.title': 'Task',
		'dashboard.task_details_by_task.description': 'Details',
		'dashboard.task_details_by_task.loading': 'Loading',
		'common.status.expired': 'Expired'
	};

	return {
		readable,
		mockFindEventById: vi.fn(),
		translations
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => hoisted.translations[key] ?? key),
		locale: readable('en')
	};
});

vi.mock('$app/environment', () => ({
	browser: true,
	dev: false,
	building: false
}));

vi.mock('$lib/stores/user.store', () => ({
	user: hoisted.readable({ npub: 'viewer-npub' })
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: hoisted.readable({ isAuthenticated: true, isLoading: false })
}));

vi.mock('$lib/stores/translation.store', () => ({
	currentUserLanguage: hoisted.readable('en')
}));

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEventById: (...args: unknown[]) => hoisted.mockFindEventById(...args),
		requestEvents: vi.fn()
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(100_000)
	}
}));

vi.mock('$lib/services/task-translation.service', () => ({
	taskTranslationService: {
		getStoredTranslation: vi.fn().mockReturnValue(null)
	}
}));

vi.mock('$lib/components/StreamPlayer.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/Gallery.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/TaskShareButton.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/moderation/ActionsMenu.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/TranslatableTask.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/maps/TaskLocationMap.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/Drawer.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/bidding/BidForm.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({ default: () => null }));

vi.mock('~icons/mdi/alert-circle', () => ({
	default: vi.fn(() => 'svg')
}));
vi.mock('~icons/mdi/calendar-clock', () => ({
	default: vi.fn(() => 'svg')
}));
vi.mock('~icons/mdi/map-marker', () => ({
	default: vi.fn(() => 'svg')
}));
vi.mock('~icons/mdi/map-marker-check', () => ({
	default: vi.fn(() => 'svg')
}));

const EVENT_ID = 'a'.repeat(64);

function mockTask(deadline: string | null, npub = 'poster-npub') {
	hoisted.mockFindEventById.mockResolvedValue({
		data: {
			id: EVENT_ID,
			pubkey: npub,
			content: JSON.stringify({
				title: 'Video Editing',
				description: 'Edit a short clip',
				budget: { amount: 20, currency: 'USD', type: 'FIXED' },
				status: 'OPEN',
				deadline,
				skills: [],
				categories: [],
				attachments: [],
				creator: { username: 'Jeni Ari', avatar: '' }
			}),
			tags: [['d', 'video-editing']],
			kind: 31000,
			created_at: 1,
			sig: 'c'.repeat(64)
		}
	});
}

async function renderDetails() {
	const { default: TaskDetailsView } = await import('$lib/components/task/TaskDetailsView.svelte');
	return render(TaskDetailsView, { taskId: EVENT_ID });
}

describe('TaskDetailsView expired bidding', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('shows EXPIRED and does not offer Bid Now after the deadline', async () => {
		mockTask('2026-07-12');
		await renderDetails();

		expect(await screen.findByTestId('task-expired-alert')).toBeTruthy();
		expect(screen.getByText('Expired')).toBeTruthy();
		expect(screen.getByText('Bidding is closed.')).toBeTruthy();
		expect(screen.queryByText(/still open for bidding/i)).toBeNull();
		expect(screen.queryByTestId('bid-now')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Bid Now' })).toBeNull();
	});

	it('shows Bid Now while the deadline day is still open', async () => {
		mockTask('2099-12-31');
		await renderDetails();

		expect(await screen.findByTestId('bid-now')).toBeEnabled();
		expect(screen.queryByTestId('task-expired-alert')).toBeNull();
	});

	it('keeps the owner message on an expired task', async () => {
		mockTask('2026-07-12', 'viewer-npub');
		await renderDetails();

		expect(await screen.findByText('You are the owner')).toBeTruthy();
		expect(screen.getByTestId('task-expired-alert')).toBeTruthy();
		expect(screen.queryByTestId('bid-now')).toBeNull();
	});
});
