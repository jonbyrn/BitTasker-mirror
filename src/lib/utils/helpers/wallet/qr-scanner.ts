/**
 * QR Scanner utility functions
 * This file provides a wrapper around the Capacitor MLKit Barcode Scanner plugin
 * to handle QR code scanning functionality.
 */

import {
  BarcodeScanner,
  BarcodeFormat,
  LensFacing,
} from '@capacitor-mlkit/barcode-scanning';
import { Torch } from '@capawesome/capacitor-torch';

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
 * Start scanning for QR codes with a listener
 * @returns Promise<{listener: any}> - The listener object that can be used to remove the listener
 */
export async function startScanningWithListener(): Promise<{listener: any}> {
  try {
    // Make background transparent
    document.body.classList.add('barcode-scanner-active');
    
    // Add the barcodeScanned listener
    const listener = await BarcodeScanner.addListener(
      'barcodeScanned',
      async result => {
        console.log('Barcode scanned:', result.barcode);
      }
    );
    
    // Start the barcode scanner
    await BarcodeScanner.startScan({
      formats: [BarcodeFormat.QrCode],
      lensFacing: LensFacing.Back,
    });
    
    return { listener };
  } catch (error) {
    console.error('Error starting scan with listener:', error);
    document.body.classList.remove('barcode-scanner-active');
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
      document.body.classList.add('barcode-scanner-active');
      
      const listener = await BarcodeScanner.addListener(
        'barcodeScanned',
        async result => {
          await listener.remove();
          document.body.classList.remove('barcode-scanner-active');
          await BarcodeScanner.stopScan();
          resolve(result.barcode);
        }
      );
      
      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode],
        lensFacing: LensFacing.Back,
      });
    } catch (error) {
      console.error('Error scanning single barcode:', error);
      document.body.classList.remove('barcode-scanner-active');
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
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode],
      lensFacing: LensFacing.Back,
    });
    return barcodes.map(barcode => barcode.rawValue);
  } catch (error) {
    console.error('Error scanning multiple barcodes:', error);
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
    
    document.body.classList.remove('barcode-scanner-active');
    await BarcodeScanner.stopScan();
  } catch (error) {
    console.error('Error stopping scan:', error);
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