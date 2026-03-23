import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import DashboardBidsPanel from '$lib/components/bidding/DashboardBidsPanel.svelte';

const { goto, getMyBids, getCurrentPrice } = vi.hoisted(() => ({
	goto: vi.fn(),
	getMyBids: vi.fn().mockResolvedValue([]),
	getCurrentPrice: vi.fn().mockResolvedValue(100000)
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$app/navigation', () => ({
	goto
}));

vi.mock('$lib/utils/nostr-bid', () => ({
	getMyBids,
	getBidStatus: vi.fn(),
	cachedSatsFromUsd: vi.fn(() => '0'),
	clearBidCache: vi.fn()
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice
	}
}));

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => ({ $$render: () => '<div>Deadline</div>' })
}));

vi.mock('$lib/components/task/TaskLocationDisplay.svelte', () => ({
	default: () => ({ $$render: () => '<div>Location</div>' })
}));

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: () => ({ $$render: () => '<div>User</div>' })
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: vi.fn(),
	publishToMultipleRelays: vi.fn()
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

vi.mock('$lib/services/task-translation.service', () => ({
	taskTranslationService: {
		getStoredTranslation: vi.fn().mockReturnValue(null)
	}
}));

describe('DashboardBidsPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getMyBids.mockResolvedValue([]);
		getCurrentPrice.mockResolvedValue(100000);
	});

	it('shows the shared empty state with a find-tasks CTA when there are no bids', async () => {
		const { getByTestId, getByRole } = render(DashboardBidsPanel);

		await waitFor(() => expect(getMyBids).toHaveBeenCalled());
		expect(getByTestId('dashboard-bids-empty-state')).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'dashboard.find_task' }));

		expect(goto).toHaveBeenCalledWith('/tasks');
	});
});
