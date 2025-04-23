import { StorageKeys } from '$lib/utils/constants/storage';
import type { ClientPlugin } from '$houdini';

const authErrorHandler: ClientPlugin = () => {
	return {
		end: async (ctx, { value, resolve }) => {
			if (value.errors && value.errors.length > 0) {
				console.warn('encountered errors:', value.errors);

				const authError = value.errors.find(
					(err) =>
						err.message.includes('Unauthorized') || err.message.includes('Authentication failed')
				);

				if (authError) {
					console.warn('Detected auth error. Logging out...');

					localStorage.removeItem(StorageKeys.ACCESS_TOKEN);

					const { authState } = await import('$lib/stores/auth.store');
					authState.logout();

					if (typeof window !== 'undefined') {
						window.location.href = '/auth';
					}
				}
			}

			resolve(ctx);
		}
	};
};

export default authErrorHandler;
