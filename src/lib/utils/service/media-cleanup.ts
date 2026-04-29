import uploadService, { type UploadResult } from '$lib/api/services/upload.service';
import type { Attachment } from '$lib/types/task';

function normalizeAttachmentType(type: string | undefined): UploadResult['type'] {
	if (typeof type === 'string') {
		if (type.startsWith('image/')) {
			return 'image';
		}
		if (type.startsWith('video/')) {
			return 'video';
		}
	}

	return 'document';
}

function toUploadResult(attachment: Attachment): UploadResult {
	const normalizedType = normalizeAttachmentType(attachment.type);

	return {
		url: attachment.url,
		key: attachment.key,
		cloudflareId: attachment.key,
		type: normalizedType,
		size: attachment.size
	};
}

export async function deleteServicePortfolioMedia(
	attachments: Attachment[] | null | undefined
): Promise<void> {
	if (!attachments || attachments.length === 0) {
		return;
	}

	const results = await Promise.allSettled(
		attachments
			.filter((attachment) => Boolean(attachment?.key))
			.map((attachment) => uploadService.deleteFile(toUploadResult(attachment)))
	);

	for (const result of results) {
		if (result.status === 'rejected') {
			console.warn('Failed to delete service portfolio media:', result.reason);
		}
	}
}
