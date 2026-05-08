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
