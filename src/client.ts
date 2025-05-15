import { HoudiniClient } from '$houdini';
import customAuthPlugin from '$lib/utils/houdini/plugins/customAuthPlugin';

export default new HoudiniClient({
	url: `${import.meta.env.VITE_API_URL}/graph`,
	plugins: [customAuthPlugin]
});
