import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/CheckUsernameAvailability'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class CheckUsernameAvailabilityStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "CheckUsernameAvailabilityStore",
			variables: true,
		})
	}
}

export async function load_CheckUsernameAvailability(params) {
  await initClient()

	const store = new CheckUsernameAvailabilityStore()

	await store.fetch(params)

	return {
		CheckUsernameAvailability: store,
	}
}
