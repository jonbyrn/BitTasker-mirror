import * as bip39 from 'bip39';
import { fetchFiatRates, getTransactions, getWalletInfo } from './breez/walletService';
import type { Rate, Payment } from '@breeztech/breez-sdk-liquid';
import { Buffer } from 'buffer';

// Cache for balance and fiat rates to reduce API calls
interface BalanceCache {
	balance: { btc: number | undefined; sats: number; usdValue: number };
	timestamp: number;
}

interface FiatRatesCache {
	rates: Rate[];
	timestamp: number;
}

let balanceCache: BalanceCache | null = null;
let fiatRatesCache: FiatRatesCache | null = null;
const CACHE_DURATION_MS = 30000; // 30 seconds cache

/**
 * Clears the mnemonic from secure storage
 * @returns A promise that resolves when the mnemonic is cleared
 */
export async function clearMnemonic(): Promise<void> {
	// For passkey-only storage, clearing is handled by the platform
	// Users can remove passkeys through their device settings
	console.log('Mnemonic clearing handled by platform passkey management');
}

/**
 * Generates a new mnemonic phrase
 * @returns A promise that resolves with the new mnemonic phrase
 */
export function generateMnemonic(): string {
	return bip39.generateMnemonic();
}

/**
 * Get cached fiat rates or fetch new ones
 */
async function getCachedFiatRates(): Promise<Rate[]> {
	const now = Date.now();

	// Return cached rates if they're still fresh
	if (fiatRatesCache && now - fiatRatesCache.timestamp < CACHE_DURATION_MS) {
		console.log('[Helper] Using cached fiat rates');
		return fiatRatesCache.rates;
	}

	try {
		console.log('[Helper] Fetching fresh fiat rates');
		const rates = await fetchFiatRates();
		fiatRatesCache = { rates, timestamp: now };
		return rates;
	} catch (error) {
		console.error('[Helper] Error fetching fiat rates:', error);
		// Return cached rates even if expired, or empty array as fallback
		return fiatRatesCache?.rates || [];
	}
}

/**
 * Get the balance of the wallet
 * @returns A promise that resolves with the balance of the wallet
 */
export async function getBalance(): Promise<{
	btc: number | undefined;
	sats: number;
	usdValue: number;
}> {
	const now = Date.now();

	// Return cached balance if it's still fresh
	if (balanceCache && now - balanceCache.timestamp < CACHE_DURATION_MS) {
		console.log('[Helper] Using cached balance');
		return balanceCache.balance;
	}

	try {
		console.log('[Helper] Fetching fresh balance');
		const info = await getWalletInfo();
		const btcBalance = info?.walletInfo.assetBalances.find(
			(asset) => asset.assetId === 'BTC'
		)?.balance;

		if (!btcBalance) {
			const fallbackBalance = { btc: undefined, sats: 0, usdValue: 0 };
			balanceCache = { balance: fallbackBalance, timestamp: now };
			return fallbackBalance;
		}

		const satsBalance = btcBalance ? btcBalance * 100000000 : 0;

		// Get fiat rates with caching
		const fiatRates = await getCachedFiatRates();
		const usdValue = fiatRates.length > 0 ? satsBalance * fiatRates[0].value : 0;

		const balance = { btc: btcBalance, sats: satsBalance, usdValue: usdValue };
		balanceCache = { balance, timestamp: now };

		return balance;
	} catch (error) {
		console.error('[Helper] Error fetching balance:', error);
		// Return cached balance even if expired, or fallback values
		return balanceCache?.balance || { btc: undefined, sats: 0, usdValue: 0 };
	}
}

/**
 * Get recent transactions
 * @returns A promise that resolves with the recent transactions
 */
export async function getRecentTransactions(): Promise<Payment[]> {
	try {
		const transactions = await getTransactions();
		return transactions.slice(0, 10);
	} catch (error) {
		console.error('[Helper] Error fetching transactions:', error);
		return [];
	}
}

/**
 * Clear all cached data
 */
export function clearCache(): void {
	balanceCache = null;
	fiatRatesCache = null;
	console.log('[Helper] All caches cleared');
}

// =========================
// Multisig/Vault helpers
// =========================

import { getMnemonicPasskey } from '$lib/wallet/mnemonicBiometrics';
import type { BIP32Interface, TinySecp256k1Interface } from 'bip32';

export type NetworkType = 'liquid';

export interface MultisigSetupRecord {
	id: string;
	derivationPath: string;
	clientPubkey: string; // hex compressed
	freelancerPubkey: string; // hex compressed
	createdAt: number;
}

export interface VaultRecord {
	id: string;
	setupId: string; // link to MultisigSetupRecord.id
	network: NetworkType;
	csvBlocks: number;
	miniscriptPolicy: string; // policy form e.g. and(pk(A),or(pk(B),older(N)))
	miniscriptResolved: string; // keys substituted
	descriptor: string; // e.g. wsh(<miniscript>)
	address?: string | null;
	scriptPubKey?: string | null; // hex
	witnessScript?: string | null; // hex
	createdAt: number;
}

function generateId(prefix: string): string {
	const rand = Math.random().toString(36).slice(2, 10);
	return `${prefix}_${Date.now()}_${rand}`;
}

function delay(ms = 200): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Derivation / keys ---

/**
 * Generates a derivation path for a fresh child key.
 * Default uses BIP86 account space. You can store the index server-side if needed.
 */
export function generateDerivationPath(options?: {
	accountIndex?: number; // hardened account index
	addressIndex?: number; // non-hardened index
	change?: 0 | 1;
}): string {
	const accountIndex = options?.accountIndex ?? Math.floor(Math.random() * 2 ** 15);
	const addressIndex = options?.addressIndex ?? 0;
	const change = options?.change ?? 0;
	// Liquid-only vault derivation (BIP86 style). Coin type kept as testnet-friendly for development.
	const coinType = 1; // Testnet-style by default; both sides must use the same path
	return `m/86'/${coinType}'/${accountIndex}'/${change}/${addressIndex}`;
}

/**
 * Derive a compressed secp256k1 public key (hex) from mnemonic at a given path.
 */
export async function derivePubkeyAtPath(params: {
	mnemonic: string;
	derivationPath: string;
}): Promise<string> {
	const { mnemonic, derivationPath } = params;
	const seed = await bip39.mnemonicToSeed(mnemonic);
	// Lazily import bip32 factory and tiny-secp256k1 to avoid SSR/top-level side effects
	const [{ default: BIP32Factory }, ecc] = await Promise.all([
		import('bip32'),
		import('tiny-secp256k1')
	]);
	const eccImpl: TinySecp256k1Interface =
		(ecc as unknown as { default?: TinySecp256k1Interface }).default ??
		(ecc as unknown as TinySecp256k1Interface);
	const bip32 = BIP32Factory(eccImpl);
	const node: BIP32Interface = bip32.fromSeed(seed);
	const child = node.derivePath(derivationPath);
	if (!child.publicKey) {
		throw new Error('Failed to derive public key');
	}
	return Buffer.from(child.publicKey).toString('hex');
}

/**
 * Build the payload a client shares over Nostr to initiate multisig.
 */
export async function buildClientSharePayload(params?: {
	derivationPath?: string; // optional; will be generated if not provided
}): Promise<{ derivationPath: string; clientPubkey: string }> {
	const mnemonic = await getMnemonicPasskey();
	const derivationPath = params?.derivationPath ?? generateDerivationPath();
	const clientPubkey = await derivePubkeyAtPath({ mnemonic, derivationPath });
	return { derivationPath, clientPubkey };
}

/**
 * Build the payload a freelancer replies with using the given derivation path.
 */
export async function buildFreelancerSharePayload(params: {
	derivationPath: string;
}): Promise<{ freelancerPubkey: string }> {
	const mnemonic = await getMnemonicPasskey();
	const freelancerPubkey = await derivePubkeyAtPath({
		mnemonic,
		derivationPath: params.derivationPath
	});
	return { freelancerPubkey };
}

// --- Mock server API ---

export async function saveMultisigSetup(params: {
	derivationPath: string;
	clientPubkey: string;
	freelancerPubkey: string;
}): Promise<MultisigSetupRecord> {
	await delay();
	const id = generateId('setup');
	const record: MultisigSetupRecord = {
		id,
		derivationPath: params.derivationPath,
		clientPubkey: params.clientPubkey,
		freelancerPubkey: params.freelancerPubkey,
		createdAt: Date.now()
	};
	return record;
}

export async function saveVaultDetails(record: VaultRecord): Promise<VaultRecord> {
	await delay();
	return record;
}

export async function submitVaultToServer(): Promise<void> {
	// TODO: Replace with real API call
	await delay(300);
}

// --- Miniscript & vault creation (stubbed; address/script optional) ---

/**
 * Create the miniscript policy string with symbolic keys A (client) and B (freelancer).
 * Policy: and(pk(A), or(pk(B), older(CSV)))
 */
export function buildPolicyExpression(csvBlocks: number): string {
	if (!Number.isInteger(csvBlocks) || csvBlocks < 1) {
		throw new Error('csvBlocks must be a positive integer');
	}
	return `and(pk(A),or(pk(B),older(${csvBlocks})))`;
}

/**
 * Resolve the policy by substituting actual hex pubkeys for A and B.
 */
export function resolvePolicyToMiniscript(params: {
	policyExpression: string;
	clientPubkey: string; // A
	freelancerPubkey: string; // B
}): string {
	let miniscript = params.policyExpression;
	miniscript = miniscript.replace(/\bA\b/g, params.clientPubkey);
	miniscript = miniscript.replace(/\bB\b/g, params.freelancerPubkey);
	return miniscript;
}

/**
 * Creates a vault data structure. Address/script creation is deferred until we wire
 * in a miniscript+descriptor engine. For now we return descriptor and placeholders.
 *
 * NOTE: When we add @bitcoinerlab/miniscript & @bitcoinerlab/descriptors, we can
 * compute address, witnessScript and scriptPubKey from the descriptor on Liquid/Bitcoin.
 */
export async function createMultisigVault(params: {
	setupId: string;
	clientPubkey: string; // privileged key (A)
	freelancerPubkey: string; // other key (B)
	csvBlocks: number; // ask user in UI
	network: NetworkType; // 'liquid' only
}): Promise<VaultRecord> {
	const policy = buildPolicyExpression(params.csvBlocks);
	// Try to compute descriptor/address; if modules are unavailable, fall back to a minimal record
	try {
		const [miniscriptMod, descriptorsMod, secpMod, liquidjs] = await Promise.all([
			import('@bitcoinerlab/miniscript'),
			import('@bitcoinerlab/descriptors'),
			import('@bitcoinerlab/secp256k1'),
			import('liquidjs-lib')
		]);
		const { compilePolicy } = miniscriptMod as {
			compilePolicy: (p: string) => { miniscript: string };
		};
		const compiled = compilePolicy(policy);
		const miniscriptResolved = compiled.miniscript
			.replace(/\bA\b/g, params.clientPubkey)
			.replace(/\bB\b/g, params.freelancerPubkey);

		const descriptor = `wsh(${miniscriptResolved})`;
		const { Output } = (
			descriptorsMod as unknown as {
				DescriptorsFactory: (secp: unknown) => {
					Output: new (args: { descriptor: string; network: unknown }) => {
						getAddress(): string;
						getScriptPubKey(): Buffer | undefined;
						getRedeemScript(): Buffer | undefined;
					};
				};
			}
		).DescriptorsFactory(secpMod as unknown);
		const network = (liquidjs as unknown as { networks: { liquid: unknown } }).networks.liquid;
		const output = new Output({ descriptor, network });
		const address = output.getAddress();
		const scriptPubKeyBuf = output.getScriptPubKey();
		const scriptPubKey = scriptPubKeyBuf?.toString('hex') ?? null;
		const witnessScript = output.getRedeemScript()?.toString('hex') ?? null;

		const record: VaultRecord = {
			id: generateId('vault'),
			setupId: params.setupId,
			network: params.network,
			csvBlocks: params.csvBlocks,
			miniscriptPolicy: policy,
			miniscriptResolved,
			descriptor,
			address,
			scriptPubKey,
			witnessScript,
			createdAt: Date.now()
		};
		await saveVaultDetails(record);
		return record;
	} catch {
		const minimal: VaultRecord = {
			id: generateId('vault'),
			setupId: params.setupId,
			network: params.network,
			csvBlocks: params.csvBlocks,
			miniscriptPolicy: policy,
			miniscriptResolved: `and(pk(${params.clientPubkey}),or(pk(${params.freelancerPubkey}),older(${params.csvBlocks})))`,
			descriptor: `wsh(and(pk(${params.clientPubkey}),or(pk(${params.freelancerPubkey}),older(${params.csvBlocks}))))`,
			address: null,
			scriptPubKey: null,
			witnessScript: null,
			createdAt: Date.now()
		};
		await saveVaultDetails(minimal);
		return minimal;
	}
}

// Optional helper to compute a P2WSH scriptPubKey if you already have a witness script (hex)
export async function computeP2wshScriptPubKeyFromWitnessScriptHex(
	witnessScriptHex: string
): Promise<string> {
	const witness = Buffer.from(witnessScriptHex, 'hex');
	const bitcoin = await import('bitcoinjs-lib');
	const p2wsh = bitcoin.payments.p2wsh({ redeem: { output: witness } });
	if (!p2wsh.output) throw new Error('Failed to compute scriptPubKey');
	return p2wsh.output.toString('hex');
}
