import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Get Firebase config from environment variables
	const config = {
		apiKey: process.env.VITE_FIREBASE_WEB_API_KEY || import.meta.env.VITE_FIREBASE_WEB_API_KEY,
		authDomain: process.env.VITE_FIREBASE_WEB_AUTH_DOMAIN || import.meta.env.VITE_FIREBASE_WEB_AUTH_DOMAIN,
		projectId: process.env.VITE_FIREBASE_WEB_PROJECT_ID || import.meta.env.VITE_FIREBASE_WEB_PROJECT_ID,
		storageBucket: process.env.VITE_FIREBASE_WEB_STORAGE_BUCKET || import.meta.env.VITE_FIREBASE_WEB_STORAGE_BUCKET,
		messagingSenderId: process.env.VITE_FIREBASE_WEB_MESSAGING_SENDER_ID || import.meta.env.VITE_FIREBASE_WEB_MESSAGING_SENDER_ID,
		appId: process.env.VITE_FIREBASE_WEB_APP_ID || import.meta.env.VITE_FIREBASE_WEB_APP_ID
	};

	// Validate that we have the required config
	if (!config.apiKey || !config.projectId || !config.messagingSenderId) {
		console.error('Firebase configuration is incomplete. Please check your environment variables.');
		return json({ error: 'Firebase configuration not available' }, { status: 500 });
	}

	return json(config);
};
