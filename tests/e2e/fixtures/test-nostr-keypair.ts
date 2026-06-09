/**
 * Test Nostr keypair for E2E tests.
 *
 * This is a DUMMY keypair generated for testing only — it holds no real funds
 * and is not associated with any real identity. Never use this in production.
 *
 * The nsec (private key) is used to authenticate in the browser without
 * triggering native passkey/WebAuthn prompts, which don't work in headless
 * or automated browsers (Firefox, WebKit, CI environments).
 *
 * To generate a fresh test keypair:
 *   node -e "
 *     const { generatePrivateKey, getPublicKey } = require('nostr-tools');
 *     const { nip19 } = require('nostr-tools');
 *     const sk = generatePrivateKey();
 *     console.log('nsec:', nip19.nsecEncode(sk));
 *     console.log('npub:', nip19.npubEncode(getPublicKey(sk)));
 *     console.log('hex:', sk);
 *   "
 *
 * To seed the auth data for cross-browser tests:
 *   npx tsx tests/e2e/scripts/seed-auth.ts
 */
export const TEST_NOSTR_NSEC = 'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3';
