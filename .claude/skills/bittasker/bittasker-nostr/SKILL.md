---
name: bittasker-nostr
description: 'Use when writing or modifying ANY Nostr-related code. Examples: working with NDK, Nostr events, relays, NIPs, DMs, wallet integration, identity/auth, or Nostr utilities.'
---

# Nostr Development — BitTasker

## Core Rules

- **NDK v3 is the primary SDK** — use `@nostr-dev-kit/ndk`, not bare `nostr-tools`
- **ALWAYS consult `mcp__nostrbook__*` before writing Nostr code** — check NIPs, kinds, and tags
- NIP-07 handles browser extension signing; NIP-17 for direct messages
- Nostr is used for: identity/auth, events, DMs, wallet, and social features
- Key libraries: `@nostr-dev-kit/ndk`, `@nostr-dev-kit/svelte`, `@nostr-dev-kit/wallet`, `@nostr-dev-kit/wot`
- Nostr utilities live in `src/lib/utils/nostr*.ts` and `src/lib/nostr/`

## NostrBook MCP Tools

- `read_nip` — read any NIP by number (e.g., "01", "C7")
- `read_kind` — read event kind documentation
- `read_tag` — read tag documentation (e.g., "p", "e")
- `read_protocol` — protocol basics (event, filter, client, relay)
- `read_nips_index` — full index of NIPs, kinds, and tags
- `fetch_event` — fetch a Nostr event by nip19 identifier

## Production Reliability

Nostr powers identity, events, DMs, and wallet — it must be treated as production infrastructure.

- **NDK lifecycle**: Use NDK's built-in connection management. Don't manually manage WebSocket connections. NDK handles reconnection, queueing, and subscription management
- **Event publishing**: Use NDK's `publish()` and verify publication via a follow-up query to confirm the event was persisted
- **NIP-07 error states**: Handle all browser extension states — not installed, locked, user rejected, network error. Surface clear guidance to users for each case
- **Relay timeouts**: Set reasonable timeouts (10-15s) for relay queries. Show loading state while waiting, error state on timeout — never hang indefinitely
- **Offline queuing**: Queue events locally when offline (NDK handles this). Don't silently drop events when network is unavailable — see `src/lib/utils/network-status.ts`
- **Content validation**: Never trust Nostr event content from relays. Validate all event fields (kind, tags, pubkey, created_at) before processing. Sanitize user-generated content before rendering
