import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import TaskCompletionModal from '$lib/components/contracts/TaskCompletionModal.svelte';
import { EscrowStatus } from '$lib/utils/escrow';
import type { ContractWithEvents } from '$lib/types/contract';

interface MockContractEventContent {
	contextType: string;
	contextTitle: string;
	amount: string;
	serviceLocationType: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	[key: string]: unknown;
}

interface MockContractWithEvents {
	contractEvent: {
		content: MockContractEventContent;
	};
	status: EscrowStatus;
}

vi.mock('$lib/components/MediaUploader.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="media-uploader">uploader</div>'
	})
}));

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		deleteFile: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn()
	}
}));

vi.mock('$lib/stores/task.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		TASKS_PER_PAGE: 10,
		tasksStore: writable({ items: [] }),
		myTasksStore: writable({ items: [] }),
		taskStore: {}
	};
});

vi.mock('$lib/nostr/task', () => ({
	updateTask: vi.fn(),
	createTask: vi.fn(),
	deleteTask: vi.fn()
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		getContractKey: vi.fn((contract: MockContractWithEvents, key: string) => {
			if (key === 'amount') return contract.contractEvent.content.amount;
			return contract.contractEvent.content[key];
		})
	}
}));

vi.mock('$lib/components/contracts/ContractContextSummary.svelte', () => ({
	default: () => ({
		$$render: (_result: unknown, props: { contract: MockContractWithEvents }) =>
			`<div data-testid="context-summary">${props.contract.contractEvent.content.contextTitle}</div>`
	})
}));

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => ({
		$$render: (_result: unknown, props: { dateRangeStart: number; dateRangeEnd: number }) =>
			`<div data-testid="agreement-schedule">${props.dateRangeStart}-${props.dateRangeEnd}</div>`
	})
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

function buildContract(
	overrides: Partial<{
		contextTitle: string;
		serviceLocationType: string;
	}> = {}
): Partial<ContractWithEvents> {
	return {
		contractEvent: {
			content: {
				contextType: 'service',
				contextTitle: overrides.contextTitle ?? 'Premium logo package',
				amount: '0.01',
				serviceLocationType: overrides.serviceLocationType ?? 'REMOTE',
				estimatedStartTime: 1_700_000_000,
				estimatedCompletionTime: 1_700_086_400
			}
		},
		status: EscrowStatus.Completed
	} as Partial<ContractWithEvents>;
}

describe('TaskCompletionModal service context', () => {
	it('renders service-specific completion copy', () => {
		render(TaskCompletionModal, {
			contract: buildContract(),
			isOpen: true,
			onClose: vi.fn(),
			onComplete: vi.fn(),
			btcPrice: 100000
		});

		expect(screen.getByText('Mark service as complete')).toBeInTheDocument();
		expect(screen.getByText('Service details')).toBeInTheDocument();
		expect(screen.getByText('Upload service delivery evidence')).toBeInTheDocument();
		expect(screen.getByText('Mark service complete')).toBeInTheDocument();
		expect(screen.getByText('Agreement schedule')).toBeInTheDocument();
		expect(screen.getByText(/dashboard\.contracts\.amount:/)).toBeInTheDocument();
	});

	it('reuses the same evidence flow for remote and in-person service contracts', () => {
		const remoteView = render(TaskCompletionModal, {
			contract: buildContract({
				contextTitle: 'Remote brand package',
				serviceLocationType: 'REMOTE'
			}),
			isOpen: true,
			onClose: vi.fn(),
			onComplete: vi.fn(),
			btcPrice: 100000
		});
		const inPersonView = render(TaskCompletionModal, {
			contract: buildContract({
				contextTitle: 'On-site photography session',
				serviceLocationType: 'TASKER_LOCATION'
			}),
			isOpen: true,
			onClose: vi.fn(),
			onComplete: vi.fn(),
			btcPrice: 100000
		});

		expect(
			within(remoteView.container).getByText('Upload service delivery evidence')
		).toBeInTheDocument();
		expect(
			within(inPersonView.container).getByText('Upload service delivery evidence')
		).toBeInTheDocument();
		expect(screen.queryByText('Add completion evidence')).toBeNull();
		expect(within(remoteView.container).getByText('Agreement schedule')).toBeInTheDocument();
		expect(within(inPersonView.container).getByText('Agreement schedule')).toBeInTheDocument();
		expect(within(remoteView.container).getByText('Mark service complete')).toBeInTheDocument();
		expect(within(inPersonView.container).getByText('Mark service complete')).toBeInTheDocument();
	});
});
