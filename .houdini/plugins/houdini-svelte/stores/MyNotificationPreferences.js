import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/MyNotificationPreferences'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class MyNotificationPreferencesStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "MyNotificationPreferencesStore",
			variables: false,
		})
	}
}

export async function load_MyNotificationPreferences(params) {
  await initClient()

	const store = new MyNotificationPreferencesStore()

	await store.fetch(params)

	return {
		MyNotificationPreferences: store,
	}
}
