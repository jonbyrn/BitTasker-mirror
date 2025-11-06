/**
 * Local storage provider using IndexedDB
 */

import type { StorageProvider, MerkleTreeData, StorageResult } from '../types/storage.js';

/**
 * Local storage provider using IndexedDB
 */
export class LocalStorageProvider implements StorageProvider {
	private dbName: string;
	private storeName: string;
	private db: IDBDatabase | null = null;

	constructor(dbName: string = 'merkle-review-sdk', storeName: string = 'trees') {
		this.dbName = dbName;
		this.storeName = storeName;
	}

	/**
	 * Initialize IndexedDB database
	 */
	private async initDB(): Promise<IDBDatabase> {
		if (this.db) {
			return this.db;
		}

		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, 1);

			request.onerror = () => {
				reject(new Error('Failed to open IndexedDB'));
			};

			request.onsuccess = () => {
				this.db = request.result;
				resolve(request.result);
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					const store = db.createObjectStore(this.storeName, { keyPath: 'root' });
					store.createIndex('version', 'metadata.version', { unique: false });
					store.createIndex('builtAt', 'metadata.builtAt', { unique: false });
				}
			};
		});
	}

	/**
	 * Store Merkle tree data
	 */
	async storeTree(data: MerkleTreeData): Promise<StorageResult> {
		try {
			const db = await this.initDB();
			const transaction = db.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);

			// Store with root as key
			const request = store.put(data);

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					resolve({
						success: true,
						location: data.root
					});
				};

				request.onerror = () => {
					reject(new Error('Failed to store tree data'));
				};
			});
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Retrieve Merkle tree data by root or version
	 */
	async retrieveTree(rootOrVersion: string): Promise<MerkleTreeData | null> {
		try {
			const db = await this.initDB();
			const transaction = db.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);

			// Try root first
			let request = store.get(rootOrVersion);

			const result = await new Promise<MerkleTreeData | null>((resolve, reject) => {
				request.onsuccess = () => {
					const data = request.result;
					if (data) {
						resolve(data as MerkleTreeData);
					} else {
						// Try version index
						const versionIndex = store.index('version');
						const versionRequest = versionIndex.get(rootOrVersion);
						versionRequest.onsuccess = () => {
							const versionData = versionRequest.result;
							resolve(versionData ? (versionData as MerkleTreeData) : null);
						};
						versionRequest.onerror = () => reject(new Error('Failed to query version'));
					}
				};

				request.onerror = () => reject(new Error('Failed to retrieve tree data'));
			});

			return result;
		} catch (error) {
			console.error('Failed to retrieve tree:', error);
			return null;
		}
	}

	/**
	 * Get latest tree version
	 */
	async getLatestVersion(): Promise<string | null> {
		try {
			const db = await this.initDB();
			const transaction = db.transaction([this.storeName], 'readonly');
			const store = transaction.objectStore(this.storeName);
			const index = store.index('builtAt');

			// Get all records and find latest
			const request = index.openCursor(null, 'prev'); // prev = descending order

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					const cursor = request.result;
					if (cursor) {
						const data = cursor.value as MerkleTreeData;
						resolve(data.metadata.version);
					} else {
						resolve(null);
					}
				};

				request.onerror = () => reject(new Error('Failed to get latest version'));
			});
		} catch (error) {
			console.error('Failed to get latest version:', error);
			return null;
		}
	}

	/**
	 * Check if storage is available
	 */
	async isAvailable(): Promise<boolean> {
		try {
			if (typeof indexedDB === 'undefined') {
				return false;
			}

			// Try to open database
			await this.initDB();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Clear all stored trees
	 */
	async clear(): Promise<void> {
		try {
			const db = await this.initDB();
			const transaction = db.transaction([this.storeName], 'readwrite');
			const store = transaction.objectStore(this.storeName);
			await store.clear();
		} catch (error) {
			console.error('Failed to clear storage:', error);
		}
	}
}

