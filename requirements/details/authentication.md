# BitTasker Authentication System

## Overview

BitTasker offers a decentralized platform for hiring and task management with modern authentication options. This document outlines the authentication flow and UI requirements.

## Navigation Changes

- Replace the **Get Started** button in navbar with:
  - **Login** button
  - **Signup** button (in that order)

## Authentication Methods

BitTasker supports the following authentication methods:

- Passkey/Biometric authentication (WebAuthn)
- Alby Connect integration
- Nostr key import (for existing Nostr users)

## User Flows

### 1. Login Flow

#### Login Page (`/login`)

**Header:**

- BitTasker logo

**Content:**

- Heading: "Login to BitTasker"
- Subtext: "Hire for gigs, pay in Bitcoin or Fiat. Own your data and reputation."
- Explanation: "Login with your Passkey/Biometrics, or [Alby Connect](https://getalby.com) account."
- Login method buttons (Passkey, Alby Connect)
- "Recover Account" link (pointing to `/recover`)

**Post-login:** Redirect to Browse Tasks screen

### 2. Signup Flow

#### Signup Page (`/signup`)

**Header:**

- BitTasker logo (centered)

**Content:**

- Heading: "Signup for BitTasker"
- Subtext: "Hire for gigs, pay in Bitcoin or Fiat. Own your data."
- Explanation: "To get started, signup with a next-gen Passkey/Biometric login, or your [Alby Connect](https://getalby.com) account."
- Note: "If you have an existing account on [Nostr](https://nostr.com/), you'll be able to import it on the next step."
- Signup method buttons
- Cloudflare Captcha
- "Login" link (pointing to `/login`)

**Note:** All external links should open in new windows

### 3. Onboarding Process

#### Onboarding Screen 1: Account Setup

**Options:**

- Create new Nostr Key OR Import existing key
- Username field (with availability verification)
- Optional recovery password with warning and explanation

#### Onboarding Screen 2: Profile Information

**Fields:**

- Display name
- Profile picture upload - Use and update Uploader.svelte accordingly
- Professional title (e.g., Plumber, Handyman)
- Profile description (minimum 200 characters)
- Skills tags (freeform multi-text input, transforms into removable tags, 20 max) - Use and update Tags.svelte component accordingly
- "Save for later" option

#### Onboarding Screen 3: Location Setup

- Full screen map
- Search bar for location
- Pin placement
- Service radius setting

#### Onboarding Screen 4: Completion

**Content:**

- Large success checkmark (rounded)
- Heading: "You're all set!"
- Message: "Welcome to BitTasker, the Decentralized Workforce. You're ready to start browsing and posting tasks."
- "Continue" button (redirects to Browse Tasks screen or "Saved for later" state)

## Implementation Notes

### Technical Considerations

- Implement WebAuthn for Passkey/Biometric authentication
- Integrate with Alby Connect for Lightning Network authentication
- Support Nostr key creation and import

### Open Questions

1. When should we translate profile titles, descriptions, and skill tags to optimize efficiency?
2. Where should translations be stored (Nostr, DB)?
3. What languages should we translate into automatically besides English and Spanish?

## Assets

- BitTasker logo is available at `static/logo.svg`

## Resources

- Cloudflare captcha client side: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- Cloudflare captcha server side: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare captcha get started: https://developers.cloudflare.com/turnstile/get-started/
- Cloudflare captcha testing keys: https://developers.cloudflare.com/turnstile/troubleshooting/testing/
