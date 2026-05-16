import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskShareButton from '$lib/components/task/TaskShareButton.svelte';
import { TaskTypeEnum } from '$lib/utils/enums/task.enum';

const {
	isNativePlatform,
	copyToClipboard,
	showSuccessToast,
	showErrorToast,
	getStoredTranslation
} = vi.hoisted(() => ({
	isNativePlatform: vi.fn(() => false),
	copyToClipboard: vi.fn().mockResolvedValue(true),
	showSuccessToast: vi.fn(),
	showErrorToast: vi.fn(),
	getStoredTranslation: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform
	}
}));

vi.mock('$lib/utils/helpers/clipboard', () => ({
	copyToClipboard
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast,
		showErrorToast
	}
}));

vi.mock('$lib/stores/translation.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		currentUserLanguage: writable('en')
	};
});

vi.mock('$lib/services/task-translation.service', () => ({
	taskTranslationService: {
		getStoredTranslation
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.task_details_by_task.share_task': 'Share task',
		'dashboard.task_details_by_task.share': 'Share',
		'dashboard.task_details_by_task.title': 'Task',
		'dashboard.task_details_by_task.remote': 'Remote',
		'common.share.check_out_task': 'Check out this task',
		'common.share.budget': 'Budget',
		'common.share.location': 'Location',
		'common.toast.link_copied': 'Link copied',
		'common.toast.link_copy_failed': 'Copy failed'
	};

	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en')
	};
});

describe('TaskShareButton', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(navigator, 'share', {
			value: vi.fn().mockResolvedValue(undefined),
			configurable: true
		});
		getStoredTranslation.mockReturnValue({
			translatedTitle: 'Translated task title',
			translatedDescription: 'Translated task description'
		});
	});

	it('shares the translated task payload through the shared entity button', async () => {
		render(TaskShareButton, {
			task: {
				id: 'task-123',
				title: 'Original task title',
				description: 'Original task description',
				budget: { amount: 250 },
				taskType: TaskTypeEnum.REMOTE
			} as any,
			variant: 'default'
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Share task' }));

		await waitFor(() => {
			expect(navigator.share).toHaveBeenCalledWith({
				title: 'Translated task title',
				text: expect.stringContaining('Translated task description'),
				url: 'http://localhost/tasks/task-123'
			});
		});

		expect(navigator.share).toHaveBeenCalledWith(
			expect.objectContaining({
				text: expect.stringContaining('Budget')
			})
		);
		expect(navigator.share).toHaveBeenCalledWith(
			expect.objectContaining({
				text: expect.stringContaining('Remote')
			})
		);
		await waitFor(() => {
			expect(showSuccessToast).toHaveBeenCalledWith('Link copied');
		});
		expect(copyToClipboard).not.toHaveBeenCalled();
		expect(screen.getByText('Share')).toBeInTheDocument();
	});
});
