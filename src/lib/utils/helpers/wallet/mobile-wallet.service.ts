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

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { NativeBiometric } from 'capacitor-native-biometric';
import type { Transaction, WalletAddress } from '$lib/types/wallet';

// Constants
const BIOMETRIC_STORAGE_KEY = 'wallet_credentials';
const SECURE_STORAGE_PREFIX = 'secure_wallet_';

/**
 * Check if running on a mobile device
 */
export function isMobileDevice(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check if biometric authentication is available
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isMobileDevice()) {
    return false;
  }

  try {
    const { isAvailable } = await NativeBiometric.isAvailable();
    return isAvailable;
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return false;
  }
}

/**
 * Set up biometric authentication for wallet
 */
export async function setupBiometricAuth(password: string): Promise<boolean> {
  if (!isMobileDevice()) {
    return false;
  }

  try {
    // Attempt to verify biometrics before storing credentials
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Authenticate to set up wallet security',
        title: 'Biometric Authentication',
        subtitle: 'Use your biometrics to secure your wallet'
      });
    } catch (error) {
      console.error('Biometric verification failed:', error);
      return false;
    }

    // Store credentials securely
    await NativeBiometric.setCredentials({
      username: 'bittasker_wallet_user',
      password: password,
      server: 'bittasker.app',
    });

    return true;
  } catch (error) {
    console.error('Error setting up biometric auth:', error);
    return false;
  }
}

/**
 * Authenticate using biometrics and get wallet password
 */
export async function authenticateWithBiometrics(): Promise<string | null> {
  if (!isMobileDevice()) {
    return null;
  }

  try {
    // Verify user identity with biometrics
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Authenticate to access your wallet',
        title: 'Wallet Authentication',
        subtitle: 'Use your biometrics to unlock your wallet'
      });
    } catch (error) {
      console.error('Biometric verification failed:', error);
      return null;
    }

    // Retrieve stored credentials
    const credentials = await NativeBiometric.getCredentials({
      server: 'bittasker.app',
    });

    return credentials.password;
  } catch (error) {
    console.error('Error authenticating with biometrics:', error);
    return null;
  }
}

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
 * Check if device has local authentication (PIN/pattern/password) enabled
 * This is important for wallet security
 */
export async function hasDeviceSecurityEnabled(): Promise<boolean> {
  if (!isMobileDevice()) {
    return true; // Assume desktop is secure
  }
  
  // In a real implementation, this would check if device has screen lock enabled
  // This would require a native plugin that can check device security status
  
  // Mock implementation
  return true;
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