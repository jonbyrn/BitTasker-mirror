import artifact from '$houdini/artifacts/UpdateTaskTemplate'
import { MutationStore } from '../runtime/stores/mutation'

export class UpdateTaskTemplateStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
