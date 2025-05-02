import { HoudiniClient } from '$houdini';
import customAuthPlugin from '$lib/utils/houdini/plugins/customAuthPlugin';
import { StorageKeys } from '$lib/utils/constants/storage';
import { browser } from '$app/environment';

export default new HoudiniClient({
	url: import.meta.env.VITE_GRAPHQL_SERVER_ENTRYPOINT,
	plugins: [customAuthPlugin],
	fetchParams() {
		let token = '';
		if (browser) {
			token = window.localStorage.getItem(`CapacitorStorage.${StorageKeys.ACCESS_TOKEN}`) || '';
		}
		return {
			headers: {
				Authorization: `Bearer ${token}`
			}
		};
	}
});
