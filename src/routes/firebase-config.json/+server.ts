import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	const firebaseConfig = {
		apiKey: import.meta.env.VITE_FIREBASE_WEB_API_KEY,
		authDomain: import.meta.env.VITE_FIREBASE_WEB_AUTH_DOMAIN,
		projectId: import.meta.env.VITE_FIREBASE_WEB_PROJECT_ID,
		storageBucket: import.meta.env.VITE_FIREBASE_WEB_STORAGE_BUCKET,
		messagingSenderId: import.meta.env.VITE_FIREBASE_WEB_MESSAGING_SENDER_ID,
		appId: import.meta.env.VITE_FIREBASE_WEB_APP_ID
	};

	// Validate that all required config values are present
	const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
	const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);
	
	if (missingFields.length > 0) {
		console.error('❌ Server: Missing Firebase config fields:', missingFields);
		return json({ 
			error: 'Firebase configuration incomplete', 
			missingFields,
			config: firebaseConfig
		}, { status: 500 });
	}

	return json(firebaseConfig, {
		headers: {
			'Cache-Control': 'public, max-age=0', // 3600 - Cache for 1 hour
			'Content-Type': 'application/json'
		}
	});
}; 