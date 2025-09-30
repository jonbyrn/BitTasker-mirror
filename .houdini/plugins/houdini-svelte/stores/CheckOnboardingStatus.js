import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/CheckOnboardingStatus'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class CheckOnboardingStatusStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "CheckOnboardingStatusStore",
			variables: false,
		})
	}
}

export async function load_CheckOnboardingStatus(params) {
  await initClient()

	const store = new CheckOnboardingStatusStore()

	await store.fetch(params)

	return {
		CheckOnboardingStatus: store,
	}
}
