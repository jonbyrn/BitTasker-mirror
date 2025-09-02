/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onCall } from "firebase-functions/v2/https";
import { EmailService } from "./services/email.service";

const emailService = new EmailService();

export const sendRecoveryVerificationEmail = onCall(
  { 
    maxInstances: 10,
    region: "us-central1"
  },
  async (request) => {
    try {
      const { email, verificationToken } = request.data;

      // Validate input
      if (!email || !verificationToken) {
        throw new Error('Email and verification token are required');
      }

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
  async (request) => {
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
  async (request) => {
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
  async (request) => {
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
  async (request) => {
    try {
      const { email } = request.data;

      // Validate input
      if (!email) {
        throw new Error('Email is required');
      }

      // For now, we'll simulate the recovery initiation
      // In a real implementation, this would:
      // 1. Check if the email exists in the database
      // 2. Generate a recovery token
      // 3. Send verification email
      // 4. Store the recovery session
      
      console.log(`Initiating recovery for email: ${email}`);
      
      // Simulate successful initiation
      return { 
        success: true, 
        message: 'Recovery initiated successfully. Please check your email for verification link.'
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
  async (request) => {
    try {
      const { publicKey } = request.data;

      // Validate input
      if (!publicKey) {
        throw new Error('Public key is required');
      }

      // For now, we'll simulate getting recovery data
      // In a real implementation, this would:
      // 1. Verify the public key exists
      // 2. Return the user's recovery data
      // 3. Check if recovery is allowed
      
      console.log(`Getting recovery data for public key: ${publicKey}`);
      
      // Simulate recovery data
      const mockRecoveryData = {
        publicKey: publicKey,
        email: 'user@example.com',
        hasRecoveryPassword: true,
        message: 'Recovery data retrieved successfully'
      };
      
      return { 
        success: true, 
        data: mockRecoveryData
      };
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
  async (request) => {
    try {
      const { token } = request.data;

      // Validate input
      if (!token) {
        throw new Error('Verification token is required');
      }

      // For now, we'll simulate email verification
      // In a real implementation, this would:
      // 1. Verify the token is valid and not expired
      // 2. Get the user's public key from the token
      // 3. Return the user's recovery information
      
      console.log(`Verifying recovery email with token: ${token}`);
      
      // Simulate successful verification
      const mockRecoveryData = {
        email: 'user@example.com',
        publicKey: 'npub1example123456789',
        message: 'Email verified successfully. You can now proceed with recovery.'
      };
      
      return { 
        success: true, 
        data: mockRecoveryData
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
  async (request) => {
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
