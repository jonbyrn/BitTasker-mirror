import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/SearchTasks'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class SearchTasksStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "SearchTasksStore",
			variables: true,
		})
	}
}

export async function load_SearchTasks(params) {
  await initClient()

	const store = new SearchTasksStore()

	await store.fetch(params)

	return {
		SearchTasks: store,
	}
}
