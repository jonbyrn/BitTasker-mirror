import type { SavedSearch, SearchTasksParams } from '$lib/types/task';

const storageKey = 'bittasker.saved-searches';

function read(): SavedSearch[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as SavedSearch[];
	} catch {
		return [];
	}
}

function write(searches: SavedSearch[]): void {
	if (typeof localStorage !== 'undefined')
		localStorage.setItem(storageKey, JSON.stringify(searches));
}

export async function getSavedSearches(): Promise<SavedSearch[]> {
	return read();
}

export async function saveSearch(
	name: string,
	params: SearchTasksParams,
	options: Pick<SavedSearch, 'notifyOnMatch' | 'isActive' | 'notificationFrequency'> = {}
): Promise<SavedSearch> {
	const search: SavedSearch = {
		id: crypto.randomUUID(),
		name,
		params,
		createdAt: Date.now(),
		...options
	};
	write([...read(), search]);
	return search;
}

export async function updateSavedSearch(
	id: string,
	changes: Partial<SavedSearch>
): Promise<SavedSearch> {
	const searches = read();
	const index = searches.findIndex((search) => search.id === id);
	if (index < 0) throw new Error('Saved search not found');
	const updated = { ...searches[index], ...changes };
	searches[index] = updated;
	write(searches);
	return updated;
}

export async function deleteSavedSearch(id: string): Promise<void> {
	write(read().filter((search) => search.id !== id));
}

export async function markNotificationsAsRead(id: string): Promise<void> {
	await updateSavedSearch(id, { unreadNotifications: 0 });
}
