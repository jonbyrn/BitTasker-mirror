import artifact from '$houdini/artifacts/RevokeDevice'
import { MutationStore } from '../runtime/stores/mutation'

export class RevokeDeviceStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
