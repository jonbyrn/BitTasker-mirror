import firebaseEmailService from './firebase-email.service';
import { getFirebaseWebConfig } from '$lib/utils/helpers/fcm';

export interface EmailVerificationData {
	email: string;
	verificationToken: string;
	emailType: 'recovery' | 'signup' | 'password-reset';
	userName?: string;
	expiryHours?: number;
}

export interface EmailTemplate {
	subject: string;
	htmlBody: string;
	textBody: string;
}

/**
 * Email Service
 * Handles sending various types of emails including verification emails
 */
export class EmailService {
	private isFirebaseAvailable = false;

	constructor() {
		this.checkFirebaseAvailability();
	}

	private checkFirebaseAvailability() {
		try {
			const config = getFirebaseWebConfig();
			this.isFirebaseAvailable = !!(config.apiKey && config.projectId);
		} catch (error) {
			console.warn('Firebase not available for email service:', error);
			this.isFirebaseAvailable = false;
		}
	}

	/**
	 * Send verification email for account recovery
	 * @param data Email verification data
	 * @returns Promise that resolves when email is sent
	 */
	async sendRecoveryVerificationEmail(data: EmailVerificationData): Promise<void> {
		if (this.isFirebaseAvailable && firebaseEmailService.isReady()) {
			// Use Firebase Cloud Functions
			await firebaseEmailService.sendRecoveryVerificationEmail(data.email, data.verificationToken);
		} else {
			// Fallback to direct email sending via API
			await this.sendVerificationEmailViaAPI(data);
		}
	}

	/**
	 * Send general verification email
	 * @param data Email verification data
	 * @returns Promise that resolves when email is sent
	 */
	async sendVerificationEmail(data: EmailVerificationData): Promise<void> {
		if (this.isFirebaseAvailable && firebaseEmailService.isReady()) {
			// Use Firebase Cloud Functions
			await firebaseEmailService.sendVerificationEmail(data.email, data.verificationToken, data.emailType);
		} else {
			// Fallback to direct email sending via API
			await this.sendVerificationEmailViaAPI(data);
		}
	}

	/**
	 * Fallback method to send verification email via API
	 * @param data Email verification data
	 * @returns Promise that resolves when email is sent
	 */
	private async sendVerificationEmailViaAPI(data: EmailVerificationData): Promise<void> {
		// This would call your backend API to send the email
		// For now, we'll throw an error if Firebase is not available
		throw new Error('Email service not available. Please ensure Firebase is properly configured.');
	}

	/**
	 * Generate verification email template
	 * @param data Email verification data
	 * @returns Email template with subject and body
	 */
	private generateVerificationEmailTemplate(data: EmailVerificationData): EmailTemplate {
		const baseUrl = import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com';
		const verificationUrl = `${baseUrl}/verify-email?token=${data.verificationToken}`;
		const expiryHours = data.expiryHours || 24;
		
		const subject = this.getEmailSubject(data.emailType);
		const htmlBody = this.getEmailHtmlBody(data, verificationUrl, expiryHours);
		const textBody = this.getEmailTextBody(data, verificationUrl, expiryHours);

		return { subject, htmlBody, textBody };
	}

	/**
	 * Get email subject based on type
	 * @param emailType Type of verification email
	 * @returns Email subject
	 */
	private getEmailSubject(emailType: string): string {
		switch (emailType) {
			case 'recovery':
				return 'Verify Your Email - BitTasker Account Recovery';
			case 'signup':
				return 'Welcome to BitTasker - Verify Your Email';
			case 'password-reset':
				return 'Reset Your Password - BitTasker';
			default:
				return 'Verify Your Email - BitTasker';
		}
	}

	/**
	 * Generate HTML email body
	 * @param data Email verification data
	 * @param verificationUrl Verification URL
	 * @param expiryHours Hours until token expires
	 * @returns HTML email body
	 */
	private getEmailHtmlBody(data: EmailVerificationData, verificationUrl: string, expiryHours: number): string {
		const userName = data.userName || 'there';
		
		return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Verify Your Email</title>
				<style>
					body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
					.container { max-width: 600px; margin: 0 auto; padding: 20px; }
					.header { text-align: center; margin-bottom: 30px; }
					.logo { font-size: 24px; font-weight: bold; color: #2563eb; }
					.button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
					.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; text-align: center; }
					.warning { background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0; }
				</style>
			</head>
			<body>
				<div class="container">
					<div class="header">
						<div class="logo">BitTasker</div>
					</div>
					
					<h2>Hello ${userName},</h2>
					
					<p>Please verify your email address to complete your account recovery process.</p>
					
					<div style="text-align: center;">
						<a href="${verificationUrl}" class="button">Verify Email Address</a>
					</div>
					
					<div class="warning">
						<strong>Important:</strong> This verification link will expire in ${expiryHours} hours for security reasons.
					</div>
					
					<p>If you didn't request this verification, you can safely ignore this email.</p>
					
					<p>If the button above doesn't work, you can copy and paste this link into your browser:</p>
					<p style="word-break: break-all; color: #2563eb;">${verificationUrl}</p>
					
					<div class="footer">
						<p>This email was sent by BitTasker. Please do not reply to this email.</p>
						<p>&copy; ${new Date().getFullYear()} BitTasker. All rights reserved.</p>
					</div>
				</div>
			</body>
			</html>
		`;
	}

	/**
	 * Generate text email body
	 * @param data Email verification data
	 * @param verificationUrl Verification URL
	 * @param expiryHours Hours until token expires
	 * @returns Text email body
	 */
	private getEmailTextBody(data: EmailVerificationData, verificationUrl: string, expiryHours: number): string {
		const userName = data.userName || 'there';
		
		return `
Hello ${userName},

Please verify your email address to complete your account recovery process.

Click the following link to verify your email:
${verificationUrl}

Important: This verification link will expire in ${expiryHours} hours for security reasons.

If you didn't request this verification, you can safely ignore this email.

If the link above doesn't work, you can copy and paste it into your browser.

Best regards,
The BitTasker Team

---
This email was sent by BitTasker. Please do not reply to this email.
© ${new Date().getFullYear()} BitTasker. All rights reserved.
		`.trim();
	}

	/**
	 * Check if the email service is available
	 * @returns boolean indicating if the service is ready
	 */
	isAvailable(): boolean {
		return this.isFirebaseAvailable || firebaseEmailService.isReady();
	}
}

// Create singleton instance
const emailService = new EmailService();
export default emailService;
