import type { LightningInvoice, Transaction } from '$lib/types/wallet';
import { webln, LN, USD } from '@getalby/sdk';
import { NetworkTypeEnum } from '$lib/utils/enums/wallet.enum';

// State variables
let isConnected = false;
let currentProvider: string | null = null;
let nwcProvider: webln.NostrWebLNProvider | null = null;

// Parse NWC URL to extract connection parameters
function parseNwcUrl(nwcUrl: string): { pubkey: string; relay: string; secret: string } {
  try {
    // NWC URL format: nostr+walletconnect://<pubkey>?relay=<relay>&secret=<secret>
    const url = new URL(nwcUrl);
    const pubkey = url.hostname;
    const relay = url.searchParams.get('relay') || '';
    const secret = url.searchParams.get('secret') || '';

    if (!pubkey || !relay || !secret) {
      throw new Error('Invalid NWC URL format');
    }

    return { pubkey, relay, secret };
  } catch (error) {
    console.error('Failed to parse NWC URL:', error);
    throw new Error('Invalid NWC URL');
  }
}

// Connect to a Lightning wallet
export async function connectNostrWalletConnect(nwcUrl: string): Promise<boolean> {
  try {
    // Parse the NWC URL
    const { pubkey, relay, secret } = parseNwcUrl(nwcUrl);

    // Create a new NWC provider
    nwcProvider = new webln.NostrWebLNProvider({
      walletPubkey: pubkey,
      relayUrl: relay,
      secret
    });

    // Connect to the wallet
    await nwcProvider.enable();

    isConnected = true;
    currentProvider = 'NWC';
    return true;
  } catch (error) {
    console.error('Failed to connect via NWC:', error);
    isConnected = false;
    currentProvider = null;
    nwcProvider = null;
    return false;
  }
}

// Generate a Lightning invoice
export async function generateInvoice(
  amountSats: number,
  description: string,
  expirySeconds: number = 3600
): Promise<LightningInvoice> {
  if (!isConnected || !nwcProvider) {
    throw new Error('No Lightning wallet connected');
  }

  try {
    // Use NWC to generate an invoice
    const invoice = await nwcProvider.makeInvoice({
      amount: amountSats,
      description,
      expiry: expirySeconds
    });

    return {
      paymentHash: invoice.paymentHash || '',
      paymentRequest: invoice.bolt11,
      amount: amountSats / 100000000, // Convert to BTC
      description,
      expiresAt: Date.now() + (expirySeconds * 1000),
      expiryTime: Date.now() + (expirySeconds * 1000)
    };
  } catch (error) {
    console.error('Failed to generate invoice:', error);
    throw error;
  }
}

// Pay a Lightning invoice
export async function payInvoice(
  paymentRequest: string,
  maxFeePercent: number = 1
): Promise<Transaction> {
  if (!isConnected || !nwcProvider) {
    throw new Error('No Lightning wallet connected');
  }

  try {
    // Use NWC to pay the invoice
    const result = await nwcProvider.sendPayment(paymentRequest);

    // Create a transaction object
    const transaction: Transaction = {
      id: result.paymentHash,
      type: NetworkTypeEnum.LIGHTNING,
      amount: result.amount / 100000000, // Convert to BTC
      timestamp: Date.now(),
      from: '', // This would be the connected wallet's address
      to: paymentRequest,
      confirmations: 1, // Lightning transactions are instant
      status: 'confirmed'
    };

    return transaction;
  } catch (error) {
    console.error('Failed to pay invoice:', error);
    throw error;
  }
}
