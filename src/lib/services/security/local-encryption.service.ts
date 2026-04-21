import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import * as cryptoHelper from '$lib/utils/helpers/crypto';

/**
 * LocalEncryptionService
 *
 * Provides a secure, persistent encryption layer for local data that needs to be
 * accessible in the background without biometric prompts.
 *
 * It uses a persistent "App Secret" generated on the first use and stored in
 * the device's native Preferences storage.
 */
export class LocalEncryptionService {
	private static instance: LocalEncryptionService;
	private appSecret: CryptoKey | null = null;
	private initializationPromise: Promise<void> | null = null;

	private constructor() {}

	public static getInstance(): LocalEncryptionService {
		if (!LocalEncryptionService.instance) {
			LocalEncryptionService.instance = new LocalEncryptionService();
		}
		return LocalEncryptionService.instance;
	}

	/**
	 * Initializes the service by loading or generating the master app secret.
	 */
	public async initialize(): Promise<void> {
		if (this.initializationPromise) return this.initializationPromise;

		this.initializationPromise = (async () => {
			if (this.appSecret) return;

			try {
				const result = await Preferences.get({
					key: StorageKeys.LOCAL_ENCRYPTION_SECRET
				});

				const storedKey = result?.value;

				if (storedKey) {
					try {
						this.appSecret = await cryptoHelper.importKey(storedKey);
					} catch (error) {
						console.error('Failed to import local encryption key, regenerating...', error);
						await this.regenerateKey();
					}
				} else {
					await this.regenerateKey();
				}
			} catch (error) {
				console.error(
					'Failed to access native storage for encryption, falling back to session-only key:',
					error
				);
				this.appSecret = await cryptoHelper.generateRandomKey();
			}
		})();

		return this.initializationPromise;
	}

	/**
	 * Resets the service instance (primarily for testing).
	 */
	public reset(): void {
		this.appSecret = null;
		this.initializationPromise = null;
	}

	private async regenerateKey(): Promise<void> {
		const key = await cryptoHelper.generateRandomKey();
		const exported = await cryptoHelper.exportKey(key);
		await Preferences.set({
			key: StorageKeys.LOCAL_ENCRYPTION_SECRET,
			value: exported
		});
		this.appSecret = key;
	}

	/**
	 * Encrypts data using the persistent app secret.
	 */
	public async encrypt(data: string): Promise<string> {
		await this.initialize();
		if (!this.appSecret) throw new Error('Encryption service not initialized');

		const encrypted = await cryptoHelper.encrypt(data, this.appSecret);
		// Combine data, iv, and authTag into a single string for storage
		return JSON.stringify(encrypted);
	}

	/**
	 * Decrypts data using the persistent app secret.
	 */
	public async decrypt(encryptedJson: string): Promise<string> {
		await this.initialize();
		if (!this.appSecret) throw new Error('Encryption service not initialized');

		try {
			const encryptedData = JSON.parse(encryptedJson);
			return await cryptoHelper.decrypt(encryptedData, this.appSecret);
		} catch (error) {
			console.error('Decryption failed:', error);
			throw new Error('Failed to decrypt local data');
		}
	}

	/**
	 * Derives a context-specific key (sub-key) from the master app secret.
	 * Useful for specific features like Push Notifications.
	 */
	public async getSubKey(context: string, saltString: string): Promise<CryptoKey> {
		await this.initialize();
		if (!this.appSecret) throw new Error('Encryption service not initialized');

		const salt = new TextEncoder().encode(saltString);
		return await cryptoHelper.deriveContextKey(this.appSecret, context, salt);
	}

	/**
	 * Utility to encrypt with a sub-key.
	 */
	public async encryptWithSubKey(data: string, context: string, salt: string): Promise<string> {
		const subKey = await this.getSubKey(context, salt);
		const encrypted = await cryptoHelper.encrypt(data, subKey);
		return JSON.stringify(encrypted);
	}

	/**
	 * Utility to decrypt with a sub-key.
	 */
	public async decryptWithSubKey(
		encryptedJson: string,
		context: string,
		salt: string
	): Promise<string> {
		const subKey = await this.getSubKey(context, salt);
		const encryptedData = JSON.parse(encryptedJson);
		return await cryptoHelper.decrypt(encryptedData, subKey);
	}
}

export const localEncryptionService = LocalEncryptionService.getInstance();
