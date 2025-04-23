import { HoudiniClient } from '$houdini';
import customAuthPlugin from '$lib/utils/houdini/plugins/customAuthPlugin';
const token = localStorage.getItem('CapacitorStorage.access_token');

export default new HoudiniClient({
	url: 'http://127.0.0.1:3000/graph',
	plugins: [customAuthPlugin],
	fetchParams() {
		return {
			headers: {
				Authorization: `Bearer ${token}`
			}
		};
	}
});
