import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/GetUsernameHistory'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class GetUsernameHistoryStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "GetUsernameHistoryStore",
			variables: true,
		})
	}
}

export async function load_GetUsernameHistory(params) {
  await initClient()

	const store = new GetUsernameHistoryStore()

	await store.fetch(params)

	return {
		GetUsernameHistory: store,
	}
}
