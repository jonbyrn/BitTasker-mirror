#!/bin/bash

# Create GitLab release for BitTasker v1.0.3

RELEASE_NOTES="## BitTasker v1.0.3

### Download
- Universal APK (arm64-v8a + armeabi-v7a): ~24M

### Installation
1. Download the APK
2. Enable "Install from unknown sources" in Android settings
3. Install the APK
4. Or install via Zapstore for automatic updates

### Verification
- Package: com.bittasker.app
- Version: 1.0.3
- Signed with BitTasker release key

### Changes in v1.0.3

#### 🎨 UI/UX Improvements
- **Fixed**: Layout stability by removing absolute positioning from bottom nav bar
- **Improved**: Drawer and payment modal bottom spacing for better mobile usability
- **Fixed**: Bottom dock overlap issues without content padding
- **Refined**: App-shell layout and mobile nav interactions
- **Enhanced**: Bottom navigation and layout for improved responsiveness

#### 💰 Wallet & Payment Fixes
- **Fixed**: Send max RBTC amount calculation
- **Fixed**: RBTC fee estimation accuracy
- **Fixed**: Rootstock receive flow and state restore
- **Fixed**: Bid acceptance insufficient balance with proper wallet initialization and loading assets
- **Fixed**: Balance loading for accept bid drawer
- **Implemented**: EIP-1191 checksummed RSK addresses
- **Fixed**: Address checksum errors and updated debug wallet UI
- **Patched**: Wallet-core package to fix duplicate invoices and Lightning invoice bugs

#### 🔔 Notifications
- **Updated**: Contract action notifications
- **Added**: New message notification
- **Updated**: Background push notification click action
- **Fixed**: Duplicate notifications for mobile
- **Updated**: Notification icon with drawable silhouette icon
- **Updated**: Bid created notification description

#### 🔧 Technical Improvements
- **Integrated**: Sentry error tracking for better debugging
- **Configured**: Android live reload with HTTP support
- **Implemented**: Build optimizations and cache purge automation
- **Fixed**: Build warnings

#### 🛠️ Developer Experience
- **Added**: Debug wallet page with RSK token support and transaction monitoring
- **Updated**: Blockscout API token detection with comprehensive logging
- **Removed**: Animation from token details accordion in debug wallet

#### 📝 Content & Features
- **Updated**: Task budget length to 10k (from 1k)
- **Refactored**: Task sharing functionality across components
- **Refactored**: Username validation to return translation keys directly
- **Removed**: Native passkey button

#### 🔍 SEO & Performance
- **Optimized**: SEO structured data implementation
- **Added**: WEBP logo for JSON-LD structured data

**Full changelog**: See commit history for detailed changes

**Previous version**: 1.0.2 → **Current**: 1.0.3"

glab release create "v1.0.3" \
  --repo "bittasker/zapstore" \
  --name "BitTasker v1.0.3" \
  --notes "$RELEASE_NOTES" \
  dist/release/bittasker-v1.0.3-universal.apk