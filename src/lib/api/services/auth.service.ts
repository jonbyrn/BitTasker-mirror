import type {
	AccountRecoveryData,
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
import { BaseApiService, ApiError } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import { normalizeToError } from '$lib/utils/helpers/normalizeError';

const getErrorStatus = (error: unknown): number | undefined => {
	if (typeof error !== 'object' || error === null) return undefined;
	const candidate = error as { status?: unknown; response?: { status?: unknown } };
	if (typeof candidate.status === 'number') return candidate.status;
	if (typeof candidate.response?.status === 'number') return candidate.response.status;
	return undefined;
};

const getErrorMessage = (error: unknown): string | undefined => {
	if (typeof error !== 'object' || error === null) return undefined;
	const candidate = error as {
		message?: unknown;
		data?: { message?: unknown };
		response?: { data?: { message?: unknown } };
	};
	if (typeof candidate.data?.message === 'string' && candidate.data.message.trim()) {
		return candidate.data.message;
	}
	if (
		typeof candidate.response?.data?.message === 'string' &&
		candidate.response.data.message.trim()
	) {
		return candidate.response.data.message;
	}
	if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
	return undefined;
};

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
	async register(
		registrationData: RegistrationData
	): Promise<{ publicKey: string; user: UserData; access_token: string }> {
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
				error: { message: string } | null;
			}>(ENDPOINTS.AUTH.REGISTER, registrationData);

			if (response?.data?.error) {
				throw new Error(response.data.error?.message);
			}

			return response.data;
		} catch (error: unknown) {
			throw normalizeToError(error, 'Registration failed. Please try again.');
		}
	}

	/**
	 * Get login challenge for a user
	 * @returns Promise with login challenge data
	 */
	async getChallenge(): Promise<{ challenge: string; message: string }> {
		const response = await this.get<{ challenge: string; message: string }>(
			ENDPOINTS.AUTH.NOSTR_CHALLENGE
		);
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
		isLegacy?: boolean;
		encryptedData: EncryptedData;
	}> {
		const response = await this.post<{
			user: UserData;
			access_token: string;
			isLegacy?: boolean;
			encryptedData: EncryptedData;
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
	async nostrLogin(
		data: NostrLoginArgs
	): Promise<{ access_token: string; user: UserData; isNewUser: boolean; isMigrated: boolean }> {
		try {
			const response = await this.post<{
				access_token: string;
				user: UserData;
				isNewUser: boolean;
				isMigrated: boolean;
			}>(ENDPOINTS.AUTH.NOSTR_LOGIN, data);
			return response.data;
		} catch (error: unknown) {
			const status = getErrorStatus(error);
			if (status === 400) {
				throw new Error(
					getErrorMessage(error) ||
						'No account associated with this Nostr key. Please register first.'
				);
			}
			if (status === 401) {
				throw new Error('Invalid signature or unauthorized access');
			}
			if (status === 500) {
				throw new Error('Internal server error. Please try again later.');
			}
			throw normalizeToError(error, 'Login failed. Please try again.');
		}
	}

	/**
	 * Get encrypted data with nostr signed event
	 * @param data Encrypted nostr data arguments
	 * @returns Promise with encrypted data
	 */
	async encryptedNostrData(
		data: EncryptedNostrDataArgs
	): Promise<{ encryptedData: EncryptedData | null }> {
		try {
			const response = await this.post<{ encryptedData: EncryptedData }>(
				ENDPOINTS.AUTH.ENCRYPTED_NOSTR_DATA,
				data
			);
			return response.data;
		} catch (error: unknown) {
			const status = getErrorStatus(error);
			if (status === 400) {
				return { encryptedData: null };
			}
			if (status === 500) {
				throw new Error('Internal server error. Please try again later.');
			}
			throw normalizeToError(error, 'Failed to encrypt Nostr data. Please try again.');
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
	async completeNostrRecovery(
		data: NostrRecoveryCompleteData
	): Promise<{ access_token: string; user: UserData }> {
		const response = await this.post(ENDPOINTS.AUTH.NOSTR_RECOVERY_COMPLETE, data);
		return response.data;
	}

	/**
	 * Setup account recovery password
	 * @param data Account recovery data
	 * @returns Promise with recovery response
	 */
	async setupRecovery(data: AccountRecoveryData): Promise<{
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
			const status = getErrorStatus(error);
			if (status === 400) {
				throw new Error(getErrorMessage(error) || 'Invalid token');
			}
			if (status === 500) {
				throw new Error('Verification service error. Please try again later.');
			}
			throw normalizeToError(error, 'Turnstile verification failed. Please try again.');
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
		} catch (error: unknown) {
			const status = getErrorStatus(error);
			if (status === 401) {
				if (error instanceof ApiError) throw error;
				throw new ApiError(getErrorMessage(error) || 'Unauthorized. Please login again.', 401);
			}
			throw normalizeToError(error, 'Failed to check onboarding status. Please try again.');
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
			throw normalizeToError(error, 'Failed to check username availability. Please try again.');
		}
	}
}

// Create singleton instance
const authService = new AuthService();
export default authService;
