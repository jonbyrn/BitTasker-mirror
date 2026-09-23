import { BaseApiService } from '../../apiService';
import { ENDPOINTS } from '../../endpoints';

interface Nip05Response {
	data: {
		pubkey: string;
		name: string;
		relays: string[];
	};
}

class NostrNip05Service extends BaseApiService {
	constructor() {
		super(import.meta.env.VITE_NOSTR_RELAY_NESTJS);
	}

	// GET /nip-05?name=xxx
	async queryNip05(name: string): Promise<Nip05Response> {
		const response = await this.get<Nip05Response>(ENDPOINTS.NOSTR.NIP05, { params: { name } });
		return response.data;
	}

	// GET /nip-05/{name}
	async getNip05ByName(name: string): Promise<Nip05Response> {
		const response = await this.get<Nip05Response>(ENDPOINTS.NOSTR.NIP05_BY_NAME(name));
		return response.data;
	}
}

export default new NostrNip05Service();
