import artifact from '$houdini/artifacts/Register'
import { MutationStore } from '../runtime/stores/mutation'

export class RegisterStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
