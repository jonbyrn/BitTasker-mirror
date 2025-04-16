/**
 * Mobile Wallet Service
 * 
 * Handles mobile-specific functionality for the BitTasker wallet:
 * - Biometric authentication
 * - Secure native storage
 * - QR code scanning
 * - Push notifications for transactions
 * - Deep linking
 */

import type { EncryptionData } from '$lib/types/auth';
import type { WalletAddress } from '$lib/types/wallet';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { getDeviceIdentifier } from '../deviceIdentity';
import { Preferences } from '@capacitor/preferences';
import { checkBiometricAvailability, setBiometricKey, getBiometricData } from '$lib/utils/helpers/biometrics';

/**
 * Checks if the current device is a mobile device
 */
export function isMobileDevice(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Checks if biometric authentication is available on the device
 */
export async function isBiometricAvailable(): Promise<boolean> {
  return await checkBiometricAvailability();
}

/**
 * Checks if device has security enabled (PIN, pattern, etc)
 */
export async function hasDeviceSecurityEnabled(): Promise<boolean> {
  try {
    if (!isMobileDevice()) return false;

    // For Android, we can check if device is secured
    // For iOS, we assume it's secured if biometrics are available
    const info = await Device.getInfo();

    if (info.platform === 'android') {
      // This would require a native plugin to check
      // For now we'll return true as a placeholder
      return true;
    } else if (info.platform === 'ios') {
      // On iOS, biometrics generally means device security is enabled
      return await isBiometricAvailable();
    }

    return false;
  } catch (error) {
    console.error('Error checking device security:', error);
    return false;
  }
}

/**
 * Sets up biometric authentication for the wallet
 * @param password The wallet password to be stored securely with biometrics
 */
export async function setupBiometricAuth(password: string): Promise<boolean> {
  try {
    // Create a random salt for the biometric encryption
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

    // Store the encryption data
    const encryptionData: EncryptionData = {
      password,
      salt: saltHex,
      version: 1
    };

    // Generate a device-specific identifier to use as the "public key"
    const deviceId = await getDeviceIdentifier();

    // Store with biometrics
    return await setBiometricKey(deviceId, encryptionData);
  } catch (error) {
    console.error('Failed to setup biometric auth:', error);
    return false;
  }
}

/**
 * Gets the password stored with biometric authentication
 */
export async function getBiometricPassword(): Promise<string | null> {
  try {
    const deviceId = await getDeviceIdentifier();
    const credentials = await getBiometricData();

    if (!credentials || credentials.username !== deviceId) {
      return null;
    }

    // Parse the stored encryption data
    const encryptionData = JSON.parse(credentials.password) as EncryptionData;
    return encryptionData.password;
  } catch (error) {
    console.error('Failed to get biometric password:', error);
    return null;
  }
}

/**
 * Store encrypted mnemonic in secure device storage with biometric protection
 * @param encryptedData The encrypted mnemonic data
 * @returns Success status
 */
export async function storeMnemonicInSecureStorage(encryptedData: { ciphertext: string; iv: string; salt: string }): Promise<boolean> {
  try {
    if (!isMobileDevice()) return false;
    
    // Store the encrypted data in secure storage
    const serializedData = JSON.stringify(encryptedData);
    return await storeSecureData('encrypted_mnemonic', serializedData);
  } catch (error) {
    console.error('Failed to store mnemonic in secure storage:', error);
    return false;
  }
}

/**
 * Retrieve encrypted mnemonic from secure device storage
 * @returns The encrypted mnemonic data or null if not found
 */
export async function getMnemonicFromSecureStorage(): Promise<{ ciphertext: string; iv: string; salt: string } | null> {
  try {
    if (!isMobileDevice()) return null;
    
    const serializedData = await getSecureData('encrypted_mnemonic');
    if (!serializedData) return null;
    
    return JSON.parse(serializedData);
  } catch (error) {
    console.error('Failed to retrieve mnemonic from secure storage:', error);
    return null;
  }
}

/**
 * Check if encrypted mnemonic exists in secure storage
 * @returns True if mnemonic exists in secure storage
 */
export async function hasMnemonicInSecureStorage(): Promise<boolean> {
  try {
    if (!isMobileDevice()) return false;
    
    const data = await getSecureData('encrypted_mnemonic');
    return !!data;
  } catch (error) {
    console.error('Failed to check for mnemonic in secure storage:', error);
    return false;
  }
}

// -----------------UNUSED FUNCTIONALITIES---------------------

const SECURE_STORAGE_PREFIX = 'secure_wallet_';

/**
 * Scan a QR code containing a Bitcoin/Lightning/Liquid address or invoice
 * 
 * Note: This is a mock implementation. In a real app, this would use the
 * Capacitor Camera API with the barcode scanner plugin or a custom implementation.
 */
export async function scanQRCode(): Promise<{
  type: 'bitcoin' | 'lightning' | 'liquid' | 'unknown';
  value: string;
} | null> {
  if (!isMobileDevice()) {
    // For development/testing in browser
    const mockValues: Array<{ type: 'bitcoin' | 'lightning' | 'liquid' | 'unknown'; value: string }> = [
      { type: 'bitcoin', value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
      { type: 'lightning', value: 'lnbc10m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w' },
      { type: 'liquid', value: 'VTpz1bNuCALgavJKgbAw9Lpp9A72rJy64XPqgqTsi8LCJbZnM5jA6PhK3mQ3bYMf7Y5LPHwRv9d7o3jUw5ZBwKGX8PUEvV5nr7hK8rFvHP2LQ9agqH' }
    ];

    const randomIndex = Math.floor(Math.random() * mockValues.length);
    return mockValues[randomIndex];
  }

  try {
    // This would be replaced with actual native QR scanning functionality
    // using a Capacitor plugin like @capacitor-community/barcode-scanner

    // Mock implementation that simulates scanning a Bitcoin address
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Return a mock Bitcoin address as if scanned
    return {
      type: 'bitcoin',
      value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
    };
  } catch (error) {
    console.error('Error scanning QR code:', error);
    return null;
  }
}

/**
 * Parse a scanned QR code and detect its type
 */
export function parseScannedQRCode(data: string): {
  type: 'bitcoin' | 'lightning' | 'liquid' | 'unknown';
  value: string;
} {
  // Bitcoin URI (BIP21)
  if (data.toLowerCase().startsWith('bitcoin:')) {
    return { type: 'bitcoin', value: data };
  }

  // Bitcoin address patterns
  if (
    data.startsWith('1') || // P2PKH
    data.startsWith('3') || // P2SH
    data.startsWith('bc1') // Bech32
  ) {
    return { type: 'bitcoin', value: data };
  }

  // Lightning Invoice (BOLT11)
  if (
    data.toLowerCase().startsWith('lightning:') ||
    data.startsWith('lnbc') ||
    data.startsWith('lntb') ||
    data.startsWith('lnbcrt')
  ) {
    return { type: 'lightning', value: data.replace(/^lightning:/i, '') };
  }

  // Liquid address typically starts with different prefix
  if (
    data.startsWith('VT') ||
    data.startsWith('AZ') ||
    data.startsWith('ex')
  ) {
    return { type: 'liquid', value: data };
  }

  // Unknown format
  return { type: 'unknown', value: data };
}

/**
 * Store encrypted wallet data in secure storage
 */
export async function storeSecureData(key: string, data: string): Promise<boolean> {
  try {
    await Preferences.set({
      key: `${SECURE_STORAGE_PREFIX}${key}`,
      value: data
    });
    return true;
  } catch (error) {
    console.error('Error storing secure data:', error);
    return false;
  }
}

/**
 * Retrieve encrypted wallet data from secure storage
 */
export async function getSecureData(key: string): Promise<string | null> {
  try {
    const result = await Preferences.get({ key: `${SECURE_STORAGE_PREFIX}${key}` });
    return result.value;
  } catch (error) {
    console.error('Error retrieving secure data:', error);
    return null;
  }
}

/**
 * Delete secure data
 */
export async function deleteSecureData(key: string): Promise<boolean> {
  try {
    await Preferences.remove({ key: `${SECURE_STORAGE_PREFIX}${key}` });
    return true;
  } catch (error) {
    console.error('Error deleting secure data:', error);
    return false;
  }
}

/**
 * Check if wallet data exists in secure storage
 */
export async function hasSecureWalletData(): Promise<boolean> {
  try {
    const result = await Preferences.get({ key: `${SECURE_STORAGE_PREFIX}wallet_data` });
    return !!result.value;
  } catch (error) {
    console.error('Error checking for secure wallet data:', error);
    return false;
  }
}

/**
 * Register for transaction notifications
 */
export async function registerForTransactionNotifications(
  addresses: WalletAddress[]
): Promise<boolean> {
  if (!isMobileDevice()) {
    return false;
  }

  try {
    // In a real implementation, this would register the addresses with a
    // notification service that monitors blockchain transactions

    // Mock implementation - would normally store these addresses in a backend service
    // that watches for blockchain/Lightning transactions and sends push notifications
    console.log('Registered for notifications for addresses:', addresses);

    return true;
  } catch (error) {
    console.error('Error registering for transaction notifications:', error);
    return false;
  }
}

/**
 * Setup background transaction monitoring
 */
export function setupBackgroundMonitoring(): void {
  if (!isMobileDevice()) {
    return;
  }

  // This would implement app-specific background tasks to check for new 
  // transactions and notify the user. Background task implementation varies
  // by platform and would use platform-specific APIs.

  // On iOS, this might use Background Fetch
  // On Android, this might use WorkManager or a Foreground Service

  console.log('Background transaction monitoring set up');
}

/**
 * Handle deep links for wallet operations
 * 
 * This would be called from the main app when a deep link is detected
 */
export function handleWalletDeepLink(url: string): {
  type: 'bitcoin' | 'lightning' | 'liquid' | 'unknown';
  action: string;
  data: any;
} {
  // Parse the URL to extract wallet operations
  try {
    // Example: bittasker://wallet/bitcoin/send?address=xxx&amount=yyy
    const uri = new URL(url);

    if (uri.protocol !== 'bittasker:') {
      return { type: 'unknown', action: 'none', data: null };
    }

    const pathParts = uri.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2 || pathParts[0] !== 'wallet') {
      return { type: 'unknown', action: 'none', data: null };
    }

    // Extract params
    const params: Record<string, string> = {};
    uri.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return {
      type: pathParts[1] as 'bitcoin' | 'lightning' | 'liquid' | 'unknown',
      action: pathParts[2] || 'view',
      data: params
    };
  } catch (error) {
    console.error('Error parsing wallet deep link:', error);
    return { type: 'unknown', action: 'none', data: null };
  }
} 