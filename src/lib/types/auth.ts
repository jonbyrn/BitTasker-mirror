export interface EncryptedNostrKey {
	accessTokenEncrypted: {
		data: string;
		iv: string;
	};
	recoveryEncrypted: {
		data: string;
		iv: string;
	};
	salt: string;
}

export interface Credentials {
	username: string;
	password: string;
	server: string;
}

export interface EncryptedKeyData {
	data: string;
	iv: string;
}

export interface NostrRegistrationData {
	name?: string;
	email: string;
	publicKey: string;
	encryptedPrivateKey: string;
	iv: string;
	salt: string;
	authTag: string;
	iterations: number;
	googleToken?: string; // Optional Google token for social registration
	useBiometrics: boolean; // Added for biometric authentication
}

export interface NostrKeyData {
	id: number;
	userId: number;
	publicKey: string;
	encryptedPrivateKey: string;
	iv: string;
	salt: string;
	authTag: string;
	iterations: number;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	deleted: boolean;
}

export interface UserAuthData {
	id: number;
	email: string;
	name: string;
	password: string | null;
	isEmailVerified: boolean;
	lastLoginAt: string;
	status: 'ACTIVE' | 'INACTIVE';
	userRole: 'CLIENT' | 'ADMIN';
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	deleted: boolean;
	nostrKey: NostrKeyData;
}

export interface AuthResponse {
    user: UserAuthData;
    access_token: string;
}

export interface LoginResponse {
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    authTag: string;
    token: string;
}

// Generic API response wrapper
export interface ApiResponse<T> {
    data: T;
    message: string;
    credential?: string; // For Google auth responses
    access_token?: string; // For authentication responses
    token?: string; // For authentication responses
}