export function profilePictureFromImages(
	images: Array<{ url?: string | null }>
): string | undefined {
	const url = images.find((image) => image?.url)?.url?.trim();
	return url || undefined;
}

export function markPrimaryImage<T extends { isPrimary?: boolean }>(images: T[]): T[] {
	return images.map((image, index) => ({ ...image, isPrimary: index === 0 }));
}
