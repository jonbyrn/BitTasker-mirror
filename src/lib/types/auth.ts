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
	email: string;
	name: string;
	publicKey: string;
	encryptedPrivateKey: string;
	iv: string;
	salt: string;
	authTag: string;
	iterations: number;
}

export interface ApiResponse<T> {
	data: T;
	status: number;
	message?: string;
}
