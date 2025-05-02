/**
 * QR Scanner utility functions
 * This file provides a wrapper around the Capacitor MLKit Barcode Scanner plugin
 * to handle QR code scanning functionality.
 */

import {
  BarcodeScanner,
  BarcodeFormat,
  type BarcodesScannedEvent,
  LensFacing,
} from '@capacitor-mlkit/barcode-scanning';
import { Torch } from '@capawesome/capacitor-torch';
import { Capacitor } from '@capacitor/core';

/**
 * Apply scanner styles to make background transparent and hide other elements
 */
export function applyBarcodeScannerStyles(): void {
  document.body.classList.add('barcode-scanning-active');
  // document.body.classList.add('barcode-modal-open');
  // document.documentElement.classList.add('barcode-scanning');
  // document.body.classList.add('barcode-scanner-active');
}

/**
 * Remove scanner styles to restore normal app appearance
 */
export function removeBarcodeScannerStyles(): void {
  document.body.classList.remove('barcode-scanning-active');
  // document.body.classList.remove('barcode-modal-open');
  // document.body.classList.remove('barcode-scanner-active');
  // document.documentElement.classList.remove('barcode-scanning');
}

/**
 * Check if the camera permission is granted
 * @returns Promise<boolean> - True if permission is granted, false otherwise
 */
export async function checkCameraPermission(): Promise<boolean> {
  try {
    const { camera } = await BarcodeScanner.checkPermissions();
    return camera === 'granted';
  } catch (error) {
    console.error('Error checking camera permission:', error);
    return false;
  }
}

/**
 * Request camera permissions
 * @returns Promise<boolean> - True if permission is granted, false otherwise
 */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    const { camera } = await BarcodeScanner.requestPermissions();
    return camera === 'granted';
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    return false;
  }
}

/**
 * Check if barcode scanning is supported on the device
 * @returns Promise<boolean> - True if supported, false otherwise
 */
export async function isBarcodeScanningSupported(): Promise<boolean> {
  try {
    const { supported } = await BarcodeScanner.isSupported();
    return supported;
  } catch (error) {
    console.error('Error checking if barcode scanning is supported:', error);
    return false;
  }
}

/**
 * Start scanning with detection bounds
 * @param formats - Barcode formats to scan for
 * @param lensFacing - Which camera to use
 * @param videoElement - HTML video element for web platform
 * @param squareElement - Square overlay element for detection bounds
 * @param onBarcodeDetected - Callback when barcode is detected
 * @returns Promise<{listener: any}> - The listener that was created
 */
export async function startScanningWithBounds(
  formats: BarcodeFormat[] = [BarcodeFormat.QrCode],
  lensFacing: LensFacing = LensFacing.Back,
  videoElement?: HTMLVideoElement,
  squareElement?: HTMLDivElement,
  onBarcodeDetected?: (barcode: any) => void
): Promise<{ listener: any }> {
  try {
    // Apply transparent styles
    applyBarcodeScannerStyles();

    if (!squareElement || !onBarcodeDetected) {
      throw new Error('Square element and callback are required');
    }

    const options = {
      formats: formats,
      lensFacing: lensFacing,
      videoElement: Capacitor.getPlatform() === 'web' ? videoElement : undefined
    };

    // Setup detection bounds to only trigger when barcode is within square
    const squareElementBoundingClientRect = squareElement.getBoundingClientRect();
    const scaledRect = {
      left: squareElementBoundingClientRect.left * window.devicePixelRatio,
      right: squareElementBoundingClientRect.right * window.devicePixelRatio,
      top: squareElementBoundingClientRect.top * window.devicePixelRatio,
      bottom: squareElementBoundingClientRect.bottom * window.devicePixelRatio,
      width: squareElementBoundingClientRect.width * window.devicePixelRatio,
      height: squareElementBoundingClientRect.height * window.devicePixelRatio
    };

    const detectionCornerPoints = [
      [scaledRect.left, scaledRect.top],
      [scaledRect.left + scaledRect.width, scaledRect.top],
      [scaledRect.left + scaledRect.width, scaledRect.top + scaledRect.height],
      [scaledRect.left, scaledRect.top + scaledRect.height]
    ];

    const listener = await BarcodeScanner.addListener('barcodesScanned', async (event) => {
      const firstBarcode = event.barcodes[0];
      if (!firstBarcode) {
        return;
      }

      const cornerPoints = firstBarcode.cornerPoints;
      if (detectionCornerPoints && cornerPoints && Capacitor.getPlatform() !== 'web') {
        if (
          detectionCornerPoints[0][0] > cornerPoints[0][0] ||
          detectionCornerPoints[0][1] > cornerPoints[0][1] ||
          detectionCornerPoints[1][0] < cornerPoints[1][0] ||
          detectionCornerPoints[1][1] > cornerPoints[1][1] ||
          detectionCornerPoints[2][0] < cornerPoints[2][0] ||
          detectionCornerPoints[2][1] < cornerPoints[2][1] ||
          detectionCornerPoints[3][0] > cornerPoints[3][0] ||
          detectionCornerPoints[3][1] < cornerPoints[3][1]
        ) {
          return;
        }
      }

      // Call the callback with the detected barcode
      onBarcodeDetected(firstBarcode);
    });

    // Start the scan
    await BarcodeScanner.startScan(options);

    return { listener };
  } catch (error) {
    console.error('Error starting scan with bounds:', error);
    removeBarcodeScannerStyles();
    return { listener: null };
  }
}

/**
 * Scan a single barcode and return the result
 * @returns Promise<string> - The scanned barcode content
 */
export async function scanSingleBarcode(): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      // Check if scanner is supported first
      const isSupported = await isBarcodeScanningSupported();
      if (!isSupported) {
        console.error('Barcode scanning is not supported on this device');
        resolve('');
        return;
      }

      // Apply transparent styles
      applyBarcodeScannerStyles();

      // Make sure we clean up properly in case of errors
      const cleanup = async () => {
        try {
          removeBarcodeScannerStyles();
          await BarcodeScanner.removeAllListeners();
          await BarcodeScanner.stopScan();
        } catch (error) {
          console.error('Error during scanner cleanup:', error);
        }
      };

      // Add the listener for barcode scanned events
      const listener = await BarcodeScanner.addListener(
        'barcodesScanned',
        async (result: any) => {
          console.log('Barcode scanned:', result.barcodes[0]?.rawValue);
          await listener.remove();
          await cleanup();
          resolve(result.barcodes[0]?.rawValue || '');
        }
      );

      // Start scanning
      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode],
        lensFacing: LensFacing.Back,
      });
    } catch (error) {
      console.error('Error scanning single barcode:', error);
      removeBarcodeScannerStyles();

      // Try to stop scan and remove listeners in case of error
      try {
        await BarcodeScanner.removeAllListeners();
        await BarcodeScanner.stopScan();
      } catch (innerError) {
        console.error('Error cleaning up after scan error:', innerError);
      }

      resolve('');
    }
  });
}

/**
 * Scan multiple barcodes
 * @returns Promise<string[]> - Array of scanned barcode contents
 */
export async function scanMultipleBarcodes(): Promise<string[]> {
  try {
    applyBarcodeScannerStyles();
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode]
    });
    removeBarcodeScannerStyles();
    return barcodes.map(barcode => barcode.rawValue);
  } catch (error) {
    console.error('Error scanning multiple barcodes:', error);
    removeBarcodeScannerStyles();
    return [];
  }
}

/**
 * Stop scanning for QR codes
 * @param listener - The listener object returned from startScanningWithListener
 */
export async function stopScanning(listener?: any): Promise<void> {
  try {
    if (listener) {
      await listener.remove();
    } else {
      await BarcodeScanner.removeAllListeners();
    }

    removeBarcodeScannerStyles();
    await BarcodeScanner.stopScan();
  } catch (error) {
    console.error('Error stopping scan:', error);
    removeBarcodeScannerStyles();
  }
}

/**
 * Enable the torch/flashlight
 */
export async function enableTorch(): Promise<void> {
  try {
    await Torch.enable();
  } catch (error) {
    console.error('Error enabling torch:', error);
  }
}

/**
 * Disable the torch/flashlight
 */
export async function disableTorch(): Promise<void> {
  try {
    await Torch.disable();
  } catch (error) {
    console.error('Error disabling torch:', error);
  }
}

/**
 * Toggle the torch/flashlight
 */
export async function toggleTorch(): Promise<void> {
  try {
    await Torch.toggle();
  } catch (error) {
    console.error('Error toggling torch:', error);
  }
}

/**
 * Check if the torch is enabled
 * @returns Promise<boolean> - True if enabled, false otherwise
 */
export async function isTorchEnabled(): Promise<boolean> {
  try {
    const { enabled } = await Torch.isEnabled();
    return enabled;
  } catch (error) {
    console.error('Error checking if torch is enabled:', error);
    return false;
  }
}

/**
 * Check if the torch is available on the device
 * @returns Promise<boolean> - True if available, false otherwise
 */
export async function isTorchAvailable(): Promise<boolean> {
  try {
    const { available } = await Torch.isAvailable();
    return available;
  } catch (error) {
    console.error('Error checking if torch is available:', error);
    return false;
  }
}

/**
 * Set the zoom ratio for the camera
 * @param zoomRatio - The zoom ratio to set (between min and max)
 */
export async function setZoomRatio(zoomRatio: number): Promise<void> {
  try {
    await BarcodeScanner.setZoomRatio({ zoomRatio });
  } catch (error) {
    console.error('Error setting zoom ratio:', error);
  }
}

/**
 * Get the current zoom ratio
 * @returns Promise<number> - The current zoom ratio
 */
export async function getZoomRatio(): Promise<number> {
  try {
    const { zoomRatio } = await BarcodeScanner.getZoomRatio();
    return zoomRatio;
  } catch (error) {
    console.error('Error getting zoom ratio:', error);
    return 1.0;
  }
}

/**
 * Get the minimum zoom ratio
 * @returns Promise<number> - The minimum zoom ratio
 */
export async function getMinZoomRatio(): Promise<number> {
  try {
    const { zoomRatio } = await BarcodeScanner.getMinZoomRatio();
    return zoomRatio;
  } catch (error) {
    console.error('Error getting minimum zoom ratio:', error);
    return 1.0;
  }
}

/**
 * Get the maximum zoom ratio
 * @returns Promise<number> - The maximum zoom ratio
 */
export async function getMaxZoomRatio(): Promise<number> {
  try {
    const { zoomRatio } = await BarcodeScanner.getMaxZoomRatio();
    return zoomRatio;
  } catch (error) {
    console.error('Error getting maximum zoom ratio:', error);
    return 1.0;
  }
}

/**
 * Open the camera settings
 */
export async function openCameraSettings(): Promise<void> {
  try {
    await BarcodeScanner.openSettings();
  } catch (error) {
    console.error('Error opening camera settings:', error);
  }
}







/* ######################################################### */
/* ######################################################### */
/* QR Code Parsing */


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
