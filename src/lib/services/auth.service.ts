import type { NostrRegistrationData, ApiResponse } from '$lib/types/auth';
import createAxiosInstance from '$lib/api/axios';
import axios from 'axios';

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
 * @throws 400 - Bad Request or missing required data
 * @throws 401 - Unauthorized - Invalid email or signed challenge
 */
export const loginWithNostr = async (pubKey: string, challenge: string, signature: string): Promise<ApiResponse<any>> => {
    const response = await authApi.post(`${API_PATH}/nostr/login`, { pubkey: pubKey, challenge, signature });
    return response.data;
};

/**
 * Authenticate a user with email and password
 * @param email User email
 * @param password User password
 * @returns Promise with the authentication response
 * @throws 400 - Bad Request or missing required data
 * @throws 401 - Unauthorized - Invalid email or password
 */
export const loginWithCredentials = async (email: string, password: string): Promise<ApiResponse<any>> => {
    const response = await authApi.post(`${API_PATH}/login`, { email, password });
    return response.data;
};


/**
 * Register a new user with client-generated Nostr keys
 * @param registrationData User registration data with Nostr keys
 * @returns Promise with the registration response
 * @throws {Error} 400 - Bad Request or missing required encryption data
 * @throws {Error} 409 - Email already in use
 * @throws {Error} 422 - Invalid encryption data format
 * @throws {Error} 500 - Internal server error
 */
export const registerWithNostr = async (registrationData: NostrRegistrationData): Promise<ApiResponse<any>> => {
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
export const authenticateWithGoogle = async (credential: string): Promise<any> => {
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
export const authenticateWithFacebook = async (credential: string): Promise<ApiResponse<any>> => {
    const response = await authApi.post(`${API_PATH}/facebook/login`, { access_token: credential });
    return response.data;
};

/**
 * Get encrypted Nostr key for a user using access token
 * @param accessToken Access token from user login
 * @returns Promise with encrypted Nostr key data
 */
export async function getEncryptedKeysWithToken(accessToken: string): Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
}> {
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
    const response = await axios.get(`${API_PATH}/nostr/challenge`);
    return response.data;
}