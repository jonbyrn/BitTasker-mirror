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
