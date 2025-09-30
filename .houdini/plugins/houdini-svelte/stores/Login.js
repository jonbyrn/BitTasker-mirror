import artifact from '$houdini/artifacts/Login'
import { MutationStore } from '../runtime/stores/mutation'

export class LoginStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
