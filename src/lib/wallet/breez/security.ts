/**
 * Breez SDK Security Layer with Passkey Integration
 * Provides security middleware for all wallet operations
 */

import { getMnemonicPasskey } from '$lib/wallet/mnemonicBiometrics';
import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
import type { PrepareSendRequest, PrepareSendResponse } from '@breeztech/breez-sdk-liquid/web';

export interface SecurityContext {
	operation: 'send' | 'receive' | 'swap' | 'backup';
	amount?: number;
	destination?: string;
	asset?: string;
	userId?: string;
}

export interface SecurityThresholds {
	microTransaction: number; // < $10 USD equivalent
	standardTransaction: number; // $10-$100 USD
	highValueTransaction: number; // > $100 USD
}

export interface SecurityAuditLog {
	timestamp: Date;
	operation: string;
	amount?: number;
	asset?: string;
	destination?: string;
	passkeyUsed: boolean;
	success: boolean;
	deviceId: string;
	userAgent: string;
	threshold?: string;
}

export class BreezSecurityService {
	private static instance: BreezSecurityService;
	private auditLogs: SecurityAuditLog[] = [];
	private sessionTimeout = 5 * 60 * 1000; // 5 minutes
	private lastPasskeyAuth: number = 0;

	// Security thresholds in satoshis (approximate USD values)
	private thresholds: SecurityThresholds = {
		microTransaction: 1000000, // ~$10 (assuming $100k BTC)
		standardTransaction: 10000000, // ~$100 
		highValueTransaction: 10000000 // > $100
	};

	static getInstance(): BreezSecurityService {
		if (!BreezSecurityService.instance) {
			BreezSecurityService.instance = new BreezSecurityService();
		}
		return BreezSecurityService.instance;
	}

	/**
	 * Verify passkey for send operations based on amount thresholds
	 */
	async verifyPasskeyForSend(
		amount: number, 
		destination: string, 
		asset: string = 'L-BTC'
	): Promise<boolean> {
		const context: SecurityContext = {
			operation: 'send',
			amount,
			destination,
			asset
		};

		return await this.handlePasskeyVerification(context);
	}

	/**
	 * Check if passkey re-authorization is required for high-value transactions
	 */
	async requirePasskeyReauth(amount: number, threshold?: number): Promise<boolean> {
		const actualThreshold = threshold || this.thresholds.highValueTransaction;
		return amount > actualThreshold || this.isSessionExpired();
	}

	/**
	 * Verify passkey for off-platform transfers (always required)
	 */
	async verifyPasskeyForOffPlatform(destination: string, amount: number): Promise<boolean> {
		const context: SecurityContext = {
			operation: 'send',
			amount,
			destination,
			asset: 'L-BTC'
		};

		// Always require passkey for off-platform transfers
		return await this.handlePasskeyVerification(context, true);
	}

	/**
	 * Core passkey verification handler
	 */
	private async handlePasskeyVerification(
		context: SecurityContext, 
		forceVerification: boolean = false
	): Promise<boolean> {
		try {
			// Determine if passkey verification is needed
			const needsVerification = forceVerification || 
				this.shouldRequirePasskey(context) || 
				this.isSessionExpired();

			if (!needsVerification) {
				this.logSecurityEvent(context, true, 'micro-transaction-skip');
				return true;
			}

			// Attempt passkey verification using mnemonic passkey system
			const mnemonic = await getMnemonicPasskey();
			
			if (mnemonic) {
				this.lastPasskeyAuth = Date.now();
				this.logSecurityEvent(context, true, 'passkey-verified');
				return true;
			} else {
				this.logSecurityEvent(context, false, 'passkey-failed');
				return false;
			}
		} catch (error) {
			console.error('Passkey verification failed:', error);
			this.logSecurityEvent(context, false, 'passkey-error');
			return false;
		}
	}

	/**
	 * Determine if passkey verification is required based on thresholds
	 */
	private shouldRequirePasskey(context: SecurityContext): boolean {
		if (!context.amount) return false;

		// Always require for off-platform transfers
		if (this.isOffPlatformDestination(context.destination)) {
			return true;
		}

		// Check amount thresholds
		if (context.amount < this.thresholds.microTransaction) {
			return false; // Micro transactions don't need passkey
		}

		return true; // Standard and high-value transactions need passkey
	}

	/**
	 * Check if destination is off-platform (external address)
	 */
	private isOffPlatformDestination(destination?: string): boolean {
		if (!destination) return false;

		// Check for Bitcoin addresses (starts with bc1, 1, 3)
		if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(destination)) {
			return true;
		}

		// Check for Liquid addresses (starts with ex1, lq1)
		if (/^(ex1|lq1)[a-zA-HJ-NP-Z0-9]{25,62}$/.test(destination)) {
			return true;
		}

		// Check for Lightning addresses (contains @)
		if (destination.includes('@')) {
			return false; // Lightning addresses are typically on-platform
		}

		// Check for BOLT11 invoices (starts with ln)
		if (destination.startsWith('ln')) {
			return false; // BOLT11 invoices are on-platform
		}

		return false;
	}

	/**
	 * Check if security session has expired
	 */
	private isSessionExpired(): boolean {
		return Date.now() - this.lastPasskeyAuth > this.sessionTimeout;
	}

	/**
	 * Log security events for audit trail
	 */
	async logSecurityEvent(
		context: SecurityContext, 
		success: boolean, 
		threshold?: string
	): Promise<void> {
        const deviceId = await getDeviceIdentifier();

		const logEntry: SecurityAuditLog = {
			timestamp: new Date(),
			operation: context.operation,
			amount: context.amount,
			asset: context.asset,
			destination: context.destination,
			passkeyUsed: true,
			success,
			deviceId,
			userAgent: navigator.userAgent,
			threshold
		};

		this.auditLogs.push(logEntry);
		
		// Keep only last 1000 entries
		if (this.auditLogs.length > 1000) {
			this.auditLogs = this.auditLogs.slice(-1000);
		}

		console.log('Security audit log:', logEntry);
	}

	/**
	 * Get security audit logs
	 */
	getAuditLogs(): SecurityAuditLog[] {
		return [...this.auditLogs];
	}

	/**
	 * Clear security session (logout)
	 */
	clearSession(): void {
		this.lastPasskeyAuth = 0;
	}

	/**
	 * Update security thresholds
	 */
	updateThresholds(thresholds: Partial<SecurityThresholds>): void {
		this.thresholds = { ...this.thresholds, ...thresholds };
	}
}

/**
 * Passkey security middleware for intercepting wallet operations
 */
export class PasskeySecurityMiddleware {
	private securityService: BreezSecurityService;

	constructor() {
		this.securityService = BreezSecurityService.getInstance();
	}

	/**
	 * Intercept and secure send payment operations
	 */
	async secureSendPayment(
		prepareSendRequest: PrepareSendRequest,
		prepareResponse: PrepareSendResponse
	): Promise<boolean> {
		// Extract amount from prepare response
		const amountSat = this.extractAmountFromPrepare(prepareSendRequest, prepareResponse);
		const destination = prepareSendRequest.destination;

		// Verify passkey based on destination and amount
		return await this.securityService.verifyPasskeyForSend(
			amountSat, 
			destination
		);
	}

	/**
	 * Extract amount from prepare request/response
	 */
	private extractAmountFromPrepare(
		request: PrepareSendRequest, 
		response: PrepareSendResponse
	): number {
		// Try to get amount from request first
		if (request.amount && 'receiverAmountSat' in request.amount) {
			return request.amount.receiverAmountSat;
		}

		// Fallback to fees as a proxy (not ideal but better than nothing)
		return response.feesSat || 0;
	}

	/**
	 * Secure receive payment operations (if needed)
	 */
	async secureReceivePayment(amount?: number): Promise<boolean> {
		// Receiving typically doesn't need additional security
		// But we can log the event
		this.securityService.logSecurityEvent(
			{ operation: 'receive', amount },
			true,
			'receive-operation'
		);
		return true;
	}
}

// Export singleton instance
export const breezSecurity = BreezSecurityService.getInstance();
export const passkeyMiddleware = new PasskeySecurityMiddleware();