import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import {
	FIREBASE_WEB_API_KEY,
	FIREBASE_WEB_AUTH_DOMAIN,
	FIREBASE_WEB_PROJECT_ID,
	FIREBASE_WEB_STORAGE_BUCKET,
	FIREBASE_WEB_MESSAGING_SENDER_ID,
	FIREBASE_WEB_APP_ID
} from '$env/static/private';

export const GET: RequestHandler = async () => {
	/* // Debug: Log specific values (safely)
	console.log('🔍 Server: FIREBASE_WEB_API_KEY exists:', !!FIREBASE_WEB_API_KEY);
	console.log('🔍 Server: FIREBASE_WEB_PROJECT_ID:', FIREBASE_WEB_PROJECT_ID || 'NOT_FOUND');

	const firebaseConfig = {
		apiKey: FIREBASE_WEB_API_KEY,
		authDomain: FIREBASE_WEB_AUTH_DOMAIN,
		projectId: FIREBASE_WEB_PROJECT_ID,
		storageBucket: FIREBASE_WEB_STORAGE_BUCKET,
		messagingSenderId: FIREBASE_WEB_MESSAGING_SENDER_ID,
		appId: FIREBASE_WEB_APP_ID
	};

	

	console.log('🔍 Server: Generated config:', JSON.stringify(firebaseConfig, null, 2));

	// Validate that all required config values are present
	const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
	const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);
	
	if (missingFields.length > 0) {
		console.error('❌ Server: Missing Firebase config fields:', missingFields);
		console.error('❌ Server: Config object:', firebaseConfig);
		return json({ 
			error: 'Firebase configuration incomplete', 
			missingFields,
			config: firebaseConfig
		}, { status: 500 });
	} */


	const firebaseConfig = {
		apiKey: "AIzaSyCPvSA-3VNTbj0CeXsVPrr9R3RrnO6N1KY",
		authDomain: "bittasker-928ff.firebaseapp.com",
		projectId: "bittasker-928ff",
		storageBucket: "bittasker-928ff.firebasestorage.app",
		messagingSenderId: "256658163015",
		appId: "1:256658163015:web:b220610251f027bf597862"
	};

	return json(firebaseConfig, {
		headers: {
			'Cache-Control': 'public, max-age=0', // 3600 - Cache for 1 hour
			'Content-Type': 'application/json'
		}
	});
}; 