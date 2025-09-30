import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/MyDevices'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class MyDevicesStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "MyDevicesStore",
			variables: false,
		})
	}
}

export async function load_MyDevices(params) {
  await initClient()

	const store = new MyDevicesStore()

	await store.fetch(params)

	return {
		MyDevices: store,
	}
}
