import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/MyTaskTemplates'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class MyTaskTemplatesStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "MyTaskTemplatesStore",
			variables: false,
		})
	}
}

export async function load_MyTaskTemplates(params) {
  await initClient()

	const store = new MyTaskTemplatesStore()

	await store.fetch(params)

	return {
		MyTaskTemplates: store,
	}
}
