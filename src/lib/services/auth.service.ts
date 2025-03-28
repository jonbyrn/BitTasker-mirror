import type { NostrRegistrationData, UserData } from '$lib/types/auth';
import createAxiosInstance from '$lib/api/axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PATH = '/api/v1/auth';

const authApi = createAxiosInstance({
	baseURL: API_URL
});

/**
 * Login with Nostr
 * @param pubKey User's public key
 * @param challenge Login challenge
 * @param signature Signed login challenge
 * @returns Promise with the login response
 * @throws {Error} 400 - No account associated with Nostr key or missing data
 * @throws {Error} 401 - Invalid signature or unauthorized access
 * @throws {Error} 500 - Internal server error
 */
export const loginWithNostr = async (
	pubkey: string,
	challenge: string,
	signature: string
): Promise<{ access_token: string; user: UserData }> => {
	try {
		const response = await authApi.post(`${API_PATH}/nostr/login`, {
			pubkey,
			challenge,
			signature
		});
		return response.data;
	} catch (error: any) {
		if (error?.response?.status === 400) {
			throw new Error(
				error.response.data.message ||
					'No account associated with this Nostr key. Please register first.'
			);
		}
		if (error?.response?.status === 401) {
			throw new Error('Invalid signature or unauthorized access');
		}
		if (error?.response?.status === 500) {
			throw new Error('Internal server error. Please try again later.');
		}

		throw new Error('Login failed. Please try again.');
	}
};

/**
 * Authenticate a user with email and password
 * @param email User email
 * @param password User password
 * @returns Promise with the authentication response
 * @throws 400 - Bad Request or missing required data
 * @throws 401 - Unauthorized - Invalid email or password
 */
export const loginWithCredentials = async (
	email: string,
	password: string
): Promise<{ access_token: string; user: UserData }> => {
	const response = await authApi.post(`${API_PATH}/login`, { email, password });
	return response.data;
};

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
export const registerWithNostr = async (
	registrationData: NostrRegistrationData
): Promise<{ publicKey: string; user: UserData }> => {
	try {
		// Validate required fields
		if (!registrationData.publicKey || !registrationData.encryptedPrivateKey) {
			throw new Error('Missing required registration data');
		}

		const response = await authApi.post(`${API_PATH}/register/nostr`, registrationData);
		return response.data;
	} catch (error: any) {
		if (error?.response?.status === 409) {
			throw new Error('Email already registered');
		} else if (error?.response?.status === 400) {
			throw new Error('Invalid registration data');
		} else if (error?.response?.status === 422) {
			throw new Error('Invalid encryption format');
		} else if (error?.response?.status === 500) {
			throw new Error('Server error occurred during registration');
		} else if (error.message) {
			throw error;
		} else {
			throw new Error('Failed to register user');
		}
	}
};

/**
 * Authenticate a user with client-generated Google keys
 * @param credential User authentication data with Google keys
 * @returns Promise with the authentication response
 * @throws 400 - Bad Request or missing required encryption data
 * @throws 409 - Email already in use
 */
export const authenticateWithGoogle = async (
	credential: string
): Promise<{ access_token: string; user: UserData }> => {
	const response = await authApi.post(`${API_PATH}/google/login`, { access_token: credential });
	return response.data;
};

/**
 * Authenticate a user with client-generated Facebook keys
 * @param credential User authentication data with Facebook keys
 * @returns Promise with the authentication response
 * @throws 400 - Bad Request or missing required encryption data
 * @throws 409 - Email already in use
 */
export const authenticateWithFacebook = async (
	credential: string
): Promise<{ access_token: string; user: UserData }> => {
	const response = await authApi.post(`${API_PATH}/facebook/login`, { access_token: credential });
	return response.data;
};

/**
 * Get encrypted Nostr key for a user using access token
 * @param accessToken Access token from user login
 * @returns Promise with encrypted Nostr key data
 */
export async function getEncryptedKeysWithToken(
	accessToken: string
): Promise<{ publicKey: string; encryptedPrivateKey: string; iv: string }> {
	const authApiWithAccessToken = createAxiosInstance({
		baseURL: API_URL,
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	const response = await authApiWithAccessToken.get(`${API_PATH}/encrypted-key`);
	return response.data;
}

/**
 * Get login challenge for a user
 * @returns Promise with login challenge data
 */
export async function getLoginChallenge(): Promise<{ challenge: string; message: string }> {
	const response = await authApi.get(`${API_PATH}/nostr/challenge`);
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
export async function checkRegistrationStatus(
	publicKey: string
): Promise<{ isRegistered: boolean; hasEmail: boolean; onboardingComplete: boolean }> {
	const response = await authApi.post(`${API_PATH}/check-registration`, { publicKey });
	return response.data;
}

/**
 * Register a new passkey device for biometric authentication
 * @param publicKey User's Nostr public key
 * @param deviceId Unique device identifier
 * @param deviceName Device name
 * @returns Promise with passkey registration response
 */
export async function registerPasskeyDevice(
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
	const response = await authApi.post(`${API_PATH}/register/passkey-device`, {
		publicKey,
		deviceId,
		deviceName
	});
	return response.data;
}

/**
 * Login with biometric authentication
 * @param publicKey User's Nostr public key
 * @param deviceId Unique device identifier
 * @returns Promise with authentication response
 */
export async function loginWithPasskey(
	publicKey: string,
	deviceId: string
): Promise<{ user: UserData; access_token: string }> {
	const response = await authApi.post(`${API_PATH}/login/passkey`, { publicKey, deviceId });
	return response.data;
}

/**
 * Revoke a passkey device for biometric authentication
 * @param publicKey User's Nostr public key
 * @param deviceId Unique device identifier
 * @returns Promise with revocation response
 */
export async function revokePasskeyDevice(publicKey: string, deviceId: string): Promise<void> {
	await authApi.post(`${API_PATH}/revoke-device`, { publicKey, deviceId });
}
