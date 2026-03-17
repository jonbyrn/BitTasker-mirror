import { writable } from 'svelte/store';
import type { ServiceQuoteThread } from '$lib/types/service-quote';
import {
	queryTaskeeServiceQuoteThreads,
	queryTaskerServiceQuoteThreads
} from '$lib/utils/service-quote/query';
import { getNpub } from '$lib/utils/nostrKeys';

type ServiceQuoteStoreState = {
	taskerThreads: ServiceQuoteThread[];
	taskeeThreads: ServiceQuoteThread[];
	loadingTasker: boolean;
	loadingTaskee: boolean;
	error: string | null;
	activeServiceAddress: string | null;
	activeRequestId: string | null;
};

const initialState: ServiceQuoteStoreState = {
	taskerThreads: [],
	taskeeThreads: [],
	loadingTasker: false,
	loadingTaskee: false,
	error: null,
	activeServiceAddress: null,
	activeRequestId: null
};

function createServiceQuoteStore() {
	const { subscribe, update, set } = writable<ServiceQuoteStoreState>(initialState);

	return {
		subscribe,
		set,
		reset() {
			set(initialState);
		},
		async loadTaskerThreads(requestId?: string | null) {
			update((state) => ({
				...state,
				loadingTasker: true,
				error: null,
				activeRequestId: requestId ?? state.activeRequestId
			}));

			try {
				const taskerPubkey = await getNpub();
				const taskerThreads = await queryTaskerServiceQuoteThreads({
					taskerPubkey,
					quoteRequestId: requestId ?? undefined
				});
				update((state) => ({
					...state,
					taskerThreads,
					loadingTasker: false,
					activeRequestId: requestId ?? state.activeRequestId
				}));
				return taskerThreads;
			} catch (error) {
				update((state) => ({
					...state,
					loadingTasker: false,
					error: error instanceof Error ? error.message : 'Failed to load tasker quote threads'
				}));
				return [];
			}
		},
		async loadTaskeeThreads(serviceAddress: string, requestId?: string | null) {
			update((state) => ({
				...state,
				loadingTaskee: true,
				error: null,
				activeServiceAddress: serviceAddress,
				activeRequestId: requestId ?? state.activeRequestId
			}));

			try {
				const taskeePubkey = await getNpub();
				const taskeeThreads = await queryTaskeeServiceQuoteThreads({
					serviceAddress,
					taskeePubkey,
					quoteRequestId: requestId ?? undefined
				});
				update((state) => ({
					...state,
					taskeeThreads,
					loadingTaskee: false,
					activeServiceAddress: serviceAddress,
					activeRequestId: requestId ?? state.activeRequestId
				}));
				return taskeeThreads;
			} catch (error) {
				update((state) => ({
					...state,
					loadingTaskee: false,
					error: error instanceof Error ? error.message : 'Failed to load provider quote threads'
				}));
				return [];
			}
		}
	};
}

export const serviceQuoteStore = createServiceQuoteStore();
