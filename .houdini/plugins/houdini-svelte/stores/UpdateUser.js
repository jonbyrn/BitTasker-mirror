import artifact from '$houdini/artifacts/UpdateUser'
import { MutationStore } from '../runtime/stores/mutation'

export class UpdateUserStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
