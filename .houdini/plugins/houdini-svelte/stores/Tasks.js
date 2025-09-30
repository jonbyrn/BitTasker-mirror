import { QueryStore } from '../runtime/stores/query'
import artifact from '$houdini/artifacts/Tasks'
import { initClient } from '$houdini/plugins/houdini-svelte/runtime/client'

export class TasksStore extends QueryStore {
	constructor() {
		super({
			artifact,
			storeName: "TasksStore",
			variables: false,
		})
	}
}

export async function load_Tasks(params) {
  await initClient()

	const store = new TasksStore()

	await store.fetch(params)

	return {
		Tasks: store,
	}
}
