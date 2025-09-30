import artifact from '$houdini/artifacts/SubscribeToTopic'
import { MutationStore } from '../runtime/stores/mutation'

export class SubscribeToTopicStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
