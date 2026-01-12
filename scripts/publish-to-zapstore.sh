#!/bin/bash

# BitTasker Zapstore Publishing Script
# Usage: ./scripts/publish-to-zapstore.sh [major|minor|patch] [publish]
# Example: ./scripts/publish-to-zapstore.sh patch        - Build APK & create GitLab release
# Example: ./scripts/publish-to-zapstore.sh patch publish - Build APK, create release & publish to Zapstore
# Example: ./scripts/publish-to-zapstore.sh minor publish - Same with minor version bump

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

# Parse arguments
RELEASE_TYPE=${1:-patch}  # Default to patch if no argument
SHOULD_PUBLISH=false

# Check if second argument is "publish"
if [ "$2" == "publish" ]; then
  SHOULD_PUBLISH=true
fi

# Validate release type
if ! [[ "$RELEASE_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo -e "${RED}❌ Error: Invalid release type '${RELEASE_TYPE}'${NC}"
  echo "Usage: $0 [major|minor|patch] [publish]"
  echo ""
  echo "Examples:"
  echo "  $0 patch         - Bug fixes (1.0.0 → 1.0.1), no Zapstore publish"
  echo "  $0 patch publish - Bug fixes (1.0.0 → 1.0.1) + Zapstore publish"
  echo "  $0 minor         - New features (1.0.0 → 1.1.0), no Zapstore publish"
  echo "  $0 minor publish - New features (1.0.0 → 1.1.0) + Zapstore publish"
  echo "  $0 major publish - Breaking changes (1.0.0 → 2.0.0) + Zapstore publish"
  exit 1
fi

# Check for required environment variables (only if publishing)
if [ "$SHOULD_PUBLISH" = true ]; then
  if [ -z "$NOSTR_NSEC" ]; then
    echo -e "${RED}❌ Error: NOSTR_NSEC environment variable not set${NC}"
    echo "Set your Nostr private key: export NOSTR_NSEC='nsec1...'"
    exit 1
  fi
fi

# Check for required tools
command -v npm >/dev/null 2>&1 || { echo -e "${RED}❌ npm not found${NC}"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo -e "${RED}❌ npx not found${NC}"; exit 1; }
command -v git >/dev/null 2>&1 || { echo -e "${RED}❌ git not found${NC}"; exit 1; }

# Only check for zapstore CLI if we're publishing
if [ "$SHOULD_PUBLISH" = true ]; then
  command -v zapstore >/dev/null 2>&1 || { echo -e "${RED}❌ zapstore CLI not found${NC}"; exit 1; }
fi

# Step 1: Calculate new version based on semantic versioning
echo -e "${BLUE}📝 Calculating version (${RELEASE_TYPE})...${NC}"

# Read current versions from build.gradle
CURRENT_VERSION_CODE=$(grep -oP 'versionCode\s+\K\d+' android/app/build.gradle)
CURRENT_VERSION_NAME=$(grep -oP 'versionName\s+"\K[^"]+' android/app/build.gradle)

if [ -z "$CURRENT_VERSION_CODE" ] || [ -z "$CURRENT_VERSION_NAME" ]; then
  echo -e "${RED}❌ Error: Could not read version from build.gradle${NC}"
  exit 1
fi

echo -e "  Current versionCode: ${CURRENT_VERSION_CODE}"
echo -e "  Current versionName: ${CURRENT_VERSION_NAME}"

# Check if this is the first release (1.0.0 with versionCode 1)
if [ "$CURRENT_VERSION_NAME" == "1.0.0" ] && [ "$CURRENT_VERSION_CODE" == "1" ]; then
  echo -e "  ${YELLOW}⚠ First release detected - keeping version 1.0.0${NC}"
  NEW_VERSION_CODE=1
  NEW_VERSION_NAME="1.0.0"
else
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
fi

echo -e "  Release versionCode: ${NEW_VERSION_CODE}"
echo -e "  Release versionName: ${NEW_VERSION_NAME}"
echo ""

if [ "$SHOULD_PUBLISH" = true ]; then
  echo -e "${BLUE}🚀 Building & Publishing BitTasker v${NEW_VERSION_NAME} to Zapstore${NC}\n"
else
  echo -e "${BLUE}🚀 Building BitTasker v${NEW_VERSION_NAME} (GitLab release only, no Zapstore publish)${NC}\n"
fi

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
  # Use GitLab CLI (but don't fail if it doesn't work)
  if glab release create "v${NEW_VERSION_NAME}" \
    --repo "$PUBLIC_REPO" \
    --name "BitTasker v${NEW_VERSION_NAME}" \
    --notes "$RELEASE_NOTES" \
    "$RELEASE_APK" 2>/dev/null; then
    echo -e "${GREEN}✓ GitLab release created${NC}\n"
  else
    echo -e "${YELLOW}⚠ GitLab CLI failed (may need token permissions). Continuing anyway...${NC}"
    echo -e "${YELLOW}  Manual steps to create release:${NC}"
    echo "  1. Go to https://${PUBLIC_REPO}/-/releases/new"
    echo "  2. Tag: v${NEW_VERSION_NAME}"
    echo "  3. Upload: ${RELEASE_APK}"
    echo ""
  fi
else
  echo -e "${YELLOW}⚠ GitLab CLI not found. Manual steps required:${NC}"
  echo "1. Go to https://${PUBLIC_REPO}/-/releases/new"
  echo "2. Tag: v${NEW_VERSION_NAME}"
  echo "3. Upload: ${RELEASE_APK}"
  echo "4. Release notes:"
  echo "$RELEASE_NOTES"
  echo ""
fi

# Step 8: Publish to Zapstore (conditional)
if [ "$SHOULD_PUBLISH" = true ]; then
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
else
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✅ Successfully created GitLab release v${NEW_VERSION_NAME}!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

  echo -e "${BLUE}📋 Summary:${NC}"
  echo -e "  Release type: ${RELEASE_TYPE}"
  echo -e "  Version: ${CURRENT_VERSION_NAME} → ${NEW_VERSION_NAME}"
  echo -e "  Version code: ${CURRENT_VERSION_CODE} → ${NEW_VERSION_CODE}"
  echo -e "  APK: ${RELEASE_APK}"
  echo -e "  Size: ${APK_SIZE}"
  echo -e "  GitLab: https://${PUBLIC_REPO}/-/releases/v${NEW_VERSION_NAME}"
  echo ""
  echo -e "${YELLOW}⚠ Not published to Zapstore (no 'publish' argument)${NC}"
  echo -e "${BLUE}To publish to Zapstore, run: npm run release:zapstore ${RELEASE_TYPE} publish${NC}"
fi

