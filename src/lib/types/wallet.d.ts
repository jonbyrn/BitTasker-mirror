import type { NetworkTypeEnum } from "$lib/utils/enums/wallet.enum";
import type { GetInfoResponse, GetBalanceResponse, GetIsEnabledResponse, GetIsSupportedResponse } from '@webbtc/webln-types';

export type NetworkFeeType = 'low' | 'medium' | 'high';
export type StoragePreference = 'service' | 'self';

export interface Wallet {
    id: number;
    network: string;
    addresses: [
        {
            address: string;
            balance: number;
            unconfirmedBalance: number;
            totalReceived: number;
            totalSent: number;
            txCount: number;
        }
    ],
    totalWalletBalance?: string;
    createdAt?: string;
}

export interface ConnectedWallet {
    info: GetInfoResponse;
    balance?: number;
    currency?: string;
    isEnabled: GetIsEnabledResponse;
    // isSupported?: GetIsSupportedResponse;
    connected: boolean;
}

export interface TransactionType {
    txid: string;
    blockHeight: number;
    confirmed: boolean;
    confirmationTime: string;
    fees: number;
    amount: number;
    type: "received" | "sent" | "internal";
    address: string;
    walletId: number;
}

export interface Address {
    address: string;
    publicKey: string;
    label: string;
    path: string;
    type: string;
    isChange: boolean;
}

/* export interface Transaction {
    txid: string;
    type: NetworkTypeEnum;
    amount: number;
    fee?: number;
    confirmations: number;
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
    from: string;
    to: string;
    memo?: string;
    escrow?: EscrowDetails;
} */

export interface WalletBalance {
    btc: number;
    sats: number;
    usd: number;
    liquid?: {
        [assetId: string]: number;
    };
}

export interface WalletAddress {
    type: NetworkTypeEnum;
    address: string;
    label?: string;
    balance?: number;
    path?: string; // BIP32 derivation path
}

export interface EscrowDetails {
    contractId: string;
    milestones: Milestone[];
    status: 'pending' | 'active' | 'completed' | 'disputed';
    releaseConditions: ReleaseCondition[];
}

export interface Milestone {
    id: string;
    amount: number;
    description: string;
    status: 'pending' | 'released' | 'disputed';
    dueDate?: number;
}

export interface ReleaseCondition {
    type: 'time' | 'multisig' | 'oracle';
    data: any;
}

export interface NetworkFee {
    type: NetworkFeeType;
    satPerVbyte: number;
    estimatedConfirmation: number;
}

export interface WalletState {
    balance: WalletBalance;
    addresses: WalletAddress[];
    transactions: Transaction[];
    isInitialized: boolean;
    isLocked: boolean;
    networkType: NetworkTypeEnum;
    hardwareWalletConnected?: boolean;
    hardwareWalletType?: 'ledger' | 'trezor';
    isEncrypted: boolean;
    encryptionStatus: 'unencrypted' | 'locked' | 'unlocked';
}

export interface WalletKey {
    mnemonic: string; // BIP39 mnemonic (encrypted)
    keyPairs: {
        [path: string]: {
            publicKey: string;
            privateKey: string; // Encrypted
        };
    };
}

export interface LightningInvoice {
    paymentHash: string;
    paymentRequest: string;
    amount: number;
    description?: string;
    expiresAt: number;
}

export interface LiquidAsset {
    assetId: string;
    name: string;
    ticker: string;
    precision: number;
    balance: number;
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




export interface PaymentResult {
    success: boolean;
    txId: string;
    amount: number;
    timestamp: number;
}

export interface EscrowTransaction {
    id: string;
    amount: number;
    timestamp: number;
}

export interface AssetDetails {
    name: string;
    ticker: string;
    precision: number;
    domain: string;
}

export interface BitcoinPaymentEvents {
    amount: number;
    description: string;
    recipient: string;
    onPaymentComplete: (tx: PaymentResult) => void;
}

export interface LiquidAssetManagerEvents {
    liquidEscrowCreated: {
        txId: string;
        assetId: string;
        amount: number;
    };
}

export interface EscrowContractEvents {
    escrowCreated: {
        txId: string;
        amount: number;
        timeLockDuration: number;
        requiredSignatures: number;
    };
    escrowReleased: {
        txId: string;
        amount: number;
    };
    escrowDisputed: {
        txId: string;
        amount: number;
    };
}

