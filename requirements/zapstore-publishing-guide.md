# BitTasker Zapstore Publishing Guide

## Overview

This document provides a comprehensive guide for publishing BitTasker (Svelte 5 + Capacitor) to Zapstore, an open app store for Android that uses Nostr for identity and Bitcoin payments. This guide covers the entire workflow from building the APK to publishing it on Zapstore.

### Key Points (TL;DR)

✅ **Version Management is Fully Automated** - The script reads the current versions from `build.gradle`, auto-increments them based on semantic versioning (major/minor/patch), and updates the file. No manual tracking needed. No external tools required. You just specify the release type: `npm run release:zapstore patch`

✅ **Semantic Versioning Built-In** - Just specify `major`, `minor`, or `patch` (or nothing for default patch). Script automatically calculates the new version number. No need to remember what version you're on!

✅ **No package.json Dependency** - You don't need to update `package.json` version. The Android version lives independently in `build.gradle` and the script manages it automatically using bash commands (`grep`, `sed`).

✅ **Keystore Creation is Automatic** - The `keytool -genkey` command automatically creates a new keystore file. You don't need to create it manually first.

✅ **Capacitor is Safe** - Running `npx cap sync` does NOT overwrite your `build.gradle` or signing configurations. Your native configurations are persistent and safe to edit.

✅ **One-Time Setup** - After initial configuration (keystore + signing in `build.gradle`), the entire release process is automated with a single command: `npm run release:zapstore patch`

✅ **No Manual APK Modification** - You configure settings BEFORE building. The APK is generated with all correct settings baked in. You never modify the compiled APK file itself.

✅ **No External Dependencies** - Version management uses standard bash commands that work on Linux, macOS, and Windows/WSL. No npm packages or tools needed.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Understanding the Architecture](#understanding-the-architecture)
3. [Capacitor Build Process](#capacitor-build-process)
4. [Android APK Signing](#android-apk-signing)
5. [Zapstore Requirements](#zapstore-requirements)
6. [Repository Structure](#repository-structure)
7. [Automated Publishing Script](#automated-publishing-script)
8. [Security Considerations](#security-considerations)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **Node.js**: >= 20.0.0 (as specified in package.json)
- **npm**: Latest version
- **Android Studio**: For building APKs
- **Java JDK**: 17 (required by Android Gradle)
- **Zapstore CLI**: Download from https://zapstore.dev/docs/publish
- **Git**: For repository management
- **GitLab CLI** (optional): For automated releases to GitLab

### Required Accounts

- **Nostr Identity**: A Nostr keypair (nsec/npub) for signing releases
- **GitLab Account**: Access to https://gitlab.com/bittasker/zapstore (public release repository)
- **Android Keystore**: For signing APKs (will be created if not exists)

### Environment Setup

```bash
# Install Zapstore CLI (Linux amd64)
curl -sL https://cdn.zapstore.dev/6e2c7cf6da53c3f1a78b523a6aacd6316dce3d74ace6f859c2676729ee439990 -o zapstore
shasum -a 256 zapstore  # Verify hash matches URL
chmod +x zapstore
sudo mv zapstore /usr/local/bin/

# Verify installation
zapstore --version
```

---

## Understanding the Architecture

### Current Project Structure

```
Bittasker/ (Private Repository)
├── src/                    # Svelte 5 source code
├── android/                # Capacitor-generated Android project
│   ├── app/
│   │   ├── build.gradle   # Android build configuration
│   │   └── src/main/      # Android native code
│   ├── gradle.properties  # Gradle properties
│   └── build.gradle       # Root build configuration
├── capacitor.config.ts    # Capacitor configuration
├── package.json           # Project metadata & scripts
└── build/                 # Compiled web assets (after npm run build)

gitlab.com/bittasker/zapstore (Public Release Repository)
├── README.md              # Public-facing documentation
├── CHANGELOG.md           # Version history
├── zapstore.yaml          # Zapstore configuration
└── assets/                # App assets (icon, screenshots)
    ├── icon.png
    ├── screenshot1.png
    └── screenshot2.png
```

### Publishing Flow

```
1. Build Web App (Svelte)
   ↓
2. Sync with Capacitor
   ↓
3. Build Android APK (Gradle)
   ↓
4. Sign APK (Android Keystore)
   ↓
5. Create GitLab Release (APK only)
   ↓
6. Publish to Zapstore (Nostr + Blossom)
```

---

## Capacitor Build Process

### How Capacitor Works

Capacitor is a cross-platform native runtime that wraps your web application in a native container. It does **NOT** automatically rebuild or overwrite your Android project files unless you explicitly run certain commands.

#### Key Capacitor Commands

1. **`npx cap sync android`**
   - Copies web assets from `build/` to `android/app/src/main/assets/public/`
   - Updates native dependencies
   - **Does NOT overwrite** `build.gradle`, `gradle.properties`, or signing configurations
   - Safe to run repeatedly

2. **`npx cap copy android`**
   - Only copies web assets
   - Faster than sync
   - **Does NOT overwrite** native configurations

3. **`npx cap update android`**
   - Updates Capacitor native dependencies
   - May require manual intervention for breaking changes

4. **`npx cap add android`** ⚠️
   - **DANGEROUS**: Regenerates the entire Android project
   - **WILL OVERWRITE** all native configurations
   - Only use once during initial setup

### Persistent Configuration Files

The following files in `android/` are **persistent** and will NOT be overwritten by Capacitor:

- ✅ `android/app/build.gradle` - Build configuration & signing
- ✅ `android/gradle.properties` - Gradle properties
- ✅ `android/variables.gradle` - SDK versions
- ✅ `android/app/src/main/` - Native Java/Kotlin code
- ✅ `android/app/google-services.json` - Firebase config

### Version Management

## Understanding Android Versioning

Android apps require two version identifiers:

- **`versionCode`**: An integer that MUST increment with each release (1, 2, 3, ...). Android uses this to determine which version is newer.
- **`versionName`**: A user-facing string (e.g., "1.0.5"). This is what users see in app stores.

**Important:** Your `package.json` version (`0.0.1`) is completely independent and doesn't need to match or be updated!

#### Current Version Configuration

**In `android/app/build.gradle`:**
```gradle
android {
    defaultConfig {
        versionCode 1          // Must increment: 1 → 2 → 3 → 4 ...
        versionName "1.0"      // User-facing: 1.0 → 1.0.5 → 1.1.0 ...
    }
}
```

---

### BitTasker's Versioning Strategy: Semantic Auto-Increment (Recommended)

**The publishing script will automatically:**
1. ✅ Read current `versionCode` from `build.gradle` (e.g., finds `5`)
2. ✅ Increment it automatically (makes it `6`)
3. ✅ Read current `versionName` from `build.gradle` (e.g., `1.2.3`)
4. ✅ Calculate new `versionName` based on release type you specify (major/minor/patch)
5. ✅ Update `build.gradle` with both values
6. ✅ Build the APK with correct versions baked in

**You just run:**
- `npm run release:zapstore patch` → 1.2.3 becomes 1.2.4
- `npm run release:zapstore minor` → 1.2.3 becomes 1.3.0
- `npm run release:zapstore major` → 1.2.3 becomes 2.0.0
- `npm run release:zapstore` (no argument) → defaults to patch

**No external tools needed. No manual tracking. No package.json updates required. No version numbers to remember!**

---

#### How the Semantic Auto-Increment Works

The script uses bash commands to read, parse, and update `build.gradle`:

```bash
# 1. Read current versions from build.gradle
CURRENT_VERSION_CODE=$(grep -oP 'versionCode\s+\K\d+' android/app/build.gradle)
CURRENT_VERSION_NAME=$(grep -oP 'versionName\s+"\K[^"]+' android/app/build.gradle)

# 2. Increment versionCode
NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))

# 3. Parse current version name (e.g., "1.2.3" → MAJOR=1, MINOR=2, PATCH=3)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION_NAME"

# 4. Calculate new version based on release type
RELEASE_TYPE=${1:-patch}  # Default to patch if no argument

case $RELEASE_TYPE in
  major)
    NEW_VERSION_NAME="$((MAJOR + 1)).0.0"
    ;;
  minor)
    NEW_VERSION_NAME="$MAJOR.$((MINOR + 1)).0"
    ;;
  patch)
    NEW_VERSION_NAME="$MAJOR.$MINOR.$((PATCH + 1))"
    ;;
  *)
    echo "❌ Invalid release type. Use: major, minor, or patch"
    exit 1
    ;;
esac

# 5. Update build.gradle
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i "" "s/versionCode $CURRENT_VERSION_CODE/versionCode $NEW_VERSION_CODE/" android/app/build.gradle
  sed -i "" "s/versionName \".*\"/versionName \"$NEW_VERSION_NAME\"/" android/app/build.gradle
else
  sed -i "s/versionCode $CURRENT_VERSION_CODE/versionCode $NEW_VERSION_CODE/" android/app/build.gradle
  sed -i "s/versionName \".*\"/versionName \"$NEW_VERSION_NAME\"/" android/app/build.gradle
fi

echo "✓ Updated: versionCode $CURRENT_VERSION_CODE → $NEW_VERSION_CODE"
echo "✓ Updated: versionName $CURRENT_VERSION_NAME → $NEW_VERSION_NAME"
```

**Results:**

```bash
# Current state: versionCode 5, versionName "1.2.3"

# After: npm run release:zapstore patch
versionCode 6
versionName "1.2.4"

# After: npm run release:zapstore minor
versionCode 6
versionName "1.3.0"

# After: npm run release:zapstore major
versionCode 6
versionName "2.0.0"

# After: npm run release:zapstore (no argument, defaults to patch)
versionCode 6
versionName "1.2.4"
```

---

#### Version Naming Convention

**Recommended format:** `MAJOR.MINOR.PATCH` (Semantic Versioning)

- **Major** (1.x.x): Breaking changes, major redesigns
- **Minor** (x.1.x): New features, backward compatible
- **Patch** (x.x.1): Bug fixes, small improvements

**Examples:**
- `1.0.0` → Initial public release
- `1.0.1` → Bug fix
- `1.0.2` → Another bug fix
- `1.1.0` → New feature added
- `2.0.0` → Major redesign

**Zapstore APK naming:** Version `1.0.6` → `bittasker-v1.0.6-universal.apk`

---

#### Your Workflow

```bash
# Current version: 1.0.0

# Bug fix release (patch)
npm run release:zapstore patch
# → versionCode increments, versionName becomes 1.0.1

# Another bug fix (or just default with no argument)
npm run release:zapstore
# → versionCode increments, versionName becomes 1.0.2

# New feature release (minor)
npm run release:zapstore minor
# → versionCode increments, versionName becomes 1.1.0

# Another feature
npm run release:zapstore minor
# → versionCode increments, versionName becomes 1.2.0

# Major redesign (major)
npm run release:zapstore major
# → versionCode increments, versionName becomes 2.0.0
```

**No manual tracking. No version numbers to remember. No version conflicts. Just specify the release type and it works.**

---

### Alternative: External Version Management Tools (Reference Only)

If you prefer external tools for version management, here are the available options. **Note: BitTasker uses the script-based approach above, but these are documented for reference.**

#### Option 1: `capacitor-set-version`

This tool allows explicit version control but requires manual build number tracking.

##### Option 1: `capacitor-set-version` (Simplest - Recommended)

This is the easiest solution for most projects.

**Installation:**
```bash
npm install -g capacitor-set-version
```

**Usage:**
```bash
# Set version and build number
capacitor-set-version -v 1.2.3 -b 10

# Or use current package.json version
capacitor-set-version -v $(node -p "require('./package.json').version") -b 10
```

**Add to package.json:**
```json
{
  "scripts": {
    "version:set": "capacitor-set-version -v $npm_package_version -b"
  }
}
```

**Pros:**
- ✅ Simple and straightforward
- ✅ Works globally or per-project
- ✅ Explicitly control version and build number
- ✅ Works on all platforms

**Cons:**
- ❌ Requires manual build number tracking

---

#### Option 2: `cap-sync-version`

This tool automatically calculates `versionCode` from your `package.json` version. Requires updating package.json first.

**Installation:**
```bash
npm install --save-dev cap-sync-version
```

**Usage:**
```bash
# Automatically syncs version from package.json
npx cap-sync-version
```

**Add to package.json:**
```json
{
  "scripts": {
    "version:sync": "cap-sync-version"
  }
}
```

**How it calculates versionCode:**
- Version `1.2.3` → versionCode: `10203` (major * 10000 + minor * 100 + patch)
- Version `2.0.15` → versionCode: `20015`

**Pros:**
- ✅ Fully automatic - no manual tracking
- ✅ Consistent calculation from version string
- ✅ Single source of truth (package.json)

**Cons:**
- ❌ Less control over versionCode
- ❌ May create large version codes

---

#### Option 3: `@trapezedev/configure`

Best for CI/CD pipelines with environment variables.

**Installation:**
```bash
npm install --save-dev @trapezedev/configure
```

**Create `scripts/sync-version.js`:**
```javascript
const { MobileProject } = require('@trapezedev/configure');
const packageJson = require('../package.json');

async function syncVersion() {
  const project = new MobileProject('android', {
    android: {
      path: 'android'
    }
  });

  await project.load();

  // Parse version from package.json (e.g., "0.0.1" -> versionCode: 1, versionName: "0.0.1")
  const versionParts = packageJson.version.split('.');
  const versionCode = parseInt(versionParts[2]) || 1;
  const versionName = packageJson.version;

  // Update Android version
  const buildGradle = project.android.getAppBuildGradle();
  buildGradle.setVersionCode(versionCode);
  buildGradle.setVersionName(versionName);

  await project.commit();
  console.log(`✓ Synced version to ${versionName} (code: ${versionCode})`);
}

syncVersion().catch(console.error);
```

**Add to package.json:**
```json
{
  "scripts": {
    "version:sync": "node scripts/sync-version.js"
  }
}
```

**Pros:**
- ✅ Most flexible and powerful
- ✅ Can customize version calculation logic
- ✅ Works with CI/CD environment variables
- ✅ Can modify other native configs too

**Cons:**
- ❌ More complex setup
- ❌ Requires custom scripting

---

---

### Why Script-Based Auto-Increment is Best for BitTasker

**Comparison:**

| Approach | Requires | BitTasker Fit |
|----------|----------|---------------|
| **Script auto-increment** | Nothing (bash commands) | ✅ **PERFECT** - No tracking, no tools |
| `capacitor-set-version` | Manual build number tracking | ❌ Still need to track numbers |
| `cap-sync-version` | Update package.json first | ❌ Don't update package.json |
| `@trapezedev/configure` | Complex CI/CD setup | ❌ Overkill for manual releases |

**Advantages of script-based approach:**
- ✅ No external dependencies to install or maintain
- ✅ No version tracking needed
- ✅ No package.json updates required
- ✅ Transparent (you can see exactly what it does)
- ✅ Reliable (standard bash commands)
- ✅ Cross-platform (Linux, macOS, Windows/WSL)
- ✅ Single source of truth (`build.gradle`)
- ✅ Perfect for your workflow

---

## Android APK Signing

### Understanding APK Signing

All Android APKs must be signed before distribution. Zapstore verifies APK signatures to ensure authenticity.

### Creating a Keystore (First Time Only)

#### Do You Already Have a Keystore?

**Check these locations first:**

```bash
# Check your android directory
ls -la android/*.jks
ls -la android/*.keystore

# Check for debug keystore (NOT for production!)
# Windows:
dir %USERPROFILE%\.android\debug.keystore

# macOS/Linux:
ls -la ~/.android/debug.keystore
```

**If you find a `.jks` or `.keystore` file**, you may already have one. Verify it with:
```bash
keytool -list -v -keystore android/your-keystore-name.jks
# Enter the password when prompted
```

**⚠️ IMPORTANT**: The debug keystore (`~/.android/debug.keystore`) is automatically created by Android Studio but should **NEVER** be used for production releases. It's only for development.

---

#### Creating a New Release Keystore

If you don't have a release keystore, the `keytool` command will **automatically create a new one** for you:

```bash
keytool -genkey -v -keystore android/bittasker-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias bittasker-release
```

**What this command does:**
1. ✅ **Creates** the file `android/bittasker-release-key.jks` (you don't need to create it manually)
2. ✅ Prompts you for information:
   - **Keystore password**: Password to protect the keystore file (save this!)
   - **Key password**: Password for the specific key/alias (save this!)
   - **Your name**: Your name or organization name
   - **Organizational unit**: Your team/department (can skip)
   - **Organization**: Your company name (can skip)
   - **City/Locality**: Your city
   - **State/Province**: Your state
   - **Country code**: Two-letter country code (e.g., US, UK, CA)
3. ✅ Generates a 2048-bit RSA key pair
4. ✅ Sets validity to 10,000 days (~27 years)
5. ✅ Saves everything to the keystore file

**Example interaction:**
```bash
$ keytool -genkey -v -keystore android/bittasker-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias bittasker-release

Enter keystore password: [type your password]
Re-enter new password: [type your password again]

What is your first and last name?
  [Unknown]:  BitTasker Development Team

What is the name of your organizational unit?
  [Unknown]:  Development

What is the name of your organization?
  [Unknown]:  BitTasker

What is the name of your City or Locality?
  [Unknown]:  San Francisco

What is the name of your State or Province?
  [Unknown]:  California

What is the two-letter country code for this unit?
  [Unknown]:  US

Is CN=BitTasker Development Team, OU=Development, O=BitTasker, L=San Francisco, ST=California, C=US correct?
  [no]:  yes

Enter key password for <bittasker-release>
        (RETURN if same as keystore password): [press Enter or type different password]

[Storing android/bittasker-release-key.jks]
```

**After running this command**, you'll have a new keystore file at `android/bittasker-release-key.jks`.

---

#### Understanding Keystore Components

When you create a keystore, you're setting up these components:

- **Keystore file** (`bittasker-release-key.jks`): The container that holds your keys
- **Keystore password**: Password to access the keystore file
- **Key alias** (`bittasker-release`): The name/identifier for your signing key
- **Key password**: Password for the specific key (can be same as keystore password)

**You'll need all of these** when configuring Gradle signing!

---

#### ⚠️ CRITICAL: Backup Your Keystore Securely!

**If you lose your keystore or forget the passwords, you CANNOT update your app on Zapstore or any app store!**

**Backup checklist:**
- ✅ Store keystore file in password manager (1Password, Bitwarden, etc.)
- ✅ Keep offline backup on encrypted USB drive
- ✅ Store passwords separately from keystore file
- ✅ Document the key alias name
- ✅ Keep backup in a different physical location
- ✅ Test your backup by verifying the keystore:
  ```bash
  keytool -list -v -keystore /path/to/backup/bittasker-release-key.jks
  ```

**⚠️ CRITICAL: Backup this keystore file securely!**
- Store it in a password manager
- Keep offline backups
- If lost, you cannot update your app on Zapstore

### Configuring Gradle for Signing

#### Step 1: Create `android/keystore.properties`

```properties
# android/keystore.properties
# DO NOT COMMIT THIS FILE TO GIT!

storeFile=bittasker-release-key.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=bittasker-release
keyPassword=YOUR_KEY_PASSWORD
```

Add to `.gitignore`:
```
android/keystore.properties
android/*.jks
android/*.keystore
```

#### Step 2: Update `android/app/build.gradle`

Add signing configuration:

```gradle
apply plugin: 'com.android.application'

// Load keystore properties
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    namespace "com.bittasker.app"
    compileSdk rootProject.ext.compileSdkVersion
    
    defaultConfig {
        applicationId "com.bittasker.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        
        // Configure multiple ABIs
        ndk {
            abiFilters 'arm64-v8a', 'armeabi-v7a'
        }
    }
    
    // Configure signing
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
    
    // Generate multiple APKs for different ABIs
    splits {
        abi {
            enable true
            reset()
            include 'arm64-v8a', 'armeabi-v7a'
            universalApk true  // Also generate a universal APK
        }
    }
}

// ... rest of the file remains the same
```

### Understanding APK Outputs

After building, Gradle generates multiple APKs:

```
android/app/build/outputs/apk/release/
├── app-arm64-v8a-release.apk      # 64-bit ARM (modern devices, ~15-20MB)
├── app-armeabi-v7a-release.apk    # 32-bit ARM (older devices, ~15-20MB)
└── app-universal-release.apk      # All ABIs (all devices, ~25-30MB)
```

**For Zapstore, publish the universal APK** to support all devices.

### Building Signed APKs

```bash
# From project root
cd android
./gradlew assembleRelease

# APKs will be in:
# android/app/build/outputs/apk/release/
```

---

## Zapstore Requirements

### What is Zapstore?

Zapstore is an open app store for Android that:
- Uses **Nostr** for developer identity and app metadata
- Uses **Blossom** servers for APK hosting
- Requires **cryptographic signatures** for verification
- Has **no central gatekeeper** - anyone can publish
- Supports **Bitcoin Lightning** payments for developers

### Zapstore Configuration File

Create `zapstore.yaml` in the **public release repository** (gitlab.com/bittasker/zapstore):

```yaml
# zapstore.yaml

# App identification
name: BitTasker
identifier: com.bittasker.app

# Short description (one sentence)
summary: Bitcoin-powered gig economy platform connecting taskers and taskees

# Long description (markdown supported)
description: |
  BitTasker is a revolutionary gig economy platform that connects people seeking services (Taskers) 
  with professionals offering those services (Taskees). Built on Bitcoin and Nostr protocols, 
  BitTasker provides:
  
  ## Features
  
  - **Lightning Network Payments**: Instant, low-fee Bitcoin transactions
  - **Liquid Network Integration**: Fast, confidential settlements
  - **Rootstock Smart Contracts**: Decentralized escrow and dispute resolution
  - **Nostr Identity**: Decentralized, user-owned identity management
  - **End-to-End Encryption**: Secure messaging using NIP-44
  - **Multi-Language Support**: Automatic translation powered by AI
  - **Task Management**: Post tasks, receive bids, hire taskees
  - **Reputation System**: Build trust through reviews and ratings
  
  ## Why BitTasker?
  
  - **Your Keys, Your Identity**: No centralized account system
  - **Bitcoin-Native**: All payments in Bitcoin (Lightning, Liquid, on-chain)
  - **Global Marketplace**: Connect with people worldwide
  - **Fair Fees**: Transparent, competitive fee structure
  - **Freedom Tech**: Built on open protocols (Nostr, Bitcoin)

# Repository (public release repo)
repository: https://gitlab.com/bittasker/zapstore

# App homepage
homepage: https://bittasker.com

# App icon (relative to repository root)
icon: assets/icon.png

# License
license: MIT

# Changelog file (relative to repository root)
changelog: CHANGELOG.md

# Screenshots (relative to repository root)
images:
  - assets/screenshot1.png
  - assets/screenshot2.png
  - assets/screenshot3.png
  - assets/screenshot4.png

# Tags for discoverability
tags: bitcoin lightning liquid rootstock nostr gig-economy freelance tasks payments freedom-tech android marketplace

# Pull additional metadata from GitHub/GitLab
remote_metadata:
  - gitlab  # or 'github' if using GitHub

# Blossom servers for APK hosting
blossom_servers:
  - https://cdn.zapstore.dev
  - https://blossom.band

# APK file pattern (regex)
# Zapstore will look for APKs matching this pattern in GitLab releases
assets:
  - bittasker-v.*-universal\.apk
```

### Zapstore Asset Requirements

Zapstore expects:
- **APK naming convention**: `{app-name}-v{version}-{abi}.apk`
  - Example: `bittasker-v1.0.0-universal.apk`
- **Icon**: PNG, 512x512px minimum
- **Screenshots**: PNG/JPG, 1080x1920px (portrait) or 1920x1080px (landscape)
- **Changelog**: Markdown format

### How Zapstore Publishing Works

When you run `zapstore publish`:

1. **Reads `zapstore.yaml`** from the repository
2. **Fetches release info** from GitLab/GitHub API
3. **Downloads APK** from the release
4. **Extracts APK metadata** (package name, version, permissions)
5. **Uploads APK to Blossom servers** (decentralized file storage)
6. **Creates Nostr events**:
   - **Kind 32267**: App metadata event
   - **Kind 1063**: File metadata event (for APK)
7. **Signs events** with your Nostr private key
8. **Publishes to Nostr relays** (relay.zapstore.dev)

---

## Repository Structure

### Public Release Repository (gitlab.com/bittasker/zapstore)

```
zapstore/
├── README.md              # Public documentation
├── CHANGELOG.md           # Version history
├── LICENSE                # License file
├── zapstore.yaml          # Zapstore configuration
└── assets/
    ├── icon.png           # App icon (512x512)
    ├── screenshot1.png    # Home screen
    ├── screenshot2.png    # Task creation
    ├── screenshot3.png    # Wallet
    └── screenshot4.png    # Messaging
```

### README.md Template

```markdown
# BitTasker - Official Releases

This repository contains official releases of BitTasker, a Bitcoin-powered gig economy platform.

## Download

### Via Zapstore (Recommended)
Install via [Zapstore](https://zapstore.dev) for automatic updates and verification.

### Direct Download
Download the latest APK from [Releases](https://gitlab.com/bittasker/zapstore/-/releases).

## Verification

All releases are cryptographically signed and can be verified via Zapstore.

- **Package Name**: `com.bittasker.app`
- **Developer**: `npub1...` (your Nostr public key)

## Features

- Lightning Network payments
- Liquid Network integration
- Rootstock smart contracts
- Decentralized identity (Nostr)
- End-to-end encrypted messaging
- Multi-language support

## Support

- **Website**: https://bittasker.com
- **Source Code**: Private (contact for access)
- **Issues**: Report via email or Nostr DM
- **Nostr**: npub1... (your Nostr public key)

## License

MIT License - See LICENSE file for details
```

### CHANGELOG.md Template

```markdown
# Changelog

All notable changes to BitTasker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-01-XX

### Added
- Initial public release
- Lightning Network payment support
- Liquid Network integration
- Task creation and bidding system
- Real-time messaging with NIP-44 encryption
- Multi-language support (English, Spanish)
- Nostr identity integration
- Wallet management (Bitcoin, Lightning, Liquid)

### Security
- End-to-end encryption for all messages
- Client-side key management
- Biometric authentication support

## [0.0.1] - 2025-01-XX

### Added
- Beta release for testing
```

---

## Setting Up Version Management

**No setup needed!** The publishing script uses built-in bash commands (`grep`, `sed`) to automatically read and increment the version in `build.gradle`.

### Verify Current Version

Check your current version:

```bash
# View current version
grep -A 2 "defaultConfig" android/app/build.gradle
```

Output:
```gradle
defaultConfig {
    versionCode 1
    versionName "1.0"
```

**This is your starting point.** The script will read these values and automatically calculate the next version based on the release type you specify (major/minor/patch).

**Important:** Make sure your initial `versionName` follows semantic versioning format `X.Y.Z` (e.g., `1.0.0`). If it's currently just `1.0`, update it manually to `1.0.0` first:

```gradle
defaultConfig {
    versionCode 1
    versionName "1.0.0"  // Changed from "1.0" to semantic versioning format
}
```

---

## Automated Publishing Script

### Script Requirements

The script should:
1. ✅ Build the Svelte web app
2. ✅ Sync with Capacitor
3. ✅ Build signed Android APK
4. ✅ Create GitLab release with APK
5. ✅ Publish to Zapstore using Nostr signing

### Script Structure

Create `scripts/publish-to-zapstore.sh`:

```bash
#!/bin/bash

# BitTasker Zapstore Publishing Script
# Usage: ./scripts/publish-to-zapstore.sh [major|minor|patch]
# Example: ./scripts/publish-to-zapstore.sh patch (default)
# Example: ./scripts/publish-to-zapstore.sh minor
# Example: ./scripts/publish-to-zapstore.sh major

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PUBLIC_REPO="gitlab.com/bittasker/zapstore"
APK_NAME_PREFIX="bittasker"

# Parse release type argument (major, minor, patch)
RELEASE_TYPE=${1:-patch}  # Default to patch if no argument

# Validate release type
if ! [[ "$RELEASE_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo -e "${RED}❌ Error: Invalid release type '${RELEASE_TYPE}'${NC}"
  echo "Usage: $0 [major|minor|patch]"
  echo ""
  echo "Examples:"
  echo "  $0 patch  - Bug fixes (1.0.0 → 1.0.1)"
  echo "  $0 minor  - New features (1.0.0 → 1.1.0)"
  echo "  $0 major  - Breaking changes (1.0.0 → 2.0.0)"
  echo "  $0        - Defaults to patch"
  exit 1
fi

# Check for required environment variables
if [ -z "$NOSTR_NSEC" ]; then
  echo -e "${RED}❌ Error: NOSTR_NSEC environment variable not set${NC}"
  echo "Set your Nostr private key: export NOSTR_NSEC='nsec1...'"
  exit 1
fi

# Check for required tools
command -v npm >/dev/null 2>&1 || { echo -e "${RED}❌ npm not found${NC}"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo -e "${RED}❌ npx not found${NC}"; exit 1; }
command -v zapstore >/dev/null 2>&1 || { echo -e "${RED}❌ zapstore CLI not found${NC}"; exit 1; }
command -v git >/dev/null 2>&1 || { echo -e "${RED}❌ git not found${NC}"; exit 1; }

# Step 1: Calculate new version based on semantic versioning
echo -e "${BLUE}📝 Calculating new version (${RELEASE_TYPE})...${NC}"

# Read current versions from build.gradle
CURRENT_VERSION_CODE=$(grep -oP 'versionCode\s+\K\d+' android/app/build.gradle)
CURRENT_VERSION_NAME=$(grep -oP 'versionName\s+"\K[^"]+' android/app/build.gradle)

if [ -z "$CURRENT_VERSION_CODE" ] || [ -z "$CURRENT_VERSION_NAME" ]; then
  echo -e "${RED}❌ Error: Could not read version from build.gradle${NC}"
  exit 1
fi

echo -e "  Current versionCode: ${CURRENT_VERSION_CODE}"
echo -e "  Current versionName: ${CURRENT_VERSION_NAME}"

# Increment versionCode
NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))

# Parse current version name (e.g., "1.2.3" → MAJOR=1, MINOR=2, PATCH=3)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION_NAME"

# Calculate new version based on release type
case $RELEASE_TYPE in
  major)
    NEW_VERSION_NAME="$((MAJOR + 1)).0.0"
    ;;
  minor)
    NEW_VERSION_NAME="$MAJOR.$((MINOR + 1)).0"
    ;;
  patch)
    NEW_VERSION_NAME="$MAJOR.$MINOR.$((PATCH + 1))"
    ;;
esac

echo -e "  New versionCode: ${NEW_VERSION_CODE}"
echo -e "  New versionName: ${NEW_VERSION_NAME}"
echo ""

echo -e "${BLUE}🚀 Publishing BitTasker v${NEW_VERSION_NAME} to Zapstore${NC}\n"

# Step 2: Update Android version in build.gradle
echo -e "${BLUE}📝 Updating build.gradle...${NC}"

# Update build.gradle with new values
# Note: On macOS use 'sed -i ""' instead of 'sed -i'
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i "" "s/versionCode $CURRENT_VERSION_CODE/versionCode $NEW_VERSION_CODE/" android/app/build.gradle
  sed -i "" "s/versionName \".*\"/versionName \"$NEW_VERSION_NAME\"/" android/app/build.gradle
else
  # Linux/Windows WSL
  sed -i "s/versionCode $CURRENT_VERSION_CODE/versionCode $NEW_VERSION_CODE/" android/app/build.gradle
  sed -i "s/versionName \".*\"/versionName \"$NEW_VERSION_NAME\"/" android/app/build.gradle
fi

# Verify update
NEW_VERSION_CODE_CHECK=$(grep -oP 'versionCode\s+\K\d+' android/app/build.gradle)
NEW_VERSION_NAME_CHECK=$(grep -oP 'versionName\s+"\K[^"]+' android/app/build.gradle)

if [ "$NEW_VERSION_CODE_CHECK" == "$NEW_VERSION_CODE" ] && [ "$NEW_VERSION_NAME_CHECK" == "$NEW_VERSION_NAME" ]; then
  echo -e "${GREEN}✓ build.gradle updated: ${CURRENT_VERSION_NAME} → ${NEW_VERSION_NAME}${NC}\n"
else
  echo -e "${RED}❌ Error: Version update verification failed${NC}"
  exit 1
fi

# Step 3: Build web app
echo -e "${BLUE}📦 Building web application...${NC}"
npm run build
echo -e "${GREEN}✓ Web app built${NC}\n"

# Step 4: Sync with Capacitor
echo -e "${BLUE}🔄 Syncing with Capacitor...${NC}"
npx cap sync android
echo -e "${GREEN}✓ Capacitor synced${NC}\n"

# Step 5: Build signed APK
echo -e "${BLUE}🔨 Building signed APK...${NC}"
cd android
./gradlew assembleRelease
cd ..

# Check if APK was built successfully
APK_DIR="android/app/build/outputs/apk/release"
UNIVERSAL_APK="${APK_DIR}/app-universal-release.apk"

if [ ! -f "$UNIVERSAL_APK" ]; then
  echo -e "${RED}❌ Error: Universal APK not found at ${UNIVERSAL_APK}${NC}"
  echo "Available files:"
  ls -la "$APK_DIR"
  exit 1
fi

echo -e "${GREEN}✓ APK built successfully${NC}\n"

# Step 6: Prepare release artifacts
echo -e "${BLUE}📁 Preparing release artifacts...${NC}"
RELEASE_DIR="dist/release"
mkdir -p "$RELEASE_DIR"

# Copy and rename APK
RELEASE_APK="${RELEASE_DIR}/${APK_NAME_PREFIX}-v${NEW_VERSION_NAME}-universal.apk"
cp "$UNIVERSAL_APK" "$RELEASE_APK"

# Get APK size
APK_SIZE=$(du -h "$RELEASE_APK" | cut -f1)
echo -e "${GREEN}✓ APK prepared: ${RELEASE_APK} (${APK_SIZE})${NC}\n"

# Step 7: Create GitLab release
echo -e "${BLUE}📤 Creating GitLab release...${NC}"

# Generate release notes from CHANGELOG.md
RELEASE_NOTES="## BitTasker v${NEW_VERSION_NAME}

### Download
- Universal APK (arm64-v8a + armeabi-v7a): ${APK_SIZE}

### Installation
1. Download the APK
2. Enable \"Install from unknown sources\" in Android settings
3. Install the APK
4. Or install via Zapstore for automatic updates

### Verification
- Package: com.bittasker.app
- Version: ${NEW_VERSION_NAME}
- Signed with BitTasker release key

### Changes
See CHANGELOG.md for full details."

# Check if GitLab CLI is available
if command -v glab >/dev/null 2>&1; then
  # Use GitLab CLI
  glab release create "v${NEW_VERSION_NAME}" \
    --repo "$PUBLIC_REPO" \
    --name "BitTasker v${NEW_VERSION_NAME}" \
    --notes "$RELEASE_NOTES" \
    "$RELEASE_APK"
  echo -e "${GREEN}✓ GitLab release created${NC}\n"
else
  echo -e "${YELLOW}⚠ GitLab CLI not found. Manual steps required:${NC}"
  echo "1. Go to https://${PUBLIC_REPO}/-/releases/new"
  echo "2. Tag: v${NEW_VERSION_NAME}"
  echo "3. Upload: ${RELEASE_APK}"
  echo "4. Release notes:"
  echo "$RELEASE_NOTES"
  echo ""
  read -p "Press Enter after creating the release manually..."
fi

# Step 8: Publish to Zapstore
echo -e "${BLUE}🏪 Publishing to Zapstore...${NC}"

# Clone public repo temporarily
TEMP_DIR=$(mktemp -d)
echo "Cloning public repository to ${TEMP_DIR}..."
git clone "https://${PUBLIC_REPO}.git" "$TEMP_DIR"

# Publish to Zapstore
cd "$TEMP_DIR"
SIGN_WITH="$NOSTR_NSEC" zapstore publish

# Check if publish was successful
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Published to Zapstore${NC}\n"
else
  echo -e "${RED}❌ Failed to publish to Zapstore${NC}"
  cd -
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Cleanup
cd -
rm -rf "$TEMP_DIR"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Successfully published BitTasker v${NEW_VERSION_NAME}!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}📋 Summary:${NC}"
echo -e "  Release type: ${RELEASE_TYPE}"
echo -e "  Version: ${CURRENT_VERSION_NAME} → ${NEW_VERSION_NAME}"
echo -e "  Version code: ${CURRENT_VERSION_CODE} → ${NEW_VERSION_CODE}"
echo -e "  APK: ${RELEASE_APK}"
echo -e "  Size: ${APK_SIZE}"
echo -e "  GitLab: https://${PUBLIC_REPO}/-/releases/v${NEW_VERSION_NAME}"
echo -e "  Zapstore: https://zapstore.dev/app/com.bittasker.app"
echo ""
echo -e "${BLUE}🎉 Users can now install BitTasker via Zapstore!${NC}"
```

Make it executable:
```bash
chmod +x scripts/publish-to-zapstore.sh
```

### Add to package.json

```json
{
  "scripts": {
    "release:zapstore": "bash scripts/publish-to-zapstore.sh"
  }
}
```

### Usage

```bash
# Set your Nostr private key (from .env or manually)
export NOSTR_NSEC="nsec1..."

# Publish a patch release (bug fixes) - default
npm run release:zapstore patch
# or simply
npm run release:zapstore

# Publish a minor release (new features)
npm run release:zapstore minor

# Publish a major release (breaking changes)
npm run release:zapstore major
```

---

## Security Considerations

### Handling Nostr Private Keys

#### Option 1: Environment Variable (Recommended for Scripts)

```bash
# In your shell or .env file (DO NOT COMMIT .env)
export NOSTR_NSEC="nsec1yourlongprivatekeyhere"

# Run script
npm run release:zapstore 1.0.0
```

#### Option 2: Secure Input (Interactive)

Modify the script to prompt for the key:

```bash
# In publish-to-zapstore.sh
if [ -z "$NOSTR_NSEC" ]; then
  echo -n "Enter your Nostr private key (nsec): "
  read -s NOSTR_NSEC
  echo ""
fi
```

#### Option 3: NIP-46 Bunker (Most Secure)

Use a remote signer like nsec.app:

```bash
# Get bunker URL from nsec.app
export SIGN_WITH="bunker://pubkey?relay=wss://relay.primal.net/&secret=..."

# Modify script to use SIGN_WITH instead of NOSTR_NSEC
```

### Protecting Your Keystore

1. **Never commit keystore files to Git**
   ```
   # .gitignore
   android/*.jks
   android/*.keystore
   android/keystore.properties
   ```

2. **Backup keystore securely**
   - Store in password manager (1Password, Bitwarden)
   - Keep offline backup on encrypted USB drive
   - Store recovery phrase separately

3. **Use strong passwords**
   - Minimum 20 characters
   - Mix of letters, numbers, symbols
   - Different password for keystore and key

### Environment Variables Best Practices

Create `.env` file (DO NOT COMMIT):

```bash
# .env
NOSTR_NSEC=nsec1yourlongprivatekeyhere
KEYSTORE_PASSWORD=your_keystore_password
KEY_PASSWORD=your_key_password
```

Load in script:

```bash
# Load .env if exists
if [ -f ".env" ]; then
  export $(cat .env | xargs)
fi
```

---

## Troubleshooting

### Common Issues

#### 1. APK Not Found After Build

**Problem**: `app-universal-release.apk` doesn't exist

**Solution**: Check if splits are configured in `build.gradle`:

```gradle
splits {
    abi {
        enable true
        reset()
        include 'arm64-v8a', 'armeabi-v7a'
        universalApk true  // Must be true
    }
}
```

#### 2. Signing Failed

**Problem**: `Execution failed for task ':app:packageRelease'`

**Solution**: 
- Verify `keystore.properties` exists
- Check keystore file path is correct
- Verify passwords are correct

```bash
# Test keystore manually
keytool -list -v -keystore android/bittasker-release-key.jks
```

#### 3. Zapstore Publish Fails

**Problem**: `zapstore publish` returns error

**Solutions**:
- Verify `zapstore.yaml` syntax is correct
- Check GitLab release exists with APK
- Verify NOSTR_NSEC is valid (starts with `nsec1`)
- Check internet connection to relays

```bash
# Test Zapstore CLI
zapstore --version

# Verify Nostr key format
echo $NOSTR_NSEC | grep -E '^nsec1[a-z0-9]{59}$'
```

#### 4. Version Mismatch

**Problem**: APK version doesn't match package.json

**Solution**: Manually update `android/app/build.gradle`:

```gradle
defaultConfig {
    versionCode 1  // Increment for each release
    versionName "1.0.0"  // Match package.json
}
```

Or use automated sync script (see Version Management section).

#### 5. Capacitor Sync Errors

**Problem**: `npx cap sync` fails

**Solutions**:
```bash
# Clear Capacitor cache
rm -rf node_modules/.cache

# Reinstall Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# Rebuild
npm run build
npx cap sync android
```

#### 6. Gradle Build Fails

**Problem**: `./gradlew assembleRelease` fails

**Solutions**:

```bash
# Clean build
cd android
./gradlew clean
./gradlew assembleRelease

# Check Java version (must be 17)
java -version

# Update Gradle wrapper
./gradlew wrapper --gradle-version=8.0
```

### Debug Mode

Add debug output to script:

```bash
# At top of script
set -x  # Print commands as they execute
set -e  # Exit on error

# Or run with bash -x
bash -x scripts/publish-to-zapstore.sh 1.0.0
```

### Getting Help

- **Zapstore Documentation**: https://zapstore.dev/docs
- **Zapstore Support**: Signal group (link on website)
- **Capacitor Docs**: https://capacitorjs.com/docs
- **Android Gradle**: https://developer.android.com/studio/build

---

## Next Steps

### Before First Release

1. ✅ Create Android keystore (keytool will create it automatically)
2. ✅ Configure signing in `build.gradle`
3. ✅ Set up public GitLab repository
4. ✅ Create `zapstore.yaml` with metadata
5. ✅ Prepare app assets (icon, screenshots)
6. ✅ Write README.md and CHANGELOG.md
7. ✅ Generate Nostr keypair for signing
8. ✅ Install Zapstore CLI
9. ✅ Test build process locally
10. ✅ Create first release manually
11. ✅ Verify on Zapstore

**Note:** No version management tools needed - the script handles it automatically!

### For Each Release

1. Update `CHANGELOG.md` with new changes
2. Run `npm run release:zapstore [patch|minor|major]` (script auto-increments everything)
3. Verify release on GitLab
4. Verify app appears on Zapstore
5. Test installation on Android device

**That's it!** The script handles all version management automatically. Just specify the release type!

### Monitoring

- Check Zapstore listing: `https://zapstore.dev/app/com.bittasker.app`
- Monitor GitLab releases: `https://gitlab.com/bittasker/zapstore/-/releases`
- Track downloads and user feedback
- Update app based on feedback

---

## Appendix

### Useful Commands

```bash
# Check APK info
aapt dump badging android/app/build/outputs/apk/release/app-universal-release.apk

# List APK contents
unzip -l android/app/build/outputs/apk/release/app-universal-release.apk

# Verify APK signature
jarsigner -verify -verbose -certs android/app/build/outputs/apk/release/app-universal-release.apk

# Get APK size
du -h android/app/build/outputs/apk/release/*.apk

# Check Gradle tasks
cd android && ./gradlew tasks
```

### References

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Zapstore Publishing Guide](https://zapstore.dev/docs/publish)
- [Zapstore FAQ](https://zapstore.dev/docs/faq)
- [Android App Signing](https://developer.android.com/studio/publish/app-signing)
- [Nostr Protocol](https://nostr.com)
- [Blossom Specification](https://github.com/hzrd149/blossom)

---

## Conclusion

This guide provides a complete workflow for publishing BitTasker to Zapstore. The key points:

1. **Capacitor does NOT overwrite native configs** - Your signing configuration is safe
2. **Universal APK is recommended** - Supports all Android devices
3. **Nostr signing is required** - Use nsec or NIP-46 bunker
4. **Public repository for releases** - GitLab hosts APKs, Zapstore reads metadata
5. **Automated script** - One command publishes everything

The manual script approach gives you full control and transparency over the publishing process, while still being efficient for regular releases.

