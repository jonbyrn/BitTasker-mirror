import artifact from '$houdini/artifacts/SendNotification'
import { MutationStore } from '../runtime/stores/mutation'

export class SendNotificationStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
