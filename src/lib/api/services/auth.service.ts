import type {
	AccountRecoveryData,
	NostrLoginData,
	NostrRecoveryCompleteData,
	NostrRecoveryData,
	UserData,
	EncryptedData,
	MasterKeyRegistration,
	PasskeyLoginData,
	MasterKeyMigration
} from '$lib/types/auth';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';


/**
 * Authentication Service
 * Handles user authentication, registration, and related operations
 */
export class AuthService extends BaseApiService {
	/**
	 * Login with Nostr
	 * @param event Nostr event
	 * @param challenge Login challenge
	 * @returns Promise with the login response
	 * @throws {Error} 400 - No account associated with Nostr key or missing data
	 * @throws {Error} 401 - Invalid signature or unauthorized access
	 * @throws {Error} 500 - Internal server error
	 */
	async loginWithNostr(data: NostrLoginData): Promise<{ access_token: string; user: UserData; isNewUser: boolean }> {
		try {
			const response = await this.post<{ access_token: string; user: UserData; isNewUser: boolean }>(
				ENDPOINTS.AUTH.NOSTR_LOGIN,
				data
			);
			return response.data;
		} catch (error: any) {
			if (error?.status === 400) {
				throw new Error(
					error.data?.message || 'No account associated with this Nostr key. Please register first.'
				);
			}
			if (error?.status === 401) {
				throw new Error('Invalid signature or unauthorized access');
			}
			if (error?.status === 500) {
				throw new Error('Internal server error. Please try again later.');
			}

			throw new Error(error || 'Login failed. Please try again.');
		}
	}

	/**
	 * Register a new user with master key encrypted data (Nostr + Wallet) - Legacy REST endpoint
	 * @param registrationData Master key registration data containing both Nostr and wallet encryption
	 * @returns Promise with the registration response
	 * @throws {Error} 400 - Bad Request or missing required encryption data
	 * @throws {Error} 409 - Email already in use
	 * @throws {Error} 422 - Invalid encryption data format
	 * @throws {Error} 500 - Internal server error
	 */
	async registerWithMasterKey(
		registrationData: MasterKeyRegistration
	): Promise<{ publicKey: string; user: UserData, access_token: string }> {
		try {
			// Validate required fields
			if (!registrationData.publicKey || !registrationData.masterKeyData) {
				throw new Error('Missing required master key registration data');
			}

			// Validate master key data structure
			const { masterKeyData } = registrationData;
			if (!masterKeyData.nostr || !masterKeyData.wallet) {
				throw new Error('Invalid master key data structure');
			}

			const response = await this.post<{ publicKey: string; user: UserData; access_token: string; error: any }>(
				ENDPOINTS.AUTH.REGISTER_MASTER_KEY,
				registrationData
			);

			if (response?.data?.error) {
				throw new Error(response.data.error?.message);
			}

			return response.data;
		} catch (error: any) {
			throw new Error(error);
		}
	}

	/**
	 * Get login challenge for a user
	 * @returns Promise with login challenge data
	 */
	async getLoginChallenge(): Promise<{ challenge: string; message: string }> {
		const response = await this.get<{ challenge: string; message: string }>(
			ENDPOINTS.AUTH.NOSTR_CHALLENGE
		);
		return response.data;
	}

	/**
	 * Get master key encrypted data using REST endpoint - Legacy
	 * @param publicKey User's Nostr public key
	 * @param deviceId Unique device identifier
	 * @param credentialId Credential ID used for WebAuthn passkey
	 * @returns Promise with master key encrypted data and format indicator
	 */
	async getEncryptedData(
		publicKey: string,
		deviceId: string,
		credentialId: string,
		deviceName: string
	): Promise<{
		encryptionData: EncryptedData;
		isLegacyFormat: boolean;
	}> {
		const response = await this.get(
			ENDPOINTS.AUTH.MASTER_KEY_ENCRYPTED_DATA + `/${encodeURIComponent(publicKey)}?deviceId=${encodeURIComponent(deviceId)}&credentialId=${encodeURIComponent(credentialId)}&deviceName=${encodeURIComponent(deviceName)}`
		);
		return response.data;
	}

	/**
	 * Login with biometric authentication
	 * @param publicKey User's Nostr public key
	 * @param deviceId Unique device identifier
	 * @returns Promise with authentication response
	 */
	async loginWithPasskey(data: PasskeyLoginData): Promise<{ user: UserData; access_token: string }> {
		const response = await this.post<{ user: UserData; access_token: string }>(
			ENDPOINTS.AUTH.PASSKEY_LOGIN,
			data
		);
		return response.data;
	}

	/**
	 * Initiate nostr recovery process
	 * @param email User's email
	 * @response 200 - Recovery email sent successfully
	 * @response 400 - Bad request
	 * @returns Promise with recovery response
	 */
	async initiateNostrRecovery(email: string): Promise<void> {
		await this.post(ENDPOINTS.AUTH.NOSTR_RECOVERY_INITIATE, { email });
	}

	/**
	 * Get nostr recovery data
	 * @param npub User's Nostr public key
	 * @response 200 - Recovery data retrieved successfully
	 * @response 404 - No recovery data found
	 * @returns Promise with recovery data
	 */
	async getNostrRecoveryData(data: { npub: string, otp: string }): Promise<NostrRecoveryData> {
		const response = await this.post(ENDPOINTS.AUTH.NOSTR_RECOVERY_VERIFY, data);
		return response.data;
	}

	/**
	 * Complete nostr recovery process
	 * @param data Nostr recovery complete data
	 * @response 200 - Recovery completed successfully
	 * @response 400 - Bad request
	 * @response 404 - User not found
	 * @returns Promise with recovery response
	 */
	async completeNostrRecovery(data: NostrRecoveryCompleteData): Promise<{ access_token: string; user: UserData }> {
		const response = await this.post(ENDPOINTS.AUTH.NOSTR_RECOVERY_COMPLETE, data);
		return response.data;
	}

	/**
	 * Setup account recovery password
	 * @param data Account recovery data
	 * @returns Promise with recovery response
	 */
	async setupAccountRecoveryPassword(data: AccountRecoveryData): Promise<{
		success: boolean;
		userId: number;
		publicKey: string;
	}> {
		const response = await this.post(ENDPOINTS.AUTH.ACCOUNT_RECOVERY_KEY, data);
		return response.data;
	}

	/**
	 * Verify email using token
	 * @param token Verification token
	 * @response 200 - Email verified successfully
	 * @response 400 - Invalid token or token expired
	 * @returns Promise with verification response
	 */
	async verifyEmail(token: string): Promise<void> {
		await this.get(ENDPOINTS.AUTH.EMAIL_VERIFICATION, { params: { token } });
	}

	/**
	 * Verify Cloudflare Turnstile token
	 * @param token Turnstile token
	 * @param action Optional action custom action to track in analytics
	 * @response 200 - Token verified successfully
	 * @response 400 - Invalid token
	 * @response 500 - Verification service error
	 * @returns Promise with verification response
	 */
	async verifyTurnstile(token: string, action?: string): Promise<{ success: boolean; message: string }> {
		try {
			const response = await this.post<{ success: boolean; message: string }>(
				ENDPOINTS.AUTH.VERIFY_TURNSTILE,
				{ token, action }
			);
			return response.data;
		} catch (error: any) {
			if (error?.status === 400) {
				throw new Error(error.data?.message || 'Invalid token');
			}
			if (error?.status === 500) {
				throw new Error('Verification service error. Please try again later.');
			}
			throw new Error(error || 'Turnstile verification failed. Please try again.');
		}
	}

	/**
	 * Check if user onboarding is complete
	 * @response 200 - Onboarding status retrieved successfully
	 * @response 401 - Unauthorized
	 * @returns Promise with onboarding status
	 */
	async checkOnboardingStatus(): Promise<{ isComplete: boolean; missingFields: string[] }> {
		try {
			const response = await this.get<{ isComplete: boolean; missingFields: string[] }>(
				ENDPOINTS.AUTH.ONBOARDING_STATUS
			);
			return response.data;
		} catch (error: any) {
			if (error?.status === 401) {
				throw new Error('Unauthorized. Please login again.');
			}
			throw new Error(error || 'Failed to check onboarding status. Please try again.');
		}
	}

	/**
	 * Check if username is available
	 * @param username Username to check
	 * @response 200 - Username availability checked
	 * @returns Promise with availability status
	 */
	async checkUsernameAvailability(username: string): Promise<boolean> {
		try {
			const response = await this.get<{ available: boolean }>(
				ENDPOINTS.AUTH.CHECK_USERNAME,
				{ params: { username } }
			);
			return response.data.available;
		} catch (error: any) {
			throw new Error(error || 'Failed to check username availability. Please try again.');
		}
	}

	/**
	 * Migrate user to new master key system
	 * Migrates existing user to new secure master key system without storing exported master key in database
	 * @param data Master key migration data
	 * @response 200 - User successfully migrated to new master key system
	 * @response 400 - Invalid master key data format
	 * @response 404 - User not found
	 * @returns Promise with authentication response including access token and user data
	 */
	async migratePasskey(data: MasterKeyMigration): Promise<{ access_token: string; user: UserData }> {
		try {
			// Validate required fields
			if (!data.event || !data.oldCredentialId || !data.newCredentialId || !data.deviceId || !data.masterKeyData) {
				throw new Error('Missing required migration data');
			}

			// Validate master key data structure
			const { masterKeyData } = data;
			if (!masterKeyData.nostr || !masterKeyData.wallet || !masterKeyData.masterSalt) {
				throw new Error('Invalid master key data structure');
			}

			const response = await this.post<{ access_token: string; user: UserData }>(
				ENDPOINTS.AUTH.MIGRATE_MASTER_KEY,
				data
			);

			return response.data;
		} catch (error: any) {
			if (error?.status === 400) {
				throw new Error(error.data?.message || 'Invalid master key data format');
			}
			if (error?.status === 404) {
				throw new Error('User not found');
			}
			throw new Error(error || 'Migration failed. Please try again.');
		}
	}
}

// Create singleton instance
const authService = new AuthService();
export default authService;
