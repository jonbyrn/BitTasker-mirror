import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../email.service';
import firebaseEmailService from '../firebase-email.service';

// Mock the Firebase email service
vi.mock('../firebase-email.service', () => ({
	default: {
		isReady: vi.fn(),
		sendRecoveryVerificationEmail: vi.fn(),
		sendVerificationEmail: vi.fn()
	}
}));

// Mock the Firebase config helper
vi.mock('$lib/utils/helpers/fcm', () => ({
	getFirebaseWebConfig: vi.fn(() => ({
		apiKey: 'test-api-key',
		projectId: 'test-project-id'
	}))
}));

describe('EmailService', () => {
	let emailService: EmailService;

	beforeEach(() => {
		vi.clearAllMocks();
		emailService = new EmailService();
	});

	describe('isAvailable', () => {
		it('should return true when Firebase is available', () => {
			vi.mocked(firebaseEmailService.isReady).mockReturnValue(true);
			expect(emailService.isAvailable()).toBe(true);
		});

		it('should return false when Firebase is not available', () => {
			vi.mocked(firebaseEmailService.isReady).mockReturnValue(false);
			expect(emailService.isAvailable()).toBe(false);
		});
	});

	describe('sendRecoveryVerificationEmail', () => {
		const testData = {
			email: 'test@example.com',
			verificationToken: 'test-token',
			emailType: 'recovery' as const,
			expiryHours: 24
		};

		it('should use Firebase when available', async () => {
			vi.mocked(firebaseEmailService.isReady).mockReturnValue(true);
			vi.mocked(firebaseEmailService.sendRecoveryVerificationEmail).mockResolvedValue();

			await emailService.sendRecoveryVerificationEmail(testData);

			expect(firebaseEmailService.sendRecoveryVerificationEmail).toHaveBeenCalledWith(
				testData.email,
				testData.verificationToken
			);
		});

		it('should throw error when Firebase is not available', async () => {
			vi.mocked(firebaseEmailService.isReady).mockReturnValue(false);

			await expect(emailService.sendRecoveryVerificationEmail(testData))
				.rejects
				.toThrow('Email service not available. Please ensure Firebase is properly configured.');
		});
	});

	describe('sendVerificationEmail', () => {
		const testData = {
			email: 'test@example.com',
			verificationToken: 'test-token',
			emailType: 'signup' as const,
			expiryHours: 24
		};

		it('should use Firebase when available', async () => {
			vi.mocked(firebaseEmailService.isReady).mockReturnValue(true);
			vi.mocked(firebaseEmailService.sendVerificationEmail).mockResolvedValue();

			await emailService.sendVerificationEmail(testData);

			expect(firebaseEmailService.sendVerificationEmail).toHaveBeenCalledWith(
				testData.email,
				testData.verificationToken,
				testData.emailType
			);
		});

		it('should throw error when Firebase is not available', async () => {
			vi.mocked(firebaseEmailService.isReady).mockReturnValue(false);

			await expect(emailService.sendVerificationEmail(testData))
				.rejects
				.toThrow('Email service not available. Please ensure Firebase is properly configured.');
		});
	});
});
