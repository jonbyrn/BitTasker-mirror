import artifact from '$houdini/artifacts/TriggerSavedSearchCheck'
import { MutationStore } from '../runtime/stores/mutation'

export class TriggerSavedSearchCheckStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
