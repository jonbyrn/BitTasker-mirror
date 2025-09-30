import artifact from '$houdini/artifacts/RegisterDevice'
import { MutationStore } from '../runtime/stores/mutation'

export class RegisterDeviceStore extends MutationStore {
	constructor() {
		super({
			artifact,
		})
	}
}
