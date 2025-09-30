import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/VerifyToken'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class VerifyTokenStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "VerifyTokenStore",
			variables: true,
		})
	}
}

export async function load_VerifyToken(params) {
  await initClient()

	const store = new VerifyTokenStore()

	await store.fetch(params)

	return {
		VerifyToken: store,
	}
}
