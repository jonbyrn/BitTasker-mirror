import type {
	AccountRecoveryData,
	NostrLoginData,
	NostrRecoveryCompleteData,
	NostrRecoveryData,
	NostrRegistrationData,
	UserData
} from '$lib/types/auth';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type { OnboardingRequest, OnboardingResponse } from '../types';
import emailService from './email.service';

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
	 * Authenticate a user with email and password
	 * @param email User email
	 * @param password User password
	 * @returns Promise with the authentication response
	 * @throws 400 - Bad Request or missing required data
	 * @throws 401 - Unauthorized - Invalid email or password
	 */
	async loginWithCredentials(
		email: string,
		password: string
	): Promise<{ access_token: string; user: UserData }> {
		const response = await this.post<{ access_token: string; user: UserData }>(
			ENDPOINTS.AUTH.LOGIN,
			{ email, password }
		);
		return response.data;
	}

	/**
	 * Register a new user with client-generated Nostr keys
	 * @param email User email (optional)
	 * @param password User password (optional)
	 * @param authMethod Authentication method (passkey)
	 * @param publicKey User's Nostr public key
	 * @param encryptedPrivateKey User's Nostr private key
	 * @param iv Initialization vector
	 * @param salt Salting data
	 * @param authTag Authentication tag
	 * @param iterations Number of iterations
	 * @returns Promise with the registration response
	 * @throws {Error} 400 - Bad Request or missing required encryption data
	 * @throws {Error} 409 - Email already in use
	 * @throws {Error} 422 - Invalid encryption data format
	 * @throws {Error} 500 - Internal server error
	 */
	async registerWithNostr(
		registrationData: NostrRegistrationData
	): Promise<{ publicKey: string; user: UserData }> {
		try {
			// Validate required fields
			if (!registrationData.publicKey || !registrationData.encryptedPrivateKey) {
				throw new Error('Missing required registration data');
			}

			const response = await this.post<{ publicKey: string; user: UserData; error: any }>(
				ENDPOINTS.AUTH.REGISTER_NOSTR,
				registrationData
			);

			if (response?.data?.error) {
				throw new Error(response.data.error?.message);
			}

			return response.data;
		} catch (error: any) {
			console.log('error', error);
			throw new Error(error);
		}
	}

	/**
	 * Authenticate a user with client-generated Google keys
	 * @param credential User authentication data with Google keys
	 * @returns Promise with the authentication response
	 * @throws 400 - Bad Request or missing required encryption data
	 * @throws 409 - Email already in use
	 */
	async authenticateWithGoogle(
		credential: string
	): Promise<{ access_token: string; user: UserData }> {
		const response = await this.post<{ access_token: string; user: UserData }>(
			ENDPOINTS.AUTH.GOOGLE_LOGIN,
			{ access_token: credential }
		);
		return response.data;
	}

	/**
	 * Authenticate a user with client-generated Facebook keys
	 * @param credential User authentication data with Facebook keys
	 * @returns Promise with the authentication response
	 * @throws 400 - Bad Request or missing required encryption data
	 * @throws 409 - Email already in use
	 */
	async authenticateWithFacebook(
		credential: string
	): Promise<{ access_token: string; user: UserData }> {
		const response = await this.post<{ access_token: string; user: UserData }>(
			ENDPOINTS.AUTH.FACEBOOK_LOGIN,
			{ access_token: credential }
		);
		return response.data;
	}

	/**
	 * Get encrypted Nostr key for a user using access token
	 * @param accessToken Access token from user login
	 * @returns Promise with encrypted Nostr key data
	 */
	async getEncryptedKeysWithToken(
		accessToken: string
	): Promise<{ publicKey: string; encryptedPrivateKey: string; iv: string }> {
		// Create an instance with authorization headers
		const response = await this.post<{
			publicKey: string;
			encryptedPrivateKey: string;
			iv: string;
		}>(ENDPOINTS.AUTH.ENCRYPTED_KEY, {}, { headers: { Authorization: `Bearer ${accessToken}` } });
		return response.data;
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
	 * Check registration status for a user
	 * @param publicKey User's Nostr public key
	 * @returns Promise with registration status data
	 * @throws 400 - Bad Request or missing required encryption data
	 * @throws 404 - User not found
	 * @throws 500 - Internal Server Error
	 */
	async checkRegistrationStatus(
		publicKey: string
	): Promise<{ isRegistered: boolean; hasEmail: boolean; onboardingComplete: boolean }> {
		try {
			const response = await this.post<{
				isRegistered: boolean;
				hasEmail: boolean;
				onboardingComplete: boolean;
			}>(ENDPOINTS.AUTH.CHECK_REGISTRATION, { publicKey });
			return response.data;
		} catch (error: any) {
			throw new Error(error);
		}
	}

	/**
	 * Register a new passkey device for biometric authentication
	 * @param publicKey User's Nostr public key
	 * @param deviceId Unique device identifier
	 * @param deviceName Device name
	 * @param credentialId Credential ID used for WebAuthn passkey
	 * @returns Promise with passkey registration response
	 */
	async registerPasskeyDevice(
		publicKey: string,
		deviceId: string,
		deviceName: string,
		credentialId?: string
	): Promise<{
		id: number;
		userId: number;
		deviceId: string;
		deviceName: string;
		createdAt: string;
		lastUsed: string;
		revokedAt: string;
		credentialId: string;
	}> {
		try {
			const data = {
				publicKey,
				deviceId,
				deviceName,
				credentialId
			};

			if (!credentialId) delete data.credentialId;

			const response = await this.post(ENDPOINTS.AUTH.REGISTER_PASSKEY, data);
			return response.data;
		} catch (error: any) {
			throw new Error(error);
		}
	}

	/**
	 * Get encrypted key using passkey credential id
	 * @param publicKey User's Nostr public key
	 * @param deviceId Unique device identifier
	 * @param credentialId Credential ID used for WebAuthn passkey
	 * @returns Promise with encrypted key data
	 */
	async getEncryptedKey(
		publicKey: string,
		deviceId: string,
		credentialId: string
	): Promise<{ encryptedPrivateKey: string; iv: string; authTag: string; iterations: number; salt: string }> {
		const response = await this.get(
			ENDPOINTS.AUTH.ENCRYPTED_KEY + `/${encodeURIComponent(publicKey)}?deviceId=${encodeURIComponent(deviceId)}&credentialId=${encodeURIComponent(credentialId)}`
		);
		return response.data;
	}

	/**
	 * Login with biometric authentication
	 * @param publicKey User's Nostr public key
	 * @param deviceId Unique device identifier
	 * @returns Promise with authentication response
	 */
	async loginWithPasskey(
		publicKey: string,
		deviceId: string
	): Promise<{ user: UserData; access_token: string }> {
		const response = await this.post<{ user: UserData; access_token: string }>(
			ENDPOINTS.AUTH.PASSKEY_LOGIN,
			{ publicKey, deviceId }
		);
		return response.data;
	}

	/**
	 * Revoke a passkey device for biometric authentication
	 * @param publicKey User's Nostr public key
	 * @param deviceId Unique device identifier
	 * @returns Promise with revocation response
	 */
	async revokePasskeyDevice(publicKey: string, deviceId: string): Promise<void> {
		await this.post(ENDPOINTS.AUTH.REVOKE_DEVICE, { publicKey, deviceId });
	}

	/**
	 * Complete user onboarding process
	 *
	 * @param data User onboarding data
	 * @returns User data after onboarding
	 */
	async completeOnboarding(data: OnboardingRequest): Promise<OnboardingResponse> {
		const response = await this.post<OnboardingResponse>(ENDPOINTS.AUTH.ONBOARDING, data);
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
		try {
			// First, call the backend API to initiate recovery and get verification token
			const response = await this.post<{ verificationToken: string; message: string }>(
				ENDPOINTS.AUTH.NOSTR_RECOVERY_INITIATE, 
				{ email }
			);

			// If we get a verification token, send the verification email
			if (response.data.verificationToken) {
				await emailService.sendRecoveryVerificationEmail({
					email,
					verificationToken: response.data.verificationToken,
					emailType: 'recovery',
					expiryHours: 24
				});
			}
		} catch (error: any) {
			// If the backend doesn't support verification tokens yet, fall back to the old behavior
			if (error?.status === 400 && error?.data?.message?.includes('verificationToken')) {
				// Backend doesn't support verification tokens, just call the original endpoint
				await this.post(ENDPOINTS.AUTH.NOSTR_RECOVERY_INITIATE, { email });
			} else {
				throw error;
			}
		}
	}

	/**
	 * Get nostr recovery data
	 * @param npub User's Nostr public key
	 * @response 200 - Recovery data retrieved successfully
	 * @response 404 - No recovery data found
	 * @returns Promise with recovery data
	 */
	async getNostrRecoveryData(npub: string): Promise<NostrRecoveryData> {
		const response = await this.get(ENDPOINTS.AUTH.NOSTR_RECOVERY_DATA(npub));
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
	async completeNostrRecovery(data: NostrRecoveryCompleteData): Promise<void> {
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
	 * Verify recovery email and get recovery data
	 * @param token Verification token
	 * @returns Promise with recovery data
	 */
	async verifyRecoveryEmail(token: string): Promise<{ email: string; publicKey: string; message: string }> {
		const response = await this.post<{ email: string; publicKey: string; message: string }>(
			ENDPOINTS.AUTH.RECOVERY_EMAIL_VERIFICATION,
			{ token }
		);
		return response.data;
	}
}

// Create singleton instance
const authService = new AuthService();
export default authService;
