import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/MyBids'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class MyBidsStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "MyBidsStore",
			variables: false,
		})
	}
}

export async function load_MyBids(params) {
  await initClient()

	const store = new MyBidsStore()

	await store.fetch(params)

	return {
		MyBids: store,
	}
}
