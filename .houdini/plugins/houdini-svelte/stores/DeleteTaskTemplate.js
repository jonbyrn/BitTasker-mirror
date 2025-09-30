import artifact from '$houdini/artifacts/DeleteTaskTemplate'
import { MutationStore } from '../runtime/stores/mutation'

export class DeleteTaskTemplateStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
