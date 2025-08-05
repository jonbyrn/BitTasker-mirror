// Main wallet service - simplified and modular
import { connectToBreezSdk, disconnectSdk } from './sdk';
import { initializeEventSystem, cleanupEventSystem, paymentEventsStore, pendingPaymentsStore } from './events';

// Re-export all payment operations
export * from './payments';
export * from './lnurl';
export * from './assets';
export * from './notifications';
export * from './sdk';

// Re-export specific functions for backward compatibility
export { parseInput as parseInputAdvanced } from './payments';

// Re-export event stores
export { paymentEventsStore, pendingPaymentsStore };

// Re-export logger utilities
export { isLoggerReady, resetLoggerState } from './sdk';

/**
 * Main wallet connection with full initialization
 */
export async function connectToBreez(
	mnemonic: string, 
	network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<void> {
	try {
		// Connect to SDK
		await connectToBreezSdk(mnemonic, network);
		
		// Initialize event system
		await initializeEventSystem();
		
		console.log('🎉 Breez wallet connected successfully');
	} catch (error) {
		console.error('Failed to connect to Breez wallet:', error);
		throw error;
	}
}

/**
 * Disconnect wallet and cleanup
 */
export async function disconnect(): Promise<void> {
	try {
		// Cleanup event system
		await cleanupEventSystem();
		
		// Disconnect SDK
		await disconnectSdk();
		
		console.log('👋 Wallet disconnected successfully');
	} catch (error) {
		console.error('Failed to disconnect wallet:', error);
		throw error;
	}
}
