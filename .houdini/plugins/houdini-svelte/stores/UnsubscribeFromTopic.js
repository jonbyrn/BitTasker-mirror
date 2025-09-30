import artifact from '$houdini/artifacts/UnsubscribeFromTopic'
import { MutationStore } from '../runtime/stores/mutation'

export class UnsubscribeFromTopicStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
