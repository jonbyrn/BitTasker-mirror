export interface WalletBalance {
    btc: number;
    sats: number;
    usd: number;
}

export interface WalletAddress {
    type: 'Bitcoin' | 'Lightning' | 'Liquid';
    address: string;
    isDefault: boolean;
}

export interface Transaction {
    id: string;
    type: 'sent' | 'received';
    amount: number;
    timestamp: number;
    sender: string;
    recipient: string;
    confirmations: number | null;
    txid: string;
    network: 'Bitcoin' | 'Lightning' | 'Liquid';
    status?: 'pending' | 'confirmed' | 'failed';
    fee?: number;
}

export interface WalletState {
    balance: WalletBalance;
    addresses: WalletAddress[];
    transactions: Transaction[];
    isInitialized: boolean;
    isLocked: boolean;
    networkType: 'bitcoin' | 'lightning' | 'liquid';
    hardwareWalletConnected?: boolean;
    hardwareWalletType?: 'ledger' | 'trezor';
    isEncrypted: boolean;
    encryptionStatus: 'unencrypted' | 'locked' | 'unlocked';
}

export interface NetworkFee {
    type: 'low' | 'medium' | 'high';
    satPerVbyte: number;
    estimatedConfirmationTime: number; // in minutes
}

export interface SendTxParams {
    amount: number;
    recipientAddress: string;
    networkFee: NetworkFee['type'];
    description?: string;
}

export interface KeyPair {
    publicKey: string;
    privateKey: string; // This is stored encrypted
}

export interface WalletKey {
    mnemonic: string; // 12/24 words BIP39, stored encrypted
    keyPairs: KeyPair[];
}

export interface WalletConfig {
    network: 'mainnet' | 'testnet';
    defaultCurrency: 'BTC' | 'USD' | 'EUR';
}

export interface LightningInvoice {
    paymentRequest: string;
    amount: number;
    description: string;
    expiryTime: number;
}

export type StoragePreference = 'self' | 'service';