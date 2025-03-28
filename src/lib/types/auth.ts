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
	email?: string;
	publicKey: string;
	encryptedPrivateKey: string;
	iv: string;
	salt: string;
	authTag: string;
	iterations: number;
	googleToken?: string; // Optional Google token for social registration
	authMethod?: 'passkey';
	password?: string;
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

export interface UserData {
	id?: number;
	email: string;
	name: string;
	npub: string;
	password?: string | null;
	onboardingComplete?: boolean;
	isEmailVerified?: boolean;
	lastLoginAt?: string;
	status?: 'ACTIVE' | 'INACTIVE';
	userRole?: 'CLIENT' | 'ADMIN';
	createdAt?: Date;
	updatedAt?: Date;
	deletedAt?: Date;
	deleted?: boolean;
	nostrKey?: NostrKeyData;
}

export interface AuthResponse {
	user: UserData;
	access_token: string;
}

export interface LoginResponse {
	publicKey: string;
	encryptedPrivateKey: string;
	iv: string;
	authTag: string;
	token: string;
}

export interface EncryptedData {
	data: string;
	iv: string;
	authTag: string;
}

export interface BiometricVerifyOptions {
	reason: string;
	title: string;
	subtitle: string;
	description: string;
	maxAttempts: number;
	useFallback: boolean;
}

export interface EncryptionData {
	key: string;
	iv: string;
	authTag: string;
	data: string;
	salt: string;
}

export interface AuthState {
	isAuthenticated: boolean;
	isLoading: boolean;
	error: string | null;
}
