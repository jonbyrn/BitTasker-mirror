import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = async ({ error, event, status, message }) => {
    console.log('error', error);
	const errorId = crypto.randomUUID();

	return {
		message: 'Whoops!',
		errorId
	};
};