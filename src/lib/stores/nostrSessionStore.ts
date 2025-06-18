import { writable, derived, get } from 'svelte/store';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import type { Credentials } from '$lib/types/auth';
import { nip19 } from 'nostr-tools';

export interface KeyPair {
	nsec: Uint8Array;
	npub: string;
	privateKey: string;
	publicKey: string;
}

interface NostrSession {
	keyPair: KeyPair | null;
	publicKey: string | null;
	npub: string | null;
	isInitialized: boolean;
	lastAccess: number;
	sessionId: string;
}

interface SessionOptions {
	autoExpire?: boolean;
	expireAfterMinutes?: number;
	persistSession?: boolean;
}

const SESSION_STORAGE_KEY = 'nostr_session_data';
const DEFAULT_SESSION_EXPIRE_MINUTES = 30;

// Private store for session data
const sessionStore = writable<NostrSession>({
	keyPair: null,
	publicKey: null,
	npub: null,
	isInitialized: false,
	lastAccess: 0,
	sessionId: ''
});

// Cached biometric data for session persistence
let cachedBiometricData: Credentials | null = null;

/**
 * Convert raw key pair to our standard format
 */
function formatKeyPair(rawKeyPair: { nsec: Uint8Array; npub: string }): KeyPair {
	// Convert nsec to hex private key
	const privateKey = Array.from(rawKeyPair.nsec, (byte) => byte.toString(16).padStart(2, '0')).join(
		''
	);

	// Get public key from npub
	const publicKey = nip19.decode(rawKeyPair.npub).data as string;

	return {
		nsec: rawKeyPair.nsec,
		npub: rawKeyPair.npub,
		privateKey,
		publicKey
	};
}

/**
 * Get biometric data from app store or prompt user
 */
async function getBiometricData(): Promise<Credentials | null> {
	const { appStore } = await import('$lib/stores/app.store');
	const currentState = get(appStore);

	if (currentState.biometricData) {
		return currentState.biometricData;
	}

	const { checkBiometricAvailability, getBiometricData: getBioData } = await import(
		'$lib/utils/helpers/biometrics'
	);

	const isBiometricAvailable = await checkBiometricAvailability();

	if (isBiometricAvailable) {
		const biometricData = await getBioData();
		appStore.update((state) => ({ ...state, biometricData }));
		return biometricData;
	} else {
		const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
		const biometricData = await getWebBiometricData();
		appStore.update((state) => ({ ...state, biometricData }));
		return biometricData;
	}
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
	return `nostr_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save session data to localStorage (encrypted session info only, not keys)
 */
function saveSessionToStorage(session: NostrSession, options: SessionOptions): void {
	if (!options.persistSession) return;

	const sessionData = {
		sessionId: session.sessionId,
		publicKey: session.publicKey,
		npub: session.npub,
		lastAccess: session.lastAccess,
		expireAfter: options.expireAfterMinutes || DEFAULT_SESSION_EXPIRE_MINUTES
	};

	try {
		localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
	} catch (error) {
		console.warn('Failed to save session to storage:', error);
	}
}

/**
 * Load session data from localStorage
 */
function loadSessionFromStorage(): {
	sessionId: string;
	publicKey: string;
	npub: string;
	lastAccess: number;
	expireAfter: number;
} | null {
	try {
		const data = localStorage.getItem(SESSION_STORAGE_KEY);
		if (!data) return null;

		const sessionData = JSON.parse(data);
		const now = Date.now();
		const expireTime = sessionData.lastAccess + sessionData.expireAfter * 60 * 1000;

		// Check if session has expired
		if (now > expireTime) {
			localStorage.removeItem(SESSION_STORAGE_KEY);
			return null;
		}

		return sessionData;
	} catch (error) {
		console.warn('Failed to load session from storage:', error);
		localStorage.removeItem(SESSION_STORAGE_KEY);
		return null;
	}
}

/**
 * Initialize a new Nostr session with biometric authentication
 */
async function initializeSession(options: SessionOptions = {}): Promise<boolean> {
	try {
		// Check for existing session first
		const existingSession = loadSessionFromStorage();
		if (existingSession && cachedBiometricData) {
			// Try to restore session with cached biometric data
			const rawKeyPair = await getNostrKeyPair();
			if (rawKeyPair) {
				const keyPair = formatKeyPair(rawKeyPair);
				const session: NostrSession = {
					keyPair,
					publicKey: keyPair.publicKey,
					npub: keyPair.npub,
					isInitialized: true,
					lastAccess: Date.now(),
					sessionId: existingSession.sessionId
				};

				sessionStore.set(session);
				saveSessionToStorage(session, options);
				return true;
			}
		}

		// Get fresh biometric data and create new session
		const biometricData = await getBiometricData();
		if (!biometricData) {
			throw new Error('Biometric authentication failed');
		}

		// Cache biometric data for session duration
		cachedBiometricData = biometricData;

		// Get key pair
		const rawKeyPair = await getNostrKeyPair();
		if (!rawKeyPair) {
			throw new Error('Failed to retrieve key pair');
		}

		const keyPair = formatKeyPair(rawKeyPair);

		// Create new session
		const session: NostrSession = {
			keyPair,
			publicKey: keyPair.publicKey,
			npub: keyPair.npub,
			isInitialized: true,
			lastAccess: Date.now(),
			sessionId: generateSessionId()
		};

		sessionStore.set(session);
		saveSessionToStorage(session, options);

		// Setup auto-expiration if enabled
		if (options.autoExpire) {
			setupAutoExpiration(options.expireAfterMinutes || DEFAULT_SESSION_EXPIRE_MINUTES);
		}

		return true;
	} catch (error) {
		console.error('Failed to initialize Nostr session:', error);
		return false;
	}
}

/**
 * Refresh the current session (update last access time)
 */
function refreshSession(options: SessionOptions = {}): void {
	const currentSession = get(sessionStore);
	if (!currentSession.isInitialized) return;

	const updatedSession = {
		...currentSession,
		lastAccess: Date.now()
	};

	sessionStore.set(updatedSession);
	saveSessionToStorage(updatedSession, options);
}

/**
 * Clear the current session and cached data
 */
function clearSession(): void {
	// Clear cached biometric data
	cachedBiometricData = null;

	// Clear session store
	sessionStore.set({
		keyPair: null,
		publicKey: null,
		npub: null,
		isInitialized: false,
		lastAccess: 0,
		sessionId: ''
	});

	// Clear localStorage
	try {
		localStorage.removeItem(SESSION_STORAGE_KEY);
	} catch (error) {
		console.warn('Failed to clear session storage:', error);
	}
}

/**
 * Setup automatic session expiration
 */
function setupAutoExpiration(expireAfterMinutes: number): void {
	const expireAfterMs = expireAfterMinutes * 60 * 1000;

	setTimeout(() => {
		const currentSession = get(sessionStore);
		if (currentSession.isInitialized) {
			const timeSinceLastAccess = Date.now() - currentSession.lastAccess;
			if (timeSinceLastAccess >= expireAfterMs) {
				clearSession();
			}
		}
	}, expireAfterMs);
}

/**
 * Get the current key pair (with automatic session refresh)
 */
async function getSessionKeyPair(options: SessionOptions = {}): Promise<KeyPair | null> {
	const currentSession = get(sessionStore);

	// Initialize session if not already done
	if (!currentSession.isInitialized) {
		const initialized = await initializeSession(options);
		if (!initialized) return null;
	}

	// Refresh session on access
	refreshSession(options);

	return get(sessionStore).keyPair;
}

/**
 * Get the current public key
 */
function getSessionPublicKey(): string | null {
	const currentSession = get(sessionStore);
	return currentSession.isInitialized ? currentSession.publicKey : null;
}

/**
 * Get the current npub
 */
function getSessionNpub(): string | null {
	const currentSession = get(sessionStore);
	return currentSession.isInitialized ? currentSession.npub : null;
}

/**
 * Check if session is initialized and valid
 */
function isSessionValid(): boolean {
	const currentSession = get(sessionStore);
	return currentSession.isInitialized && currentSession.keyPair !== null;
}

// Derived stores for reactive access
export const isSessionInitialized = derived(sessionStore, ($session) => $session.isInitialized);
export const sessionPublicKey = derived(sessionStore, ($session) => $session.publicKey);
export const sessionNpub = derived(sessionStore, ($session) => $session.npub);

// Public API
export const nostrSessionStore = {
	// Store subscription
	subscribe: sessionStore.subscribe,

	// Session management
	initialize: initializeSession,
	clear: clearSession,
	refresh: refreshSession,

	// Key access
	getKeyPair: getSessionKeyPair,
	getPublicKey: getSessionPublicKey,
	getNpub: getSessionNpub,
	isValid: isSessionValid,

	// Derived stores
	isInitialized: isSessionInitialized,
	publicKey: sessionPublicKey,
	npub: sessionNpub
};

// Auto-initialize session on module load with default options
if (typeof window !== 'undefined') {
	// Only auto-initialize in browser environment
	setTimeout(() => {
		const savedSession = loadSessionFromStorage();
		if (savedSession) {
			// Try to restore session silently
			initializeSession({ persistSession: true, autoExpire: true }).catch(console.warn);
		}
	}, 100);
}

export default nostrSessionStore;
