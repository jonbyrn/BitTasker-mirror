import { writable, type Writable } from 'svelte/store';

interface InfiniteScroll {
    hasMore: boolean;
    threshold: number;
    elementScroll: Element | null;
    page: number;
    horizontal: boolean;
    loadMore: () => void;
}

export const scroll: Writable<InfiniteScroll> = writable({
    hasMore: true,
    threshold: 100,
    elementScroll: null,
    page: 0,
    horizontal: false,
    loadMore: () => { }
})
