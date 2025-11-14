import { redirect } from '@sveltejs/kit';

export const load = async () => {
    redirect(302, import.meta.env.VITE_CLIENT_URL);
};