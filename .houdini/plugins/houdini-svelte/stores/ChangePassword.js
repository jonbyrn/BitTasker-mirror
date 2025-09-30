import artifact from '$houdini/artifacts/ChangePassword'
import { MutationStore } from '../runtime/stores/mutation'

export class ChangePasswordStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
