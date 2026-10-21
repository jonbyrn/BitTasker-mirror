import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { Task } from '$lib/types/task';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

const publishNostrEvent = vi.fn();

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.task_details_by_task.deadline_expired_message': 'Bidding is closed.',
		'bid_form.form.submit_bid': 'Submit bid'
	};
	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en')
	};
});

vi.mock('$lib/stores/user.store', () => ({
	user: {
		subscribe: (fn: (v: { npub: string }) => void) => {
			fn({ npub: 'npub' });
			return () => {};
		}
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent: (...args: unknown[]) => publishNostrEvent(...args)
}));

vi.mock('$lib/utils/nostr-bid', () => ({
	clearBidCache: vi.fn()
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getRSKAddress: vi.fn()
}));

vi.mock('$lib/nostr/bid', () => ({
	generateBidTranslations: vi.fn()
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: { getCurrentPrice: vi.fn().mockResolvedValue(100_000) }
}));

vi.mock('$lib/components/date/DurationPickerModal.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/date/ScheduleDateTimeField.svelte', () => ({ default: () => null }));

function task(deadline: string): Task {
	return {
		id: 'video-editing',
		npub: 'poster',
		status: TaskStatusEnum.OPEN,
		title: 'Video Editing',
		description: 'Edit a short clip',
		taskType: TaskTypeEnum.REMOTE,
		budget: { amount: 20, currency: 'USD', type: BudgetTypeEnum.FIXED },
		deadline,
		dateRange: null,
		pickupLocation: null,
		dropOffLocation: null,
		skills: [],
		categories: [],
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: 1,
		updatedAt: '',
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: [],
		estimatedHours: 1
	};
}

describe('BidForm expired guard', () => {
	it('blocks submit on an expired task and does not publish', async () => {
		publishNostrEvent.mockClear();
		const { default: BidForm } = await import('$lib/components/bidding/BidForm.svelte');
		render(BidForm, {
			task: task('2026-07-12'),
			onClose: vi.fn(),
			stickySubmit: false
		});

		const submit = await screen.findByRole('button', { name: 'Submit bid' });
		expect(submit).toBeDisabled();
		const form = submit.closest('form');
		expect(form).toBeTruthy();
		await fireEvent.submit(form!);
		expect(publishNostrEvent).not.toHaveBeenCalled();
		expect(screen.getByText('Bidding is closed.')).toBeTruthy();
	});
});
