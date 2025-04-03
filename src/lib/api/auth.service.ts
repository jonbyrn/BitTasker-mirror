import type { NostrRegistrationData, UserData } from '$lib/types/auth';
import { BaseApiService } from './apiService';
import { ENDPOINTS } from './endpoints';
import type { OnboardingRequest, OnboardingResponse } from './types';

/**
 * Authentication Service
 * Handles user authentication, registration, and related operations
 */
export class AuthService extends BaseApiService {
  /**
   * Login with Nostr
   * @param pubkey User's public key
   * @param challenge Login challenge
   * @param signature Signed login challenge
   * @returns Promise with the login response
   * @throws {Error} 400 - No account associated with Nostr key or missing data
   * @throws {Error} 401 - Invalid signature or unauthorized access
   * @throws {Error} 500 - Internal server error
   */
  async loginWithNostr(
    pubkey: string,
    challenge: string,
    signature: string
  ): Promise<{ access_token: string; user: UserData }> {
    try {
      const response = await this.post<{ access_token: string; user: UserData }>(
        ENDPOINTS.AUTH.NOSTR_LOGIN,
        { pubkey, challenge, signature }
      );
      return response.data;
    } catch (error: any) {
      if (error?.status === 400) {
        throw new Error(
          error.data?.message ||
          'No account associated with this Nostr key. Please register first.'
        );
      }
      if (error?.status === 401) {
        throw new Error('Invalid signature or unauthorized access');
      }
      if (error?.status === 500) {
        throw new Error('Internal server error. Please try again later.');
      }

      throw new Error('Login failed. Please try again.');
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

      const response = await this.post<{ publicKey: string; user: UserData }>(
        ENDPOINTS.AUTH.REGISTER_NOSTR,
        registrationData
      );
      return response.data;
    } catch (error: any) {
      if (error?.status === 409) {
        throw new Error('Email already registered');
      } else if (error?.status === 400) {
        throw new Error('Invalid registration data');
      } else if (error?.status === 422) {
        throw new Error('Invalid encryption format');
      } else if (error?.status === 500) {
        throw new Error('Server error occurred during registration');
      } else if (error.message) {
        throw error;
      } else {
        throw new Error('Failed to register user');
      }
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
    const response = await this.post<{ publicKey: string; encryptedPrivateKey: string; iv: string }>(
      ENDPOINTS.AUTH.ENCRYPTED_KEY,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
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
    const response = await this.post<{ isRegistered: boolean; hasEmail: boolean; onboardingComplete: boolean }>(
      ENDPOINTS.AUTH.CHECK_REGISTRATION,
      { publicKey }
    );
    return response.data;
  }

  /**
   * Register a new passkey device for biometric authentication
   * @param publicKey User's Nostr public key
   * @param deviceId Unique device identifier
   * @param deviceName Device name
   * @returns Promise with passkey registration response
   */
  async registerPasskeyDevice(
    publicKey: string,
    deviceId: string,
    deviceName: string
  ): Promise<{
    id: number;
    userId: number;
    deviceId: string;
    deviceName: string;
    createdAt: string;
    lastUsed: string;
    revokedAt: string;
  }> {
    const response = await this.post(
      ENDPOINTS.AUTH.REGISTER_PASSKEY,
      { publicKey, deviceId, deviceName }
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
   * Log out the current user
   */
  async logout(): Promise<void> {
    await this.post(ENDPOINTS.AUTH.LOGOUT);
  }
}

// Create singleton instance
const authService = new AuthService();
export default authService;
