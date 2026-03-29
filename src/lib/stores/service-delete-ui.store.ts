import { get, writable } from 'svelte/store';
import type { Service } from '$lib/types/service.d';

export interface PendingServiceDeleteEntry {
	key: string;
	serviceId: string;
	uniqueId: string | null;
	title: string;
	startedAt: number;
}

type ServiceDeleteIdentity = Pick<Service, 'id' | 'uniqueId' | 'title'>;

export const pendingServiceDeleteStore = writable<PendingServiceDeleteEntry[]>([]);

export function getPendingServiceDeleteKey(service: Pick<Service, 'id' | 'uniqueId'>): string {
	const uniqueId = typeof service.uniqueId === 'string' ? service.uniqueId.trim() : '';
	return uniqueId.length > 0 ? uniqueId : service.id;
}

export function markServiceDeletePending(service: ServiceDeleteIdentity): void {
	const key = getPendingServiceDeleteKey(service);

	pendingServiceDeleteStore.update((entries) => {
		const nextEntry: PendingServiceDeleteEntry = {
			key,
			serviceId: service.id,
			uniqueId: service.uniqueId ?? null,
			title: service.title?.trim() || 'Untitled service',
			startedAt: Date.now()
		};

		return [
			nextEntry,
			...entries.filter((entry) => entry.key !== key && entry.serviceId !== service.id)
		];
	});
}

export function clearPendingServiceDelete(
	service: Pick<Service, 'id' | 'uniqueId'> | string
): void {
	const key =
		typeof service === 'string'
			? service
			: getPendingServiceDeleteKey({ id: service.id, uniqueId: service.uniqueId });

	pendingServiceDeleteStore.update((entries) =>
		entries.filter((entry) => entry.key !== key && entry.serviceId !== key)
	);
}

export function reconcilePendingServiceDeletes<T extends Pick<Service, 'id' | 'uniqueId'>>(
	services: T[]
): void {
	pendingServiceDeleteStore.update((entries) =>
		entries.filter((entry) => {
			const matchingService = services.find(
				(service) => getPendingServiceDeleteKey(service) === entry.key
			);

			if (!matchingService) {
				return false;
			}

			return matchingService.id === entry.serviceId;
		})
	);
}

export function filterPendingDeletedServices<T extends Pick<Service, 'id' | 'uniqueId'>>(
	services: T[]
): T[] {
	const pendingEntries = get(pendingServiceDeleteStore);
	if (pendingEntries.length === 0) {
		return services;
	}

	const pendingKeys = new Set(pendingEntries.map((entry) => entry.key));
	const pendingIds = new Set(pendingEntries.map((entry) => entry.serviceId));

	return services.filter((service) => {
		const key = getPendingServiceDeleteKey({ id: service.id, uniqueId: service.uniqueId });
		return !pendingKeys.has(key) && !pendingIds.has(service.id);
	});
}

export function resetServiceDeleteUiState(): void {
	pendingServiceDeleteStore.set([]);
}
