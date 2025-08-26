# Firebase Cloud Functions Setup for Email Verification

This guide explains how to set up Firebase Cloud Functions to handle email verification for account recovery.

## Prerequisites

1. Firebase project with billing enabled (required for Cloud Functions)
2. Node.js 18+ installed
3. Firebase CLI installed: `npm install -g firebase-tools`

## Setup Steps

### 1. Initialize Firebase Functions

```bash
# Login to Firebase
firebase login

# Initialize Firebase in your project directory
firebase init functions

# Select your project and choose TypeScript
```

### 2. Install Dependencies

```bash
cd functions
npm install nodemailer @types/nodemailer
npm install firebase-admin
```

### 3. Configure Environment Variables

Create a `.env` file in the `functions` directory:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# App Configuration
CLIENT_URL=https://your-domain.com
```

### 4. Create Email Service

Create `functions/src/services/email.service.ts`:

```typescript
import * as nodemailer from 'nodemailer';
import * as functions from 'firebase-functions';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: functions.config().smtp.host,
      port: functions.config().smtp.port,
      secure: false,
      auth: {
        user: functions.config().smtp.user,
        pass: functions.config().smtp.pass,
      },
    });
  }

  async sendRecoveryVerificationEmail(
    email: string,
    verificationToken: string,
    userName?: string
  ): Promise<void> {
    const verificationUrl = `${functions.config().app.client_url}/auth/recover/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: functions.config().smtp.user,
      to: email,
      subject: 'Verify Your Email - BitTasker Account Recovery',
      html: this.generateRecoveryEmailHtml(verificationUrl, userName),
      text: this.generateRecoveryEmailText(verificationUrl, userName),
    };

    await this.transporter.sendMail(mailOptions);
  }

  private generateRecoveryEmailHtml(verificationUrl: string, userName?: string): string {
    const displayName = userName || 'there';
    
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
          
          <h2>Hello ${displayName},</h2>
          
          <p>Please verify your email address to complete your account recovery process.</p>
          
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          
          <div class="warning">
            <strong>Important:</strong> This verification link will expire in 24 hours for security reasons.
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

  private generateRecoveryEmailText(verificationUrl: string, userName?: string): string {
    const displayName = userName || 'there';
    
    return `
Hello ${displayName},

Please verify your email address to complete your account recovery process.

Click the following link to verify your email:
${verificationUrl}

Important: This verification link will expire in 24 hours for security reasons.

If you didn't request this verification, you can safely ignore this email.

If the link above doesn't work, you can copy and paste it into your browser.

Best regards,
The BitTasker Team

---
This email was sent by BitTasker. Please do not reply to this email.
© ${new Date().getFullYear()} BitTasker. All rights reserved.
    `.trim();
  }
}
```

### 5. Create Cloud Functions

Create `functions/src/index.ts`:

```typescript
import * as functions from 'firebase-functions';
import { EmailService } from './services/email.service';

const emailService = new EmailService();

export const sendRecoveryVerificationEmail = functions.https.onCall(
  async (data: { email: string; verificationToken: string }, context) => {
    try {
      // Validate input
      if (!data.email || !data.verificationToken) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Email and verification token are required'
        );
      }

      // Send verification email
      await emailService.sendRecoveryVerificationEmail(
        data.email,
        data.verificationToken
      );

      return { success: true, message: 'Verification email sent successfully' };
    } catch (error) {
      console.error('Error sending recovery verification email:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to send verification email'
      );
    }
  }
);

export const sendVerificationEmail = functions.https.onCall(
  async (data: { email: string; verificationToken: string; emailType: string }, context) => {
    try {
      // Validate input
      if (!data.email || !data.verificationToken || !data.emailType) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Email, verification token, and email type are required'
        );
      }

      // Send verification email based on type
      if (data.emailType === 'recovery') {
        await emailService.sendRecoveryVerificationEmail(
          data.email,
          data.verificationToken
        );
      } else {
        // Handle other email types
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Unsupported email type'
        );
      }

      return { success: true, message: 'Verification email sent successfully' };
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to send verification email'
      );
    }
  }
);
```

### 6. Configure Firebase Functions

Update `functions/package.json`:

```json
{
  "name": "functions",
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "serve": "npm run build && firebase emulators:start --only functions",
    "shell": "npm run build && firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "18"
  },
  "main": "lib/index.js",
  "dependencies": {
    "firebase-admin": "^11.8.0",
    "firebase-functions": "^4.3.1",
    "nodemailer": "^6.9.1"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.4.7",
    "typescript": "^4.9.0"
  },
  "private": true
}
```

### 7. Set Firebase Configuration

```bash
# Set SMTP configuration
firebase functions:config:set smtp.host="smtp.gmail.com"
firebase functions:config:set smtp.port="587"
firebase functions:config:set smtp.user="your-email@gmail.com"
firebase functions:config:set smtp.pass="your-app-password"

# Set app configuration
firebase functions:config:set app.client_url="https://your-domain.com"
```

### 8. Deploy Functions

```bash
# Build and deploy
npm run build
firebase deploy --only functions
```

## Security Considerations

1. **Rate Limiting**: Implement rate limiting to prevent abuse
2. **Token Expiration**: Set appropriate expiration times for verification tokens
3. **Input Validation**: Always validate email addresses and tokens
4. **Error Handling**: Don't expose sensitive information in error messages
5. **Logging**: Log email sending activities for monitoring

## Testing

Test the function locally:

```bash
# Start emulator
firebase emulators:start --only functions

# Test with curl
curl -X POST "http://localhost:5001/your-project/us-central1/sendRecoveryVerificationEmail" \
  -H "Content-Type: application/json" \
  -d '{"data": {"email": "test@example.com", "verificationToken": "test-token"}}'
```

## Troubleshooting

1. **Gmail Setup**: Use App Passwords instead of regular passwords
2. **Firebase Billing**: Ensure billing is enabled for Cloud Functions
3. **Environment Variables**: Verify all config values are set correctly
4. **Permissions**: Check Firebase project permissions and IAM roles

## Alternative: Using Firebase Extensions

If you prefer not to write custom functions, you can use Firebase Extensions:

```bash
# Install the Send Email extension
firebase ext:install firestore-send-email
```

This provides a pre-built solution for sending emails based on Firestore triggers.
