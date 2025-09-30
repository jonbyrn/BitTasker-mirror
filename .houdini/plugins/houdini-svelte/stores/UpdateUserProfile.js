import artifact from '$houdini/artifacts/UpdateUserProfile'
import { MutationStore } from '../runtime/stores/mutation'

export class UpdateUserProfileStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
