import init from '@breeztech/breez-sdk-liquid/web';
import { get, writable } from 'svelte/store';

// Flag to ensure we only initialize once
export const isWasmInitialized = writable(false);

// Function to initialize the WASM module
export const initWasm = async (): Promise<void> => {
  const initialized = get(isWasmInitialized);
  if (initialized) return;

  try {
    // Initialize the WASM module
    await init();
    isWasmInitialized.set(true);
  } catch (error) {
    console.error('Failed to initialize WASM module:', error);
    throw error;
  }
};