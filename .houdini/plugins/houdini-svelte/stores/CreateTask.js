import artifact from '$houdini/artifacts/CreateTask'
import { MutationStore } from '../runtime/stores/mutation'

export class CreateTaskStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
