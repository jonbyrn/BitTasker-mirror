import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import { secp256k1 } from '@noble/curves/secp256k1';
import { chacha20poly1305 } from '@noble/ciphers/chacha';

/**
 * Calculate padded length for a message
 */
function calcPaddedLen(unpadded_len: number): number {
    const nextPower = 1 << (Math.floor(Math.log2(unpadded_len - 1)) + 1);
    const chunk = nextPower <= 256 ? 32 : nextPower / 8;
    return unpadded_len <= 32 ? 32 : chunk * (Math.floor((unpadded_len - 1) / chunk) + 1);
}

/**
 * Pad a message according to NIP-44 spec
 */
function pad(plaintext: string): Uint8Array {
    const unpadded = new TextEncoder().encode(plaintext);
    const unpadded_len = unpadded.length;

    if (unpadded_len < 1 || unpadded_len > 65535) {
        throw new Error('Invalid plaintext length');
    }

    // Write length as BE uint16
    const prefix = new Uint8Array(2);
    prefix[0] = (unpadded_len >> 8) & 0xff;
    prefix[1] = unpadded_len & 0xff;

    // Create padding
    const padded_len = calcPaddedLen(unpadded_len);
    const suffix = new Uint8Array(padded_len - unpadded_len).fill(0);

    // Concatenate all parts
    const result = new Uint8Array(2 + unpadded_len + suffix.length);
    result.set(prefix);
    result.set(unpadded, 2);
    result.set(suffix, 2 + unpadded_len);

    return result;
}

/**
 * Unpad a message according to NIP-44 spec
 */
function unpad(padded: Uint8Array): string {
    // Read length as BE uint16
    const unpadded_len = (padded[0] << 8) | padded[1];
    const unpadded = padded.slice(2, 2 + unpadded_len);

    if (unpadded_len === 0 ||
        unpadded.length !== unpadded_len ||
        padded.length !== 2 + calcPaddedLen(unpadded_len)) {
        throw new Error('Invalid padding');
    }

    return new TextDecoder().decode(unpadded);
}

/**
 * Calculate conversation key between two users
 * @param privateKey - The sender's private key in hex format
 * @param publicKey - The recipient's public key in hex format
 */
async function getConversationKey(nsec: string, npub: string): Promise<Uint8Array> {
    // Generate shared secret using sender's private key and recipient's public key
    const sharedPoint = secp256k1.getSharedSecret(nsec, '02' + npub);
    const sharedX = sharedPoint.slice(1, 33); // Take x coordinate only

    // Use HKDF with NIP-44 v2 salt
    return hkdf(sha256, sharedX, new TextEncoder().encode('nip44-v2'), '', 32);
}

/**
 * Get message keys from conversation key and nonce
 */
function getMessageKeys(conversationKey: Uint8Array, nonce: Uint8Array): {
    chachaKey: Uint8Array;
    chachaNonce: Uint8Array;
    hmacKey: Uint8Array;
} {
    if (conversationKey.length !== 32) throw new Error('Invalid conversation key length');
    if (nonce.length !== 32) throw new Error('Invalid nonce length');

    // Expand key material
    const keys = hkdf(sha256, conversationKey, nonce, '', 76);

    return {
        chachaKey: keys.slice(0, 32),
        chachaNonce: keys.slice(32, 44),
        hmacKey: keys.slice(44, 76)
    };
}

/**
 * Calculate HMAC with additional authenticated data (AAD)
 */
function hmacAad(key: Uint8Array, message: Uint8Array, aad: Uint8Array): Uint8Array {
    if (aad.length !== 32) throw new Error('AAD must be 32 bytes');
    const combined = new Uint8Array(aad.length + message.length);
    combined.set(aad);
    combined.set(message, aad.length);
    return hmac(sha256, key, combined);
}

/**
 * Encrypt a message using NIP-44
 */
async function encrypt(
    plaintext: string,
    conversationKey: Uint8Array,
    nonce: Uint8Array
): Promise<string> {
    // Get message keys
    const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(conversationKey, nonce);

    // Pad plaintext
    const padded = pad(plaintext);

    // Encrypt with ChaCha20-Poly1305
    const cipher = chacha20poly1305(chachaKey, chachaNonce);
    const ciphertext = cipher.encrypt(padded);

    // Calculate MAC
    const mac = hmacAad(hmacKey, ciphertext, nonce);

    // Combine all parts: version (0x02) + nonce + ciphertext + mac
    const combined = new Uint8Array(1 + nonce.length + ciphertext.length + mac.length);
    combined[0] = 0x02; // Version 2
    combined.set(nonce, 1);
    combined.set(ciphertext, 1 + nonce.length);
    combined.set(mac, 1 + nonce.length + ciphertext.length);

    // Base64 encode
    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a message using NIP-44
 */
async function decrypt(payload: string, conversationKey: Uint8Array): Promise<string> {
    // Decode base64
    const decoded = new Uint8Array(atob(payload).split('').map(c => c.charCodeAt(0)));

    // Check version
    if (decoded[0] !== 0x02) throw new Error('Unsupported version');

    // Extract parts
    const nonce = decoded.slice(1, 33);
    const ciphertext = decoded.slice(33, decoded.length - 32);
    const mac = decoded.slice(decoded.length - 32);

    // Get message keys
    const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(conversationKey, nonce);

    // Verify MAC
    const calculatedMac = hmacAad(hmacKey, ciphertext, nonce);
    if (!calculatedMac.every((b, i) => b === mac[i])) {
        throw new Error('Invalid MAC');
    }

    // Decrypt
    const cipher = chacha20poly1305(chachaKey, chachaNonce);
    const padded = cipher.decrypt(ciphertext);

    // Unpad and return
    return unpad(padded);
}

const nip44 = {
    getConversationKey,
    encrypt,
    decrypt
}

export default nip44;
