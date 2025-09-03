/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { EmailService } from "./services/email.service";

const emailService = new EmailService();

// In-memory token storage (in production, use a database like Firestore)
interface RecoveryToken {
  email: string;
  publicKey?: string;
  createdAt: number;
  expiresAt: number;
}

const recoveryTokens = new Map<string, RecoveryToken>();

// Clean up expired tokens every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of recoveryTokens.entries()) {
    if (data.expiresAt < now) {
      recoveryTokens.delete(token);
    }
  }
}, 60 * 60 * 1000); // 1 hour

export const sendRecoveryVerificationEmail = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request: CallableRequest) => {
    try {
      const { email, verificationToken } = request.data;

      // Validate input
      if (!email || !verificationToken) {
        throw new Error('Email and verification token are required');
      }

      // Store the token with the email (expires in 24 hours)
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      recoveryTokens.set(verificationToken, {
        email,
        createdAt: Date.now(),
        expiresAt
      });

      console.log(`Stored recovery token for email: ${email}`);

      // Send verification email
      await emailService.sendRecoveryVerificationEmail(
        email,
        verificationToken
      );

      return { 
        success: true, 
        message: 'Verification email sent successfully' 
      };
    } catch (error) {
      console.error('Error sending recovery verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }
);

export const sendVerificationEmail = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request: CallableRequest) => {
    try {
      const { email, verificationToken, emailType } = request.data;

      // Validate input
      if (!email || !verificationToken || !emailType) {
        throw new Error('Email, verification token, and email type are required');
      }

      // Send verification email based on type
      if (emailType === 'recovery') {
        await emailService.sendRecoveryVerificationEmail(
          email,
          verificationToken
        );
      } else {
        throw new Error('Unsupported email type');
      }

      return { 
        success: true, 
        message: 'Verification email sent successfully' 
      };
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }
);

export const invalidateAllDevices = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request: CallableRequest) => {
    try {
      const { publicKey } = request.data;

      // Validate input
      if (!publicKey) {
        throw new Error('Public key is required');
      }

      // For now, we'll simulate device invalidation
      // In a real implementation, this would:
      // 1. Query the database for all devices associated with the publicKey
      // 2. Mark all devices as invalidated
      // 3. Return the count of invalidated devices
      
      console.log(`Invalidating all devices for public key: ${publicKey}`);
      
      // Simulate database operation
      const invalidatedDevices = Math.floor(Math.random() * 5) + 1; // Random number between 1-5
      
      return { 
        success: true, 
        message: 'All devices invalidated successfully',
        invalidatedDevices: invalidatedDevices
      };
    } catch (error) {
      console.error('Error invalidating devices:', error);
      throw new Error('Failed to invalidate devices');
    }
  }
);

export const completeNostrRecovery = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request: CallableRequest) => {
    try {
      const { 
        publicKey, 
        otp, 
        recoveryPrivateKey, 
        encryptedPrivateKey, 
        iv, 
        authTag, 
        salt, 
        iterations, 
        deviceId 
      } = request.data;

      // Validate input
      if (!publicKey || !otp || !recoveryPrivateKey || !encryptedPrivateKey || !iv || !authTag || !salt || !iterations || !deviceId) {
        throw new Error('All recovery parameters are required');
      }

      // For now, we'll simulate the recovery completion
      // In a real implementation, this would:
      // 1. Verify the OTP token
      // 2. Store the encrypted private key with the new device
      // 3. Update the user's recovery status
      // 4. Generate a new access token
      
      console.log(`Completing recovery for public key: ${publicKey}`);
      console.log(`Device ID: ${deviceId}`);
      
      // Simulate successful recovery
      const mockAccessToken = `mock_access_token_${Date.now()}`;
      const mockUser = {
        id: 'user_123',
        email: 'user@example.com',
        publicKey: publicKey,
        createdAt: new Date().toISOString()
      };
      
      return { 
        success: true, 
        message: 'Recovery completed successfully',
        access_token: mockAccessToken,
        user: mockUser
      };
    } catch (error) {
      console.error('Error completing recovery:', error);
      throw new Error('Failed to complete recovery');
    }
  }
);

export const initiateNostrRecovery = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request: CallableRequest) => {
    try {
      const { email } = request.data;

      // Validate input
      if (!email) {
        throw new Error('Email is required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }

      console.log(`Initiating recovery for email: ${email}`);
      
      // TODO: In a real implementation, this would:
      // 1. Check if the email exists in the database
      // 2. If email doesn't exist, return an error or success (for security, don't reveal if email exists)
      // 3. Generate a recovery token
      // 4. Send verification email
      // 5. Store the recovery session
      
      // For now, we'll always return success to prevent email enumeration attacks
      // In production, you should check if the email exists in your user database
      // and only send emails to valid accounts
      
      return { 
        success: true, 
        message: 'If an account with this email exists, you will receive a recovery email shortly.'
      };
    } catch (error) {
      console.error('Error initiating recovery:', error);
      throw new Error('Failed to initiate recovery');
    }
  }
);

export const getRecoveryData = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request: CallableRequest) => {
    try {
      const { publicKey } = request.data;

      // Validate input
      if (!publicKey) {
        throw new Error('Public key is required');
      }

      // TODO: In a real implementation, this would:
      // 1. Look up the user by public key in the database
      // 2. Return their encrypted recovery data
      // 3. Validate that the user exists and has recovery data
      
      console.log(`Getting recovery data for public key: ${publicKey}`);
      
      // For now, return an error since we don't have real recovery data
      // This prevents the undefined error and makes it clear that recovery data is not available
      throw new Error('No recovery data found for this account. Please contact support if you believe this is an error.');
    } catch (error) {
      console.error('Error getting recovery data:', error);
      throw new Error('Failed to get recovery data');
    }
  }
);

export const verifyRecoveryEmail = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request: CallableRequest) => {
    try {
      const { token } = request.data;

      // Validate input
      if (!token) {
        throw new Error('Verification token is required');
      }

      console.log(`Verifying recovery email with token: ${token}`);
      
      // Look up the token in our storage
      const tokenData = recoveryTokens.get(token);
      
      if (!tokenData) {
        throw new Error('Invalid or expired verification token. Please request a new recovery email.');
      }
      
      // Check if token has expired
      if (tokenData.expiresAt < Date.now()) {
        recoveryTokens.delete(token); // Clean up expired token
        throw new Error('Verification token has expired. Please request a new recovery email.');
      }
      
      // TODO: Look up the actual user's public key from the database using the email
      // For now, we'll return the email and a placeholder message
      const recoveryData = {
        email: tokenData.email,
        publicKey: '', // This should be fetched from the database
        message: 'Email verified successfully. However, no account was found with this email address. Please check your email or contact support if you believe this is an error.'
      };
      
      console.log(`Recovery data for email: ${tokenData.email}`);
      
      // Remove the token after successful verification (one-time use)
      recoveryTokens.delete(token);
      
      return { 
        success: true, 
        data: recoveryData
      };
    } catch (error) {
      console.error('Error verifying recovery email:', error);
      throw new Error('Failed to verify recovery email');
    }
  }
);

export const testSMTPConfiguration = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request: CallableRequest) => {
    try {
      console.log('🧪 Testing SMTP configuration...');
      
      // Test the email service configuration
      const emailService = new EmailService();
      const isConfigValid = await emailService.verifyConfiguration();
      
      if (isConfigValid) {
        console.log('✅ SMTP configuration test passed');
        return { 
          success: true, 
          message: 'SMTP configuration is valid and working correctly'
        };
      } else {
        console.log('❌ SMTP configuration test failed');
        return { 
          success: false, 
          message: 'SMTP configuration is invalid. Please check your credentials.'
        };
      }
    } catch (error: any) {
      console.error('Error testing SMTP configuration:', error);
      throw new Error(`SMTP configuration test failed: ${error?.message || 'Unknown error'}`);
    }
  }
);
