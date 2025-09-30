import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/Me'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class MeStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "MeStore",
			variables: false,
		})
	}
}

export async function load_Me(params) {
  await initClient()

	const store = new MeStore()

	await store.fetch(params)

	return {
		Me: store,
	}
}
