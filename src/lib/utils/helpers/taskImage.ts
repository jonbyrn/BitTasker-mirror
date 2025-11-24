import type { Task } from '$lib/types/task';

/**
 * Get the first image from task attachments (excluding videos)
 */
export function getFirstTaskImage(task: Task | null): string {
	if (!task?.attachments || task.attachments.length === 0) {
		return '';
	}

	const imageAttachment = task.attachments.find((attachment) => {
		const url = attachment.url.toLowerCase();
		const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
		return imageExtensions.some((ext) => url.includes(ext));
	});

	return imageAttachment?.url || '';
}

