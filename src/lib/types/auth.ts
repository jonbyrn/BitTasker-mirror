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
	name: string;
	email: string;
	publicKey: string;
	encryptedPrivateKey: string;
	iv: string;
	salt: string;
	authTag: string;
	iterations: number;
	googleToken?: string; // Optional Google token for social registration
}

export interface ApiResponse<T> {
	data: T;
	message: string;
	credential?: string; // For Google auth responses
}