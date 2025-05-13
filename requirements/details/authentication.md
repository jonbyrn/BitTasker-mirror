# BitTasker Authentication Documentation

## Overview

BitTasker implements a modern, secure authentication system using a combination of Nostr keys, biometric authentication, and email verification. This document outlines the authentication flows, security measures, and technical implementation details.

## Authentication Methods

BitTasker supports multiple authentication methods:

1. **Biometric Authentication** - Using device biometrics (fingerprint, face recognition)
2. **Web Authentication (WebAuthn)** - Passkeys for web browsers
3. **External Providers** - Integration with services like Alby

## Registration Process

### Standard Registration Flow

1. **Account Creation**:
   - User navigates to the signup page
   - Captcha verification through Cloudflare Turnstile
   - A new Nostr keypair (public/private keys) is generated client-side
   - The private key (nsec) is encrypted using the device ID as the password
   - The encrypted private key is sent to the server along with the public key

2. **Device Registration**:
   - The system registers the user's device with a unique device ID
   - Device name and details are stored for security and audit purposes
   - The encryption key is securely stored using biometrics or WebAuthn

3. **Email Verification** (Optional):
   - During onboarding, users can provide an email address
   - A verification link is sent to the email
   - The account is marked as verified once the link is clicked

### Biometric Authentication Setup

BitTasker uses native biometrics on mobile devices and WebAuthn on desktop browsers:

1. **Native Biometrics (Capacitor)**:
   - Available on iOS and Android through Capacitor Native Biometric plugin
   - Stores encrypted keys securely in the device's secure storage
   - Uses device biometrics (Touch ID, Face ID, fingerprint) for access

2. **WebAuthn (Web Authentication)**:
   - Available on modern browsers with platform authenticators
   - Uses the browser's credential management API
   - Supports platform authenticators like Windows Hello, Touch ID on macOS

## Login Process

### Biometric/Passkey Login Flow

1. **Device Authentication**:
   - User initiates login with biometrics or passkey
   - System retrieves the user's device ID
   - Biometric or passkey verification is performed

2. **Key Retrieval and Challenge-Response**:
   - Upon successful biometric verification, encrypted private key is retrieved
   - Server sends a login challenge to the client
   - Client decrypts the private key and signs the challenge
   - Signed challenge is verified server-side

3. **Session Creation**:
   - Upon successful verification, an access token is generated
   - User is redirected to the dashboard
   - User profile information is loaded

### External Provider Login (e.g., Alby)

BitTasker also supports login through external providers:

1. User initiates login with the external provider
2. Authentication is handled by the provider
3. Upon successful authentication, BitTasker receives user information
4. System creates or retrieves the existing user account

## Account Recovery

BitTasker offers multiple account recovery options:

### Email-based Recovery

1. **Initiation**:
   - User navigates to the recovery page
   - Provides their email address
   - System verifies the email is associated with an account
   - A recovery code is sent to the email

2. **Verification**:
   - User enters the recovery code
   - System validates the code
   - If valid, provides access to reset options

3. **Key Recovery**:
   - A new device key is generated
   - The encrypted private key is re-encrypted for the new device
   - Login credentials are restored

### Pre-set Recovery Password

Users can also set up a recovery password during account creation:

1. User creates a recovery password during onboarding
2. This password is used to encrypt a copy of their private key
3. During recovery, the user provides this password to decrypt their key

## Security Measures

BitTasker implements several security measures:

1. **Client-side Key Generation**:
   - All cryptographic keys are generated on the client device
   - Private keys never leave the device in unencrypted form

2. **End-to-End Encryption**:
   - Private keys are encrypted before storage or transmission
   - AES-GCM encryption with derived keys from secure passwords

3. **Biometric Protection**:
   - Decryption keys are protected by biometric verification
   - Failsafe mechanisms prevent brute force attacks

4. **Challenge-Response Authentication**:
   - Login uses a challenge-response mechanism
   - Prevents replay attacks and credential theft

5. **Device Management**:
   - Users can view and revoke devices with access to their account
   - Device-specific information is logged for security auditing

6. **Rate Limiting and Captcha**:
   - Registration and login attempts are rate-limited
   - Captcha verification prevents automated attacks

## Token Management

BitTasker uses secure token management for authentication:

1. **Access Tokens**:
   - JWT-based tokens for API access
   - Stored securely using Capacitor Preferences
   - Used for authenticating API requests

2. **Token Validation**:
   - Each API request validates the token
   - Checks for expiration and integrity
   - Unauthorized requests are rejected

3. **Session Management**:
   - Active sessions can be viewed and terminated
   - Automatic logout on extended inactivity

## Technical Implementation

### Key Technologies

- **Nostr Tools**: For cryptographic key generation and management
- **WebCrypto API**: For secure client-side encryption/decryption
- **Capacitor Native Biometric**: For native biometric authentication
- **WebAuthn API**: For web-based passkey authentication
- **JWT**: For secure token-based authentication

### Encryption Process

1. **Key Derivation**:
   - Password-based key derivation (PBKDF2) with salt and iterations
   - Generates secure encryption keys from passwords or device IDs

2. **AES-GCM Encryption**:
   - Symmetric encryption of private keys
   - Includes authentication tag for integrity verification

3. **Secure Storage**:
   - Encrypted keys stored in secure, platform-specific storage
   - WebAuthn credentials stored in browser's credential store
   - Native biometrics use platform-specific secure enclaves

### API Endpoints

BitTasker's authentication system uses these key endpoints:

- `/api/v1/auth/register/nostr`: Register with Nostr keys
- `/api/v1/auth/nostr/login`: Login with Nostr keys
- `/api/v1/auth/nostr/challenge`: Get login challenge
- `/api/v1/auth/register/passkey-device`: Register a new device
- `/api/v1/auth/login/passkey`: Login with passkey
- `/api/v1/auth/revoke-device`: Revoke device access
- `/api/v1/auth/recover/nostr/initiate`: Initiate account recovery
- `/api/v1/auth/recover/nostr/complete`: Complete account recovery
- `/api/v1/auth/verification/verify-email`: Verify email address

## One-Time Codes and Verification

BitTasker uses one-time codes for various verification processes:

1. **Email Verification**:
   - One-time link sent to user's email
   - Contains a secure token for verification
   - Expires after a set time period

2. **Recovery Codes**:
   - Time-limited codes for account recovery
   - Sent to registered email addresses
   - Used to verify identity during recovery

3. **Backup Codes**:
   - Generated during account setup
   - Allows emergency access when biometrics unavailable
   - Stored securely and shown only once to the user

## User Experience Considerations

BitTasker's authentication system balances security with user experience:

1. **Simplified Flows**:
   - Clear user guidance through authentication steps
   - Fallback options when primary methods unavailable

2. **Device Recognition**:
   - Remembers trusted devices
   - Requires fewer verification steps on recognized devices

3. **Progressive Enhancement**:
   - Falls back to simpler methods when advanced biometrics unavailable
   - Adapts to device capabilities automatically

4. **Error Handling**:
   - Clear error messages for troubleshooting
   - Guided recovery paths for authentication failures
