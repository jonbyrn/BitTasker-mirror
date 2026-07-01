import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Firebase configuration endpoint.
 *
 * NOTE: The VITE_ prefix is intentional - these values are meant to be PUBLIC.
 * Firebase web API keys are designed to be exposed in client-side code.
 * The key should be restricted in Firebase Console to only accept requests
 * from your authorized domains (HTTP referrer restriction).
 *
 * Do NOT use VITE_ prefix for private keys or secrets.
 */
export const GET: RequestHandler = async () => {
	// Get Firebase config from environment variables
	const apiKey = process.env.VITE_FIREBASE_WEB_API_KEY || import.meta.env.VITE_FIREBASE_WEB_API_KEY;
	const authDomain =
		process.env.VITE_FIREBASE_WEB_AUTH_DOMAIN || import.meta.env.VITE_FIREBASE_WEB_AUTH_DOMAIN;
	const projectId =
		process.env.VITE_FIREBASE_WEB_PROJECT_ID || import.meta.env.VITE_FIREBASE_WEB_PROJECT_ID;
	const storageBucket =
		process.env.VITE_FIREBASE_WEB_STORAGE_BUCKET ||
		import.meta.env.VITE_FIREBASE_WEB_STORAGE_BUCKET;
	const messagingSenderId =
		process.env.VITE_FIREBASE_WEB_MESSAGING_SENDER_ID ||
		import.meta.env.VITE_FIREBASE_WEB_MESSAGING_SENDER_ID;
	const appId = process.env.VITE_FIREBASE_WEB_APP_ID || import.meta.env.VITE_FIREBASE_WEB_APP_ID;

	// Validate that we have the required config
	if (!apiKey || !projectId || !messagingSenderId) {
		console.error('Firebase configuration is incomplete. Please check your environment variables.');
		return json({ error: 'Firebase configuration not available' }, { status: 500 });
	}

	// Validate API key doesn't look like a secret (basic heuristic check)
	// Firebase web API keys typically start with AIza and are ~39 chars
	if (apiKey.length < 30 || apiKey.includes('secret') || apiKey.includes('private')) {
		console.error(
			'Firebase API key appears to be a private key. Please use the public web API key.'
		);
		return json({ error: 'Invalid Firebase configuration' }, { status: 500 });
	}

	const config = {
		apiKey,
		authDomain,
		projectId,
		storageBucket,
		messagingSenderId,
		appId
	};

	return json(config);
};
