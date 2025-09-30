import artifact from '$houdini/artifacts/UpdateDevice'
import { MutationStore } from '../runtime/stores/mutation'

export class UpdateDeviceStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
