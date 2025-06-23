import { BaseApiService } from '../../apiService';
import { ENDPOINTS } from '../../endpoints';
import { PUBLIC_NOSTR_RELAY_NESTJS } from '$env/static/public';

interface WotTrustedVo {
  data: string[]; // List of trusted pubkeys
}

class NostrWotService extends BaseApiService {
  constructor() {
    super(PUBLIC_NOSTR_RELAY_NESTJS);
  }

  // GET /wot/trusted/{pubkey}
  async getTrusted(pubkey: string): Promise<WotTrustedVo> {
    const response = await this.get<WotTrustedVo>(ENDPOINTS.NOSTR.WOT_TRUSTED(pubkey));
    return response.data;
  }
}

export default new NostrWotService();
