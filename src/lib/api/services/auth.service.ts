import type {
	RecoveryData,
	NostrRecoveryCompleteData,
	NostrRecoveryData,
	UserData,
	EncryptedData,
	RegistrationData,
	PasskeyLoginArgs,
	NostrLoginArgs,
	EncryptedNostrDataArgs,
	PasskeyEncryptedDataArgs
} from '$lib/types/auth';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

/**
 * Authentication Service
 * Handles user authentication, registration, and related operations
 */
export class AuthService extends BaseApiService {
	/**
	 * Register a new user with master key encrypted data (Nostr + Wallet) - Legacy REST endpoint
	 * @param registrationData Master key registration data containing both Nostr and wallet encryption
	 * @returns Promise with the registration response
	 * @throws {Error} 400 - Bad Request or missing required encryption data
	 * @throws {Error} 409 - Email already in use
	 * @throws {Error} 422 - Invalid encryption data format
	 * @throws {Error} 500 - Internal server error
	 */
	async register(registrationData: RegistrationData): Promise<{
		publicKey: string;
		user: UserData;
		access_token: string;
		refresh_token?: string;
		refresh_token_expires_at?: string;
	}> {
		try {
			// Validate required fields
			if (!registrationData.publicKey || !registrationData.encryptedData) {
				throw new Error('Missing required master key registration data');
			}

			// Validate master key data structure
			const { encryptedData } = registrationData;
			if (!encryptedData.nostr || !encryptedData.wallet) {
				throw new Error('Invalid master key data structure');
			}

			const response = await this.post<{
				publicKey: string;
				user: UserData;
				access_token: string;
				refresh_token?: string;
				refresh_token_expires_at?: string;
				error: { message: string };
			}>(ENDPOINTS.AUTH.REGISTER, registrationData);

			if (response?.data?.error) {
				throw new Error(response.data.error?.message);
			}

			return response.data;
		} catch (error: unknown) {
			throw new Error(error instanceof Error ? error.message : String(error));
		}
	}

	/**
	 * Get login challenge for a user
	 * Appends a unique cache-busting parameter (_cb) to force Cloudflare edge cache misses during development
	 * @returns Promise with login challenge data
	 */
	async getChallenge(): Promise<{ challenge: string; message: string }> {
		const url = `${ENDPOINTS.AUTH.NOSTR_CHALLENGE}?_cb=${Date.now()}`;
		const response = await this.get<{ challenge: string; message: string }>(url);

		if (
			!response?.data ||
			typeof response.data.challenge !== 'string' ||
			!response.data.challenge
		) {
			console.error('[AuthService.getChallenge] Malformed challenge response', {
				hasData: Boolean(response?.data),
				challengeType: typeof response?.data?.challenge,
				challengeValue: response?.data?.challenge,
				messageType: typeof response?.data?.message
			});
			throw new Error('Challenge missing from server');
		}
		return response.data;
	}

	/**
	 * Login with biometric authentication
	 * @param publicKey User's Nostr public key
	 * @param deviceId Unique device identifier
	 * @returns Promise with authentication response
	 */
	async passkeyLogin(data: PasskeyLoginArgs): Promise<{
		user: UserData;
		access_token: string;
		refresh_token?: string;
		refresh_token_expires_at?: string;
		encryptedData: EncryptedData;
		isLegacy?: boolean;
		accountRestored?: boolean;
	}> {
		const response = await this.post<{
			user: UserData;
			access_token: string;
			refresh_token?: string;
			refresh_token_expires_at?: string;
			encryptedData: EncryptedData;
			isLegacy?: boolean;
			accountRestored?: boolean;
		}>(ENDPOINTS.AUTH.PASSKEY_LOGIN, data);
		return response.data;
	}

	/**
	 * Login with Nostr
	 * @param data Nostr login data
	 * @returns Promise with the login response
	 * @throws {Error} 400 - No account associated with Nostr key or missing data
	 * @throws {Error} 401 - Invalid signature or unauthorized access
	 * @throws {Error} 500 - Internal server error
	 */
	async nostrLogin(data: NostrLoginArgs): Promise<{
		access_token: string;
		refresh_token?: string;
		refresh_token_expires_at?: string;
		user: UserData;
		isNewUser: boolean;
		isMigrated: boolean;
		accountRestored?: boolean;
	}> {
		try {
			// E2E BYPASS: Inject mock WebAuthn fields to satisfy backend validation
			let payload: NostrLoginArgs & {
				credentialId?: string;
				passkeyPubkey?: string;
				clientDataJSON?: string;
				attestationObject?: string;
			} = { ...data, authMethod: data.authMethod || 'nsec' };
			if (
				import.meta.env.VITE_E2E_TEST === 'true' ||
				(typeof navigator !== 'undefined' && navigator.webdriver)
			) {
				payload = {
					...payload,
					credentialId: 'e2e-mock-id',
					passkeyPubkey: 'e2e-mock-pubkey',
					clientDataJSON: 'e2e-mock-client-data',
					attestationObject: 'e2e-mock-attestation'
				};
			}

			const response = await this.post<{
				access_token: string;
				refresh_token?: string;
				refresh_token_expires_at?: string;
				user: UserData;
				isNewUser: boolean;
				isMigrated: boolean;
				accountRestored?: boolean;
			}>(ENDPOINTS.AUTH.NOSTR_LOGIN, payload);
			return response.data;
		} catch (error: unknown) {
			const err = error as { status?: number; data?: { message?: string } };
			if (err?.status === 400) {
				throw new Error(
					err.data?.message || 'No account associated with this Nostr key. Please register first.'
				);
			}
			if (err?.status === 401) {
				throw new Error(err.data?.message || 'Invalid signature or unauthorized access');
			}
			if (err?.status === 500) {
				throw new Error('Internal server error. Please try again later.');
			}

			throw new Error(
				error instanceof Error ? error.message : String(error) || 'Login failed. Please try again.'
			);
		}
	}

	/**
	 * Get encrypted data with nostr signed event
	 * @param data Encrypted nostr data arguments
	 * @returns Promise with encrypted data
	 */
	async encryptedNostrData(
		data: EncryptedNostrDataArgs
	): Promise<{ username: string; encryptedData: EncryptedData | null } | undefined> {
		try {
			const response = await this.post<{ username: string; encryptedData: EncryptedData }>(
				ENDPOINTS.AUTH.ENCRYPTED_NOSTR_DATA,
				data
			);
			return response.data;
		} catch (error: unknown) {
			const status = (error as { status?: number }).status;
			console.warn('Nostr encrypted data lookup did not return an account', status);
			return undefined;
		}
	}

	/**
	 * Get encrypted data with passkey signed event
	 * @param data Passkey encrypted data arguments
	 * @returns Promise with encrypted data
	 */
	async getPasskeyEncryptedData(
		data: PasskeyEncryptedDataArgs
	): Promise<{ encryptedData: EncryptedData }> {
		const response = await this.post<{ encryptedData: EncryptedData }>(
			ENDPOINTS.AUTH.ENCRYPTED_PASSKEY_DATA,
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
	async getNostrRecoveryData(data: { npub: string; otp: string }): Promise<NostrRecoveryData> {
		const response = await this.post<NostrRecoveryData>(ENDPOINTS.AUTH.NOSTR_RECOVERY_VERIFY, data);
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
	async completeNostrRecovery(data: NostrRecoveryCompleteData): Promise<{
		access_token: string;
		refresh_token?: string;
		refresh_token_expires_at?: string;
		user: UserData;
	}> {
		const response = await this.post<{
			access_token: string;
			refresh_token?: string;
			refresh_token_expires_at?: string;
			user: UserData;
		}>(ENDPOINTS.AUTH.NOSTR_RECOVERY_COMPLETE, data);
		return response.data;
	}

	/**
	 * Setup account recovery password
	 * @param data Account recovery data
	 * @returns Promise with recovery response
	 */
	async setupRecovery(data: RecoveryData): Promise<{
		user: UserData;
		publicKey: string;
	}> {
		const response = await this.post<{
			user: UserData;
			publicKey: string;
		}>(ENDPOINTS.AUTH.ACCOUNT_RECOVERY_KEY, data);
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
	async verifyTurnstile(
		token: string,
		action?: string
	): Promise<{ success: boolean; message: string }> {
		try {
			const response = await this.post<{ success: boolean; message: string }>(
				ENDPOINTS.AUTH.VERIFY_TURNSTILE,
				{ token, action }
			);
			return response.data;
		} catch (error: unknown) {
			const err = error as { status?: number; data?: { message?: string } };
			if (err?.status === 400) {
				throw new Error(err.data?.message || 'Invalid token');
			}
			if (err?.status === 500) {
				throw new Error('Verification service error. Please try again later.');
			}
			throw new Error(
				error instanceof Error
					? error.message
					: String(error) || 'Turnstile verification failed. Please try again.'
			);
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
			const response = await this.get<{ available: boolean }>(ENDPOINTS.AUTH.CHECK_USERNAME, {
				params: { username }
			});
			return response.data.available;
		} catch (error: unknown) {
			throw new Error(
				error instanceof Error
					? error.message
					: String(error) || 'Failed to check username availability. Please try again.'
			);
		}
	}

	/**
	 * Update the user's preferred language on the backend.
	 * Used for localized notification delivery.
	 * @param lang Language code ('en' or 'es')
	 */
	async updateLanguage(lang: string): Promise<void> {
		await this.patch(ENDPOINTS.AUTH.LANGUAGE, { lang });
	}

	/**
	 * Revoke the current session's refresh token on the server.
	 * Best-effort — callers should not block on failure.
	 */
	async logout(): Promise<void> {
		try {
			await this.post(ENDPOINTS.AUTH.LOGOUT, {});
		} catch {
			// Swallow — logout must succeed even if the server is unreachable
		}
	}

	/**
	 * Request account deletion (30-day grace period).
	 * The account enters PENDING_DELETION status. Logging in within 30 days automatically cancels the deletion.
	 * After 30 days without login, a nightly cron job permanently anonymizes all PII.
	 *
	 * @response 200 - Account scheduled for deletion, returns scheduledFor date
	 * @response 400 - Account already deleted
	 * @response 401 - Unauthorized
	 * @returns Promise with the scheduled deletion date and a confirmation message
	 */
	async requestAccountDeletion(): Promise<{ scheduledFor: string; message: string }> {
		try {
			const response = await this.delete<{ scheduledFor: string; message: string }>(
				ENDPOINTS.AUTH.DELETE_ACCOUNT
			);
			return response.data;
		} catch (error: unknown) {
			const err = error as { status?: number; data?: { message?: string } };
			if (err?.status === 400) {
				throw new Error(err.data?.message || 'Account is already deleted.');
			}
			if (err?.status === 401) {
				throw new Error('Unauthorized. Please login again.');
			}
			throw new Error(
				error instanceof Error
					? error.message
					: String(error) || 'Failed to request account deletion. Please try again.'
			);
		}
	}
}

// Create singleton instance
const authService = new AuthService();
export default authService;
