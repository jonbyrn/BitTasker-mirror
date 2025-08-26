# Email Verification System for BitTasker

This document explains how the email verification system works for account recovery in BitTasker.

## Overview

The email verification system provides a secure way to verify user email addresses during account recovery. When a user enters their recovery email, the system:

1. Sends a verification email with a secure token
2. User clicks the verification link in the email
3. System verifies the token and allows recovery to proceed
4. User completes the account recovery process

## Architecture

### Frontend Components

- **Email Service** (`src/lib/api/services/email.service.ts`): Main service for sending emails
- **Firebase Email Service** (`src/lib/api/services/firebase-email.service.ts`): Firebase Cloud Functions integration
- **Auth Service** (`src/lib/api/services/auth.service.ts`): Handles recovery initiation and verification
- **Recovery Pages**: UI components for the recovery flow

### Backend Integration

- **Recovery Initiation**: `/api/v1/auth/recover/nostr/initiate`
- **Email Verification**: `/api/v1/auth/recover/verify-email`
- **Recovery Completion**: `/api/v1/auth/recover/nostr/complete`

## Flow Diagram

```
User enters email → Backend generates token → Frontend sends email → User clicks link → Verify token → Continue recovery
```

## Implementation Details

### 1. Recovery Initiation

When a user initiates recovery:

```typescript
// User enters email and submits
await authService.initiateNostrRecovery(email);

// Auth service calls backend and sends verification email
async initiateNostrRecovery(email: string): Promise<void> {
  try {
    // Call backend to get verification token
    const response = await this.post(ENDPOINTS.AUTH.NOSTR_RECOVERY_INITIATE, { email });
    
    if (response.data.verificationToken) {
      // Send verification email via Firebase
      await emailService.sendRecoveryVerificationEmail({
        email,
        verificationToken: response.data.verificationToken,
        emailType: 'recovery',
        expiryHours: 24
      });
    }
  } catch (error) {
    // Fallback to old behavior if backend doesn't support tokens
    await this.post(ENDPOINTS.AUTH.NOSTR_RECOVERY_INITIATE, { email });
  }
}
```

### 2. Email Sending

The system uses Firebase Cloud Functions to send emails:

```typescript
// Firebase Email Service
async sendRecoveryVerificationEmail(email: string, verificationToken: string): Promise<void> {
  const sendEmail = httpsCallable(this.functions, 'sendRecoveryVerificationEmail');
  await sendEmail({ email, verificationToken });
}
```

### 3. Email Verification

When user clicks the verification link:

```typescript
// User lands on /auth/recover/verify-email?token=xxx
const token = page.url.searchParams.get('token');

// Verify the token
recoveryData = await authService.verifyRecoveryEmail(token);

// Redirect to recovery completion
goto(`/auth/recover/${recoveryData.publicKey}`);
```

## Configuration

### Environment Variables

Ensure these Firebase environment variables are set:

```env
VITE_FIREBASE_WEB_API_KEY="your-api-key"
VITE_FIREBASE_WEB_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_WEB_PROJECT_ID="your-project-id"
VITE_FIREBASE_WEB_STORAGE_BUCKET="your-project.appspot.com"
VITE_FIREBASE_WEB_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_WEB_APP_ID="your-app-id"
VITE_FIREBASE_VAPID_KEY="your-vapid-key"
```

### Firebase Cloud Functions

The system requires Firebase Cloud Functions to be set up. See `firebase-functions-setup.md` for detailed setup instructions.

## Security Features

### Token Security

- **Expiration**: Verification tokens expire after 24 hours
- **Uniqueness**: Each token is unique and single-use
- **Cryptographic**: Tokens are cryptographically secure

### Rate Limiting

- **Email Limits**: Prevents spam and abuse
- **Token Validation**: Ensures tokens are valid and not expired
- **Input Validation**: Validates email addresses and tokens

### Error Handling

- **Graceful Degradation**: Falls back to old behavior if Firebase unavailable
- **User Feedback**: Clear error messages without exposing sensitive information
- **Logging**: Comprehensive logging for monitoring and debugging

## User Experience

### Email Design

The verification emails include:

- **Professional Design**: Branded with BitTasker styling
- **Clear Call-to-Action**: Prominent verification button
- **Mobile Responsive**: Works on all device sizes
- **Accessibility**: Both HTML and text versions
- **Security Information**: Clear expiration warnings

### Recovery Flow

1. **Email Entry**: User enters recovery email
2. **Verification Sent**: Confirmation that email was sent
3. **Email Verification**: User clicks link in email
4. **Verification Success**: Confirmation and redirect to recovery
5. **Recovery Completion**: User completes account recovery

## Testing

### Unit Tests

Run the test suite:

```bash
npm run test:unit
```

### Manual Testing

1. **Local Development**: Use Firebase emulators
2. **Email Testing**: Use services like Mailtrap for development
3. **Integration Testing**: Test the complete recovery flow

## Troubleshooting

### Common Issues

1. **Firebase Not Configured**: Check environment variables
2. **Email Not Sending**: Verify Firebase Functions are deployed
3. **Token Expired**: Check token expiration settings
4. **Verification Failing**: Ensure backend endpoints are working

### Debug Steps

1. Check browser console for errors
2. Verify Firebase configuration
3. Check network requests to backend
4. Review Firebase Functions logs

## Future Enhancements

### Planned Features

- **Email Templates**: More customizable email designs
- **Multi-language Support**: Internationalization for emails
- **Advanced Security**: Additional verification methods
- **Analytics**: Track email delivery and engagement

### Integration Opportunities

- **SMS Verification**: Add SMS as backup verification method
- **Push Notifications**: Notify users when verification emails are sent
- **Social Login**: Integrate with social media verification

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review Firebase documentation
3. Check BitTasker issue tracker
4. Contact the development team

## Contributing

To contribute to the email verification system:

1. Follow the existing code patterns
2. Add comprehensive tests
3. Update documentation
4. Ensure security best practices
5. Test thoroughly before submitting

---

**Note**: This system is designed to be secure, user-friendly, and maintainable. Always prioritize security and user experience when making changes.
