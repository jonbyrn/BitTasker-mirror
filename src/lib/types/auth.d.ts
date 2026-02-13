import type { NostrEvent } from "nostr-tools";

export interface Credentials {
	npub: string;
	deviceId: string;
	credentialId: string;
	deviceName: string;
	encryptedData: EncryptedData;
	exportedKey: string;
	isLegacyFormat: boolean;
}

export interface PasskeyLoginData {
	event: NostrEvent;
	deviceId: string;
	deviceName?: string;
	platform: 'mobile' | 'web';
}

export interface NostrLoginData {
	event: NostrEvent;
	challenge: string;
	deviceId: string;
	iterations?: number;
	authMethod?: 'passkey';
	masterKeyData?: EncryptedData;
	deviceName?: string;
	credentialId: string;
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
	keyDerivationMethod: "master-key" | null;
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

	userRole?: "USER";
	dob?: null;
	biddingAllowed?: false;
	mobileNumber?: null;
	verificationLevel?: "NONE";
	displayName?: "test4";
	username?: "test4";
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

export interface ApiUserProfile {
	id: number;
	name: string | null;
	email: string;
	dob: string | null;
	profilePicture: string | null;
	userRole: string;
	authMethods: Array<{
		id: number;
		userId: number;
		type: string;
		identifier: string;
		credentials: Record<string, any>; // TODO: Define the type for credentials
		isVerified: boolean;
		lastUsedAt: string;
		createdAt: string;
		updatedAt: string;
		providerDetails: any; // TODO: Define the type for provider details
	}>;
	client: {
		id: number;
		userId: number;
		tasksCompleted: number;
		tasksPosted: number;
		averageRating: number | null;
		level: number;
		experiencePoints: number;
		verificationLevel: string;
		createdAt: string;
		updatedAt: string;
	} | null;
	freelancer: {
		id: number;
		userId: number;
		professionalTitle: string | null;
		bio: string | null;
		promotionalVideo: string | null;
		yearsExperience: number | null;
		specialties: string[];
		standardRates: any; // TODO: Define the type for standard rates
		tasksCompleted: number;
		bidsSent: number;
		successRate: number | null;
		averageRating: number | null;
		level: number;
		experiencePoints: number;
		reputationScore: number;
		feeDiscount: number;
		monthlyActivityPoints: number;
		verificationLevel: string;
		identityVerified: boolean;
		createdAt: string;
		updatedAt: string;
	} | null;
	preferences: any; // TODO: Define the type for preferences
	location: {
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
	} | null;
	isEmailVerified: boolean;
	onboardingComplete: boolean;
	lastLoginAt: string;
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

export interface AccountRecoveryData {
	publicKey: string;
	recoveryData: EncryptedData;
	email?: string;
}

export interface NostrRecoveryCompleteData {
	publicKey: string;
	otp: string;
	recoveryData: Partial<EncryptedData>;
	encryptedMasterKeyData: EncryptedData;
	deviceId: string;
	deviceName?: string;
	platform: string;
	credentialId: string;
	revokeAll: boolean;
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


/********************** Master Key Encrypted Data types **********************/

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

export type MasterKeyRegistration = {
	authMethod?: string | null | undefined;
	deviceId?: string | null | undefined;
	email?: string | null | undefined;
	masterKeyData: EncryptedData;
	publicKey: string;
	username?: string | null | undefined;
	credentialId: string | null | undefined;
	deviceName?: string | null | undefined;
	platform: string | null | undefined;
};

export type MasterKeyMigration = {
	event: NostrEvent;
	oldCredentialId: string;
	newCredentialId: string;
	deviceId: string;
	masterKeyData: EncryptedData;
	platform: string;
	deviceName: string;
};