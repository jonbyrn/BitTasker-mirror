import type { EncryptedData } from '$lib/types/auth';
import { bytesToBase64, base64ToBytes } from './encoding';

export async function generateRandomKey(): Promise<CryptoKey> {
	return await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
		'encrypt',
		'decrypt'
	]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
	const exported = await crypto.subtle.exportKey('raw', key);
	return bytesToBase64(new Uint8Array(exported));
}

export async function importKey(keyData: string): Promise<CryptoKey> {
	const keyBytes = base64ToBytes(keyData);
	const buffer = new Uint8Array(keyBytes).buffer;
	return await crypto.subtle.importKey('raw', buffer, { name: 'AES-GCM', length: 256 }, true, [
		'encrypt',
		'decrypt'
	]);
}

export async function encrypt(data: string, key: CryptoKey): Promise<EncryptedData> {
	const encoder = new TextEncoder();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const dataBytes = encoder.encode(data);

	const encryptedData = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv: iv,
			tagLength: 128
		},
		key,
		dataBytes
	);

	// Split the encrypted data into ciphertext and auth tag
	const dataBytes2 = new Uint8Array(encryptedData.slice(0, -16));
	const authTagBytes = new Uint8Array(encryptedData.slice(-16));

	return {
		data: bytesToBase64(dataBytes2),
		iv: bytesToBase64(iv),
		authTag: bytesToBase64(authTagBytes)
	};
}

export async function decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
	const decoder = new TextDecoder();
	const dataBytes = base64ToBytes(encryptedData.data);
	const ivBytes = base64ToBytes(encryptedData.iv);
	const authTagBytes = base64ToBytes(encryptedData.authTag);

	// Combine ciphertext and auth tag
	const combinedBytes = new Uint8Array(dataBytes.length + authTagBytes.length);
	combinedBytes.set(dataBytes);
	combinedBytes.set(authTagBytes, dataBytes.length);

	// Create a proper ArrayBuffer for the iv
	const ivBuffer = new Uint8Array(ivBytes).buffer;

	const decryptedData = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: ivBuffer,
			tagLength: 128
		},
		key,
		combinedBytes
	);

	return decoder.decode(decryptedData);
}

export async function deriveKeyFromPassword(
	password: string,
	salt: Uint8Array,
	iterations: number = 100000
): Promise<CryptoKey> {
	try {
		const encoder = new TextEncoder();
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			'PBKDF2',
			false,
			['deriveKey']
		);

		// Create a proper ArrayBuffer for the salt
		const saltBuffer = new Uint8Array(salt).buffer;

		return await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: saltBuffer,
				iterations,
				hash: 'SHA-256'
			},
			keyMaterial,
			{ name: 'AES-GCM', length: 256 },
			true,
			['encrypt', 'decrypt']
		);
	} catch (err) {
		console.error('Failed to derive key from password:', err);
		throw new Error('Failed to derive key from password');
	}
}

/**
 * Format sats amount for display (no conversion needed)
 */
export function formatSatsAmount(sats: number): string {
	const formatted = new Intl.NumberFormat('en-US').format(sats);
	return `${formatted} sats`;
}

/**
 * Calculate estimated USDT value based on BTC amount
 */
export function calculateUsdtEstimate(budget: number, btcPrice: number): string {
	// budget is in sats, so we need to convert to BTC first
	const btcAmount = budget / 100_000_000;
	const estimatedValue = btcAmount * btcPrice;
	return estimatedValue.toLocaleString('en-US', {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2
	});
}

export function formatBtcToSats(amountBtc: number | string): string {
	let str = amountBtc.toString();

	if (/[eE]/.test(str)) {
		str = Number(str).toFixed(8);
	}

	const [whole = '0', decimals = ''] = str.split('.');
	const padded = (decimals + '0'.repeat(8)).slice(0, 8);

	const satsBig = BigInt(whole) * 100_000_000n + BigInt(padded);
	const formatted = Intl.NumberFormat('en-US').format(Number(satsBig));

	return `${formatted} Sats`;
}

export const SATS_PER_BTC = 100_000_000;

export function satsFromUsd(usd: number, price: number) {
	return Math.round((usd / price) * SATS_PER_BTC);
}

export function usdFromSats(sats: number, price: number) {
	const value = (sats / SATS_PER_BTC) * price;
	return parseFloat(value.toFixed(3));
}

export function formatNumberForInput(value: number | undefined): string {
	if (value == null || isNaN(value)) return '';
	return Math.floor(value).toLocaleString('en-US');
}
