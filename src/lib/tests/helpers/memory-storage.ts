/** A localStorage stand-in. The Vitest setup stub drops every write. */
export function installMemoryStorage(): void {
	const map = new Map<string, string>();
	const storage: Storage = {
		get length() {
			return map.size;
		},
		clear() {
			map.clear();
		},
		getItem(key: string) {
			return map.get(key) ?? null;
		},
		key(index: number) {
			return [...map.keys()][index] ?? null;
		},
		removeItem(key: string) {
			map.delete(key);
		},
		setItem(key: string, value: string) {
			map.set(key, String(value));
		}
	};
	window.localStorage = storage;
}
