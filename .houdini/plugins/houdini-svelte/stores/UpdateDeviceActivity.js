import artifact from '$houdini/artifacts/UpdateDeviceActivity'
import { MutationStore } from '../runtime/stores/mutation'

export class UpdateDeviceActivityStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
