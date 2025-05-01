import { StorageKeys } from '$lib/utils/constants/storage';
import type { ClientPlugin } from '$houdini';
import { Preferences } from '@capacitor/preferences';

interface GraphQLError {
	message: string;
	extensions?: {
		code: string;
		originalError?: {
			statusCode: number;
		};
	};
}

const authErrorHandler: ClientPlugin = () => {
	return {
		end: async (ctx, { value, resolve }) => {
			if (value.errors && value.errors.length > 0) {
				console.warn('encountered errors:', value.errors);

				const authError = value.errors.find(
					(err: GraphQLError) =>
						err.message === 'Authentication failed: Unauthorized' &&
						err.extensions?.code === 'UNAUTHENTICATED' &&
						err.extensions?.originalError?.statusCode === 401
				);

				if (authError) {
					console.warn('Detected auth error. Logging out...', authError);

					await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });

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
