import type { NostrEvent } from 'nostr-tools';

type ContextEncryption = {
	encrypted: CryptoEncryptedData;
	iterations: number;
	salt: string;
};

export type EncryptedData = {
	masterSalt: string;
	nostr: ContextEncryption;
	wallet: ContextEncryption;
};

export interface BiometricData {
	npub: string;
	exportedKey: string;
	encryptedData: EncryptedData;
	credentialId: string;
}

export interface Credentials {
	npub: string;
	challenge: string;
	credentialId: string;
	exportedKey: string;
	response: {
		authenticatorData: string;
		clientDataJSON: string;
		signature: string;
		userHandle?: string;
	};
	/** Present when the login assertion evaluated the PRF extension. */
	prfOutput?: ArrayBuffer | null;
}

export interface PasskeyLoginArgs {
	npub: string;
	challenge: string;
	credentialId: string;
	deviceId: string;
	deviceName: string;
	platform: string;
	response: {
		authenticatorData: string;
		clientDataJSON: string;
		signature: string;
		userHandle?: string;
	};
	appVersion: string;
	timezoneOffset?: number;
	lang?: string;
}

export interface NostrLoginArgs {
	event: NostrEvent;
	challenge: string;
	deviceId: string;
	authMethod: 'passkey' | 'nsec';
	encryptedData: EncryptedData;
	deviceName: string;
	credentialId?: string;
	passkeyPubkey?: string;
	clientDataJSON?: string;
	attestationObject?: string;
	platform: string;
	appVersion: string;
	timezoneOffset?: number;
	lang?: string;
}

export interface EncryptedNostrDataArgs {
	event: NostrEvent;
	deviceId: string;
	deviceName: string;
	platform: string;
	appVersion: string;
}

export interface PasskeyEncryptedDataArgs {
	npub: string;
	challenge: string;
	credentialId: string;
	response: {
		authenticatorData: string;
		clientDataJSON: string;
		signature: string;
		userHandle?: string;
	};
}

export interface PasskeyLoginData {
	event: NostrEvent;
	deviceId: string;
	deviceName?: string;
	platform: 'mobile' | 'web';
}

interface NostrKeyData {
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
	deviceId?: string;

	recoveryPrivateKey: null;
	masterKeyEncrypted: {
		nostr: ContextEncryption;
		wallet: ContextEncryption;
	};
	masterSalt: string;
	exportedMasterKey: string;
	keyDerivationMethod: 'master-key' | null;
	encryptedWalletMnemonic: string;
}

export interface UserData {
	id: number;
	email: string;
	name: string;
	npub: string;
	picture: string;

	// TODO: Refactor & check utility of these fields
	password?: string | null;
	onboardingComplete?: boolean;
	isEmailVerified?: boolean;
	lastLoginAt?: string;
	status?: 'ACTIVE' | 'INACTIVE';
	createdAt?: Date;
	updatedAt?: Date;
	deletedAt?: Date;
	deleted?: boolean;
	nostrKey?: NostrKeyData;

	userRole?: 'USER';
	dob?: null;
	biddingAllowed?: false;
	mobileNumber?: null;
	verificationLevel?: 'NONE';
	displayName?: string | null;
	username?: string | null;
	profilePictureId?: null;
	profilePictureUrl?: null;
}

export interface Location {
	id: number;
	userId: number;
	addressLine1: string | null;
	addressLine2: string | null;
	city: string;
	state: string;
	postalCode: string;
	country: string;
	latitude: number;
	longitude: number;
	createdAt: string;
	updatedAt: string;
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

export interface RecoveryData {
	credentialId: string;
	recoveryData: EncryptedData;
	email?: string;
}

export interface NostrRecoveryCompleteData {
	npub: string;
	otp: string;
	recoveryData: EncryptedData;
	encryptedData: EncryptedData;
	deviceId: string;
	deviceName?: string;
	platform: string;
	credentialId: string;
	challenge: string;
	passkeyPubkey: string;
	clientDataJSON: string;
	attestationObject: string;
	revokeAll: boolean;
	timezoneOffset?: number;
	lang?: string;
}

export interface NostrRecoveryData {
	nostr: ContextEncryption;
	wallet: ContextEncryption;
	masterSalt: string;
}

export interface CryptoEncryptedData {
	data: string;
	iv: string;
	authTag: string;
}

export type RegistrationData = {
	email?: string | null | undefined;
	username?: string | null | undefined;
	publicKey: string;
	encryptedData: EncryptedData;
	authMethod?: string | null | undefined;
	deviceId?: string | null | undefined;
	deviceName?: string | null | undefined;
	credentialId: string | null | undefined;
	platform: string | null | undefined;
	challenge: string;
	passkeyPubkey: string;
	clientDataJSON: string;
	attestationObject: string;
	appVersion: string;
	timezoneOffset?: number;
	lang?: string;
};
