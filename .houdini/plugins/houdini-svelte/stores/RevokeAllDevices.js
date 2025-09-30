import artifact from '$houdini/artifacts/RevokeAllDevices'
import { MutationStore } from '../runtime/stores/mutation'

export class RevokeAllDevicesStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
