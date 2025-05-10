import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

export const errorHandler: HandleServerError = ({ error }) => {
    console.log('error', error);
    return {
        message: 'An error occurred on the server side ' + JSON.stringify(error, null, 2)
    };
};

export const handle = sequence((async ({ event, resolve }) => {
    return await resolve(event);
}) satisfies Handle);
