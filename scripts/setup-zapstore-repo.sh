#!/bin/bash

# Setup Zapstore Public Repository
# This script initializes the public GitLab repository with necessary files

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_URL="https://gitlab.com/bittasker/zapstore.git"
TEMP_DIR=$(mktemp -d)

echo -e "${BLUE}🚀 Setting up Zapstore public repository...${NC}\n"

# Clone or create the repo
echo -e "${BLUE}📥 Cloning repository...${NC}"
if git clone "$REPO_URL" "$TEMP_DIR" 2>/dev/null; then
  echo -e "${GREEN}✓ Repository cloned${NC}"
else
  echo -e "${YELLOW}⚠ Repository is empty, initializing...${NC}"
  mkdir -p "$TEMP_DIR"
  cd "$TEMP_DIR"
  git init
  git remote add origin "$REPO_URL"
fi

cd "$TEMP_DIR"

# Copy zapstore.yaml
echo -e "${BLUE}📝 Adding zapstore.yaml...${NC}"
cp /mnt/e/projects/upw/Bittasker-2/Bittasker/zapstore.yaml .

# Create README.md
echo -e "${BLUE}📝 Creating README.md...${NC}"
cat > README.md << 'EOF'
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
- **Developer**: Verified via Nostr

## Features

- Lightning Network payments
- Liquid Network integration
- Rootstock smart contracts
- Decentralized identity (Nostr)
- End-to-end encrypted messaging
- Multi-language support

## Support

- **Website**: https://bittasker.com
- **Issues**: Report via email or Nostr DM

## License

MIT License - See LICENSE file for details
EOF

# Create CHANGELOG.md
echo -e "${BLUE}📝 Creating CHANGELOG.md...${NC}"
cat > CHANGELOG.md << 'EOF'
# Changelog

All notable changes to BitTasker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-09

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
EOF

# Create LICENSE
echo -e "${BLUE}📝 Creating LICENSE...${NC}"
cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2025 BitTasker

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

# Create assets directory
echo -e "${BLUE}📁 Creating assets directory...${NC}"
mkdir -p assets

# Copy icon (convert from webp to png if needed)
echo -e "${BLUE}🎨 Adding app icon...${NC}"
if command -v convert >/dev/null 2>&1; then
  convert /mnt/e/projects/upw/Bittasker-2/Bittasker/icons/icon-512.webp assets/icon.png
else
  echo -e "${YELLOW}⚠ ImageMagick not found. Please manually add assets/icon.png (512x512)${NC}"
fi

# Git operations
echo -e "${BLUE}📤 Committing and pushing to GitLab...${NC}"
git add .
git commit -m "Initial commit: Setup Zapstore repository" || echo "Nothing to commit"

# Set main as default branch
git branch -M main

# Push to GitLab
git push -u origin main

echo -e "${GREEN}✓ Repository initialized and pushed${NC}\n"

# Cleanup
cd -
rm -rf "$TEMP_DIR"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Zapstore repository is ready!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  1. Add screenshots to assets/ directory"
echo -e "  2. Run: bash scripts/glab.sh to create the first release"
echo -e "  3. Publish to Zapstore"
echo ""
echo -e "${BLUE}Repository: https://gitlab.com/bittasker/zapstore${NC}"

