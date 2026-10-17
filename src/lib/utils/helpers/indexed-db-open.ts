/** IndexedDB opens that never fire success or error must not pin the wallet on Loading. */
export const IDB_OPEN_MS = 4_000;

export class IndexedDbTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'IndexedDbTimeoutError';
	}
}

function settle(
	settled: { current: boolean },
	timer: ReturnType<typeof setTimeout> | undefined,
	run: () => void
): void {
	if (settled.current) return;
	settled.current = true;
	clearTimeout(timer);
	run();
}

/**
 * Open a database and reject if the request is blocked or never completes.
 * A late success after rejection closes the connection so it cannot block the next open.
 */
export function openIndexedDb(
	name: string,
	version?: number,
	upgrade?: (db: IDBDatabase) => void,
	timeoutMs = IDB_OPEN_MS
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const settled = { current: false };
		const timer =
			timeoutMs > 0
				? setTimeout(() => {
						settle(settled, timer, () => reject(new IndexedDbTimeoutError(`${name} timed out`)));
					}, timeoutMs)
				: undefined;

		let request: IDBOpenDBRequest;
		try {
			request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
		} catch (error) {
			settle(settled, timer, () =>
				reject(error instanceof Error ? error : new Error(String(error)))
			);
			return;
		}

		request.onblocked = () => {
			settle(settled, timer, () => reject(new IndexedDbTimeoutError(`${name} blocked`)));
		};
		request.onupgradeneeded = () => {
			try {
				upgrade?.(request.result);
			} catch (error) {
				settle(settled, timer, () =>
					reject(error instanceof Error ? error : new Error(`${name} upgrade failed`))
				);
			}
		};
		request.onsuccess = () => {
			const db = request.result;
			db.onversionchange = () => db.close();
			if (settled.current) {
				db.close();
				return;
			}
			settle(settled, timer, () => resolve(db));
		};
		request.onerror = () => {
			settle(settled, timer, () => reject(request.error ?? new Error(`${name} failed`)));
		};
	});
}

export function idbRequest<T>(
	request: IDBRequest<T>,
	label: string,
	timeoutMs = IDB_OPEN_MS
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer =
			timeoutMs > 0
				? setTimeout(() => {
						reject(new IndexedDbTimeoutError(`${label} timed out`));
					}, timeoutMs)
				: undefined;
		request.onsuccess = () => {
			clearTimeout(timer);
			resolve(request.result);
		};
		request.onerror = () => {
			clearTimeout(timer);
			reject(request.error ?? new Error(`${label} failed`));
		};
	});
}

export async function withIndexedDb<T>(
	opened: Promise<IDBDatabase>,
	run: (db: IDBDatabase) => Promise<T>
): Promise<T> {
	const db = await opened;
	try {
		return await run(db);
	} finally {
		db.close();
	}
}
