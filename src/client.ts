import { HoudiniClient } from '$houdini';
import customAuthPlugin from '$lib/utils/houdini/plugins/customAuthPlugin';
const token = localStorage.getItem('CapacitorStorage.access_token');

export default new HoudiniClient({
	url: import.meta.env.VITE_GRAPHQL_SERVER_ENTRYPOINT,
	plugins: [customAuthPlugin],
	fetchParams() {
		return {
			headers: {
				Authorization: `Bearer ${token}`
			}
		};
	}
});
