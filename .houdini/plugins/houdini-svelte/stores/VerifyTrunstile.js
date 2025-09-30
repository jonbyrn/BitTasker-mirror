import artifact from '$houdini/artifacts/VerifyTrunstile'
import { MutationStore } from '../runtime/stores/mutation'

export class VerifyTrunstileStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
