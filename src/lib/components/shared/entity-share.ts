export interface EntitySharePayload {
	title: string;
	text: string;
	url: string;
}

export interface EntityShareNativePayload extends EntitySharePayload {
	dialogTitle: string;
}

export interface EntityShareOptions {
	isNativePlatform: boolean;
	nativeShare: (payload: EntityShareNativePayload) => Promise<void>;
	webShare: ((payload: EntitySharePayload) => Promise<void>) | null;
	copyToClipboard: (text: string) => Promise<boolean>;
}

export type EntityShareResult = 'shared' | 'copied' | 'copy_failed' | 'skipped';

export async function shareEntity(
	payload: EntitySharePayload | null | undefined,
	options: EntityShareOptions
): Promise<EntityShareResult> {
	if (!payload?.url) {
		return 'skipped';
	}

	if (options.isNativePlatform) {
		try {
			await options.nativeShare({
				...payload,
				dialogTitle: payload.title
			});
			return 'shared';
		} catch {
			// Fall through to the next available share path.
		}
	}

	if (options.webShare) {
		try {
			await options.webShare(payload);
			return 'shared';
		} catch {
			// Fall through to clipboard copy.
		}
	}

	const copied = await options.copyToClipboard(`${payload.text}\n\n${payload.url}`);
	return copied ? 'copied' : 'copy_failed';
}
