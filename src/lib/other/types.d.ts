export interface UTXO {
    txid: string;
    vout: number;
    value: number;
    asset: string;
    status: {
      confirmed: boolean;
      block_height?: number;
      block_hash?: string;
      block_time?: number;
    };
  }