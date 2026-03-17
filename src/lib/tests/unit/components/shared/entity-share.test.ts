import { describe, expect, it, vi } from 'vitest';
import { shareEntity } from '$lib/components/shared/entity-share';

describe('shareEntity', () => {
	it('uses native share first when running on a native platform', async () => {
		const nativeShare = vi.fn().mockResolvedValue(undefined);
		const webShare = vi.fn().mockResolvedValue(undefined);
		const copyToClipboard = vi.fn().mockResolvedValue(true);

		const result = await shareEntity(
			{
				title: 'Task title',
				text: 'Task text',
				url: 'https://bittasker.test/tasks/task-1'
			},
			{
				isNativePlatform: true,
				nativeShare,
				webShare,
				copyToClipboard
			}
		);

		expect(result).toBe('shared');
		expect(nativeShare).toHaveBeenCalledWith({
			title: 'Task title',
			text: 'Task text',
			url: 'https://bittasker.test/tasks/task-1',
			dialogTitle: 'Task title'
		});
		expect(webShare).not.toHaveBeenCalled();
		expect(copyToClipboard).not.toHaveBeenCalled();
	});

	it('falls back to web share when native share fails', async () => {
		const nativeShare = vi.fn().mockRejectedValue(new Error('native failed'));
		const webShare = vi.fn().mockResolvedValue(undefined);
		const copyToClipboard = vi.fn().mockResolvedValue(true);

		const result = await shareEntity(
			{
				title: 'Service title',
				text: 'Service text',
				url: 'https://bittasker.test/services/service-1'
			},
			{
				isNativePlatform: true,
				nativeShare,
				webShare,
				copyToClipboard
			}
		);

		expect(result).toBe('shared');
		expect(nativeShare).toHaveBeenCalledTimes(1);
		expect(webShare).toHaveBeenCalledWith({
			title: 'Service title',
			text: 'Service text',
			url: 'https://bittasker.test/services/service-1'
		});
		expect(copyToClipboard).not.toHaveBeenCalled();
	});

	it('falls back to clipboard when web share fails', async () => {
		const copyToClipboard = vi.fn().mockResolvedValue(true);

		const result = await shareEntity(
			{
				title: 'Task title',
				text: 'Task text',
				url: 'https://bittasker.test/tasks/task-1'
			},
			{
				isNativePlatform: false,
				nativeShare: vi.fn(),
				webShare: vi.fn().mockRejectedValue(new Error('share failed')),
				copyToClipboard
			}
		);

		expect(result).toBe('copied');
		expect(copyToClipboard).toHaveBeenCalledWith(
			'Task text\n\nhttps://bittasker.test/tasks/task-1'
		);
	});

	it('reports clipboard failure when every share path fails', async () => {
		const result = await shareEntity(
			{
				title: 'Task title',
				text: 'Task text',
				url: 'https://bittasker.test/tasks/task-1'
			},
			{
				isNativePlatform: false,
				nativeShare: vi.fn(),
				webShare: null,
				copyToClipboard: vi.fn().mockResolvedValue(false)
			}
		);

		expect(result).toBe('copy_failed');
	});

	it('skips work when the payload is missing', async () => {
		const nativeShare = vi.fn();
		const copyToClipboard = vi.fn();

		const result = await shareEntity(null, {
			isNativePlatform: false,
			nativeShare,
			webShare: null,
			copyToClipboard
		});

		expect(result).toBe('skipped');
		expect(nativeShare).not.toHaveBeenCalled();
		expect(copyToClipboard).not.toHaveBeenCalled();
	});
});
