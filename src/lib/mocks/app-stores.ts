// Mock for $app/stores in tests
import { readable } from 'svelte/store';

export const page = readable({
	url: new URL('http://localhost/'),
	params: {},
	data: {},
	form: undefined,
	state: {},
	formError: undefined
});

export const navigating = readable(null);
export const updated = readable(false);
