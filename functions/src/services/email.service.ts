/* eslint-disable @typescript-eslint/no-explicit-any */
import * as nodemailer from 'nodemailer';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Use environment variables for Firebase Functions v2 compatibility
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    
    console.log('📧 Initializing SMTP transporter with:', {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass ? '***' : 'NOT_SET'
    });
    
    // Configure transporter according to Nodemailer best practices
    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false, // Use STARTTLS for port 587
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // Simplified configuration for better reliability
      connectionTimeout: 30000, // 30 seconds
      greetingTimeout: 15000,   // 15 seconds
      socketTimeout: 300000,    // 5 minutes
    });
  }

  /**
   * Verify SMTP configuration
   * @returns Promise<boolean> indicating if configuration is valid
   */
  async verifyConfiguration(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log('✅ SMTP configuration verified successfully');
      return true;
    } catch (error) {
      console.error('❌ SMTP configuration verification failed:', error);
      return false;
    }
  }

  async sendRecoveryVerificationEmail(
    email: string,
    verificationToken: string,
    userName?: string
  ): Promise<void> {
    const clientUrl = process.env.CLIENT_URL || 'https://dev.bittasker.com';
    const verificationUrl = `${clientUrl}/auth/recover/verify-email?token=${verificationToken}`;
    
    console.log('📧 Preparing to send recovery email to:', email);
    console.log('📧 Verification URL:', verificationUrl);
    
    // For local development, just log the email instead of sending
    if (process.env.FUNCTIONS_EMULATOR) {
      console.log('📧 LOCAL DEVELOPMENT - Email would be sent:');
      console.log('To:', email);
      console.log('Subject: Verify Your Email - BitTasker Account Recovery');
      console.log('Verification URL:', verificationUrl);
      return;
    }
    
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Verify Your Email - BitTasker Account Recovery',
      html: this.generateRecoveryEmailHtml(verificationUrl, userName),
      text: this.generateRecoveryEmailText(verificationUrl, userName),
    };

    try {
      console.log('📧 Sending recovery verification email to:', email);
      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', result.messageId);
    } catch (error: any) {
      console.error('❌ Failed to send email:', error);
      throw new Error(`Email sending failed: ${error?.message || 'Unknown error'}`);
    }
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
