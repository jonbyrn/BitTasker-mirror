/** One in-flight init. A failure clears the slot so the next caller can retry. */
export function shareInit<T>(
	slot: { current: Promise<T> | null },
	run: () => Promise<T>
): Promise<T> {
	if (slot.current) return slot.current;
	const promise = run().then(
		(value) => value,
		(error: unknown) => {
			if (slot.current === promise) slot.current = null;
			throw error;
		}
	);
	slot.current = promise;
	return promise;
}
