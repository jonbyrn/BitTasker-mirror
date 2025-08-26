import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirebaseWebConfig } from '$lib/utils/helpers/fcm';

/**
 * Firebase Email Service
 * Handles sending emails through Firebase Cloud Functions
 */
export class FirebaseEmailService {
	private functions: any = null;
	private isInitialized = false;

	constructor() {
		this.init();
	}

	private init() {
		try {
			const firebaseConfig = getFirebaseWebConfig();
			
			// Validate Firebase config
			if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
				console.error('Firebase configuration is incomplete');
				return;
			}

			const app = initializeApp(firebaseConfig);
			this.functions = getFunctions(app);

			// Connect to local emulator in development
			if (import.meta.env.DEV) {
				console.log('🔧 Connecting to Firebase Functions emulator...');
				connectFunctionsEmulator(this.functions, 'localhost', 5001);
			}

			this.isInitialized = true;
		} catch (error) {
			console.error('Failed to initialize Firebase Email Service:', error);
		}
	}

	/**
	 * Send recovery verification email
	 * @param email User's email address
	 * @param verificationToken Verification token for the email
	 * @returns Promise that resolves when email is sent
	 */
	async sendRecoveryVerificationEmail(email: string, verificationToken: string): Promise<void> {
		if (!this.isInitialized || !this.functions) {
			throw new Error('Firebase Email Service not initialized');
		}

		try {
			console.log('📧 Sending recovery verification email via Firebase...');
			const sendEmail = httpsCallable(this.functions, 'sendRecoveryVerificationEmail');
			const result = await sendEmail({ email, verificationToken });
			console.log('✅ Email sent successfully:', result);
		} catch (error: any) {
			console.error('❌ Failed to send recovery verification email:', error);
			throw new Error('Failed to send verification email. Please try again.');
		}
	}

	/**
	 * Send general verification email
	 * @param email User's email address
	 * @param verificationToken Verification token for the email
	 * @param emailType Type of verification email (e.g., 'signup', 'recovery')
	 * @returns Promise that resolves when email is sent
	 */
	async sendVerificationEmail(email: string, verificationToken: string, emailType: string = 'recovery'): Promise<void> {
		if (!this.isInitialized || !this.functions) {
			throw new Error('Firebase Email Service not initialized');
		}

		try {
			console.log('📧 Sending verification email via Firebase...');
			const sendEmail = httpsCallable(this.functions, 'sendVerificationEmail');
			const result = await sendEmail({ email, verificationToken, emailType });
			console.log('✅ Email sent successfully:', result);
		} catch (error: any) {
			console.error('❌ Failed to send verification email:', error);
			throw new Error('Failed to send verification email. Please try again.');
		}
	}

	/**
	 * Check if the service is properly initialized
	 * @returns boolean indicating if the service is ready
	 */
	isReady(): boolean {
		return this.isInitialized && !!this.functions;
	}
}

// Create singleton instance
const firebaseEmailService = new FirebaseEmailService();
export default firebaseEmailService;
