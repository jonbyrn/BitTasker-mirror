import { HoudiniClient } from '$houdini';
import customAuthPlugin from '$lib/utils/houdini/plugins/customAuthPlugin';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

const token = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });

export default new HoudiniClient({
	url: import.meta.env.VITE_GRAPHQL_SERVER_ENTRYPOINT,
	plugins: [customAuthPlugin],
	fetchParams() {
		return {
			headers: {
				Authorization: `Bearer ${token.value}`
			}
		};
	}
});
