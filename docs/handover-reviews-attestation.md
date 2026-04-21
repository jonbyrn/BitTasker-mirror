# Handover: Reviews and Attestation Implementation

This document provides a comprehensive overview of the Reviews and Attestation system, its current implementation status, architectural details, and recommendations for further development and testing.

## 1. Project Context

The project has moved from a Merkle/ZK-based review proof model to a **Platform-Attested Review Model**. This ensures that while reviews are still user-authored Nostr events, BitTasker provides a platform-signed attestation event on Nostr only after verifying that the reviewer was a participant in a completed settlement.

### Key Objectives

- Support reviews for both tasks and service bookings.
- Publicly verifiable reviews without exposing sensitive data (wallets, escrow IDs).
- Single-review-per-settlement enforcement.
- Mobile-first, localized UI (English and Spanish).

---

## 2. Current Implementation Status

### Backend (`reviews-attestation-backend/`)

- **Status**: Highly complete.
- **Features**:
  - Hono-based HTTP API.
  - Challenge/Response flow for Nostr and Wallet signatures.
  - Settlement resolution logic for different contract types (Task Escrow, Service Quotes, Instant Buy).
  - Uniqueness enforcement using Durable Objects.
  - Rate limiting and security hardening (DoS resilience).
- **Tests**: Extensive test suite covering security, concurrency, and core logic.

### Shared Contracts (`reviews-attestation-backend/packages/reviews-contracts/`)

- **Status**: Complete.
- **Features**:
  - Single source of truth for Zod schemas, types, and constants.
  - Canonical event kinds for Reviews and Attestations.
  - SHA-256 draft hash computation for deterministic linking.

### Frontend (`src/lib/reviews/` and `src/routes/(protected)/reviews/`)

- **Status**: Partially complete / Integrated.
- **Features**:
  - `ReviewComposer`: Handles the multi-step flow (Draft -> Translation -> Challenge -> Attestation -> Publish).
  - `ReviewList` and `ReviewCard`: Display verified and pending reviews.
  - API Client: `src/lib/api/reviews/review-api.ts` implements calls to the attestation backend.
  - Routing: `/reviews` route handles pending, given, and received reviews with deep-linking support.

---

## 3. Architecture & Data Flow

### The Review Flow

1. **Draft**: User writes a review in the UI.
2. **Translation**: Review text is sent to a translation service (currently mocked or using client-side fallback).
3. **Challenge**: Client requests a challenge from the Backend (`/review-attestations/challenge`).
4. **Sign**: User signs the challenge with both their Nostr key and their Wallet.
5. **Attest**: Client sends proofs and the signed review event to the Backend (`/review-attestations`).
6. **Publish**: Backend verifies proofs, publishes an Attestation Event to Nostr, and the Client publishes the Review Event.

### Key Components

- **Cloudflare Worker**: The runtime for the attestation API.
- **Durable Objects (`ReviewStateDO`)**: Ensures atomicity and prevents double-reviewing a settlement.
- **Nostr**: The public transport for review and attestation events.
- **Viem**: Used for EVM signature verification and contract reads.

---

## 4. Key Files and Directories

| Path                                                            | Description                                          |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| `reviews-attestation-backend/src/review-attestation-service.ts` | Core backend business logic.                         |
| `reviews-attestation-backend/src/durable-object.ts`             | Persistence and uniqueness logic.                    |
| `reviews-attestation-backend/packages/reviews-contracts/src/`   | Shared types and schemas.                            |
| `src/lib/reviews/surface.ts`                                    | Frontend domain logic for processing review records. |
| `src/lib/api/reviews/review-api.ts`                             | Frontend API client for the attestation service.     |
| `src/routes/(protected)/reviews/+page.svelte`                   | Main review management UI.                           |

---

## 5. Key Rotation & Issuer Registry

The system supports multiple attestation issuers to allow for key rotation.

- **Issuer Registry**: The backend maintains a registry of valid issuers, including their public keys, key IDs, and validity windows.
- **Configuration**: The registry is configured via the `REVIEW_ATTESTATION_ISSUER_REGISTRY_JSON` environment variable in the backend.
- **Active Issuer**: The backend automatically selects the active issuer based on the current timestamp and the `validFrom`/`validUntil` fields.
- **Trust Anchor**: The frontend should verify attestation events against this registry (via `GET /review-attestation-issuers` if implemented, or a similar discovery mechanism).

---

## 6. Testing Recommendations

### Backend Tests

The backend has a very robust test suite. Always run these before deploying changes.

```bash
cd reviews-attestation-backend
npm test
```

- **`security-hardening.test.ts`**: Verifies protection against malicious signatures and malformed inputs.
- **`dos-resilience.test.ts`**: Verifies rate-limiting and IP-based protections.
- **`durable-object.concurrency.test.ts`**: Verifies that uniqueness is maintained under heavy load.

### Frontend Tests

Run the unit and component tests related to reviews.

```bash
npm run test:unit:api -- reviews/
npm run test:unit:components -- ReviewComposer.svelte
```

### End-to-End (E2E) Strategy

- **Mocking**: Use the existing mock structures in `src/lib/tests/unit/api/reviews/` to simulate backend responses.
- **Integration**: A full E2E test should run a local instance of the `reviews-attestation-backend` using `wrangler dev` and point the frontend `VITE_REVIEWS_API_URL` to it.

---

## 6. Next Steps & Implementation Tasks

1. **Translation Backend Integration**:
   - The system currently assumes a `POST /review-translations` endpoint exists. Ensure this is either implemented or properly mocked in the production environment.
2. **Environment Configuration**:
   - Set `REVIEW_ATTESTATION_ISSUER_NSEC` and `REVIEW_SLOT_HMAC_SECRET` in the backend secrets.
   - Configure `VITE_REVIEWS_API_URL` in the frontend `.env`.
3. **Settlement Registry**:
   - The backend needs a registry of "reviewable" contract addresses. This is currently passed via `REVIEWS_SETTLEMENT_REGISTRY_JSON` environment variable.
4. **Relay Strategy**:
   - Ensure the backend and frontend are using the same set of Nostr relays for publishing and fetching reviews.
5. **Mobile Testing**:
   - Verify the signature flow (WalletConnect/Web3) on Android and iOS devices, as it involves multi-app switching.

---

## 7. Known Risks & Considerations

- **Signature Latency**: Multi-signature flow (Nostr + Wallet) can be friction-heavy for users. Ensure the UI provides clear progress indicators.
- **Nostr Propagation**: There might be a delay between publishing the attestation and the review being "verified" in the UI. Implementing optimistic UI or aggressive relay polling may be necessary.
- **Privacy**: Never store the mapping between Npub and Wallet address in the backend logs or durable storage.

---

Created on: April 21, 2026
Status: Ready for Handover
