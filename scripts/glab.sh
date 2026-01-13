#!/bin/bash

# Create GitLab release for BitTasker v1.0.2

RELEASE_NOTES="## BitTasker v1.0.2

### Download
- Universal APK (arm64-v8a + armeabi-v7a): 24M

### Installation
1. Download the APK
2. Enable "Install from unknown sources" in Android settings
3. Install the APK
4. Or install via Zapstore for automatic updates

### Verification
- Package: com.bittasker.app
- Version: 1.0.2
- Signed with BitTasker release key

### Changes in v1.0.2

#### 🔧 Technical Improvements
- **Fixed**: WebAuthn/Passkey authentication on Android native app
  - Resolved RP ID validation error preventing passkey creation and authentication
  - Properly configured domain association for 'bittasker.com'
  - Updated Digital Asset Links for secure passkey storage


**Full changelog**: See commit history for detailed changes

**Previous version**: 1.0.1 → **Current**: 1.0.2"

glab release create "v1.0.2" \
  --repo "bittasker/zapstore" \
  --name "BitTasker v1.0.2" \
  --notes "$RELEASE_NOTES" \
  dist/release/bittasker-v1.0.2-universal.apk