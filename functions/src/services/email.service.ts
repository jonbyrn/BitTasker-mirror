import * as nodemailer from 'nodemailer';
import * as functions from 'firebase-functions';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // For local development, use a test SMTP service
    // For production, configure with your actual SMTP settings
    this.transporter = nodemailer.createTransport({
      host: functions.config().smtp?.host || 'smtp.mailtrap.io',
      port: functions.config().smtp?.port || 2525,
      secure: false,
      auth: {
        user: functions.config().smtp?.user || 'test',
        pass: functions.config().smtp?.pass || 'test',
      },
    });
  }

  async sendRecoveryVerificationEmail(
    email: string,
    verificationToken: string,
    userName?: string
  ): Promise<void> {
    const clientUrl = functions.config().app?.client_url || 'http://localhost:3000';
    const verificationUrl = `${clientUrl}/auth/recover/verify-email?token=${verificationToken}`;
    
    // For local development, just log the email instead of sending
    if (process.env.FUNCTIONS_EMULATOR) {
      console.log('📧 LOCAL DEVELOPMENT - Email would be sent:');
      console.log('To:', email);
      console.log('Subject: Verify Your Email - BitTasker Account Recovery');
      console.log('Verification URL:', verificationUrl);
      console.log('HTML Content:', this.generateRecoveryEmailHtml(verificationUrl, userName));
      return;
    }
    
    const mailOptions = {
      from: functions.config().smtp?.user || 'noreply@bittasker.com',
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
