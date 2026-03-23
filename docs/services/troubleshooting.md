# Service Troubleshooting

This guide covers the recovery paths that should remain available when quote, Book Now, wallet, or contracts handoff flows cannot complete on the first attempt.

## Route conventions

- Public discovery starts on `/services`.
- Service detail routes use `/services/[serviceId]`.
- Tasker quote inbox routes normalize to `/dashboard?tab=quotes&view=tasker`.
- Provider quote triage routes normalize to `/services/manage?tab=quotes&service=<encodedServiceAddress>`.
- Service contracts routes normalize to `/dashboard?tab=contracts&context=services&highlight=<escrowId>`.

## Wallet and preflight recovery

- If a quote accept or Book Now create action fails preflight, stay on the same surface and resolve the wallet/network issue before retrying.
- Treat missing wallet readiness, wrong network, balance failures, or invalid listing snapshots as fail-closed conditions.
- Do not leave the quotes or service-detail context just because preflight failed.
- If direct purchase is blocked, keep `Request Quote` visible as the negotiated fallback.

## Offline and partial-data recovery

- If the UI shows stale data, reconnecting state, or partial relay data, avoid state-changing actions until the required data reloads.
- Use the nearest in-context retry affordance first instead of navigating away.
- If a request or proposal thread does not focus correctly after reconnect, refresh the current quotes surface once before changing tabs.
- If a listing changed while the page was open, reload the latest service state and re-check eligibility before attempting a new quote or purchase action.

## Contracts handoff recovery

- Successful funded quote accepts and Book Now orders should end in the service contracts view, not in the quote inbox.
- If the redirect lands without the expected contract highlighted, reload the contracts dashboard once and keep the `context=services` filter intact.
- If escrow confirmation resolves after the initial redirect window, reopen the contracts dashboard with the same `highlight=<escrowId>` target instead of restarting the purchase flow.
- Converted or historical quote rows should stay visible read-only and expose `View Contract` when a contract already exists.

## When to stop retrying

- Stop retrying the current action when the listing was deleted, converted, or is no longer eligible for the intended path.
- Stop retrying direct purchase when the service now requires custom scope, unsupported add-ons, or unsupported delivery options.
- Stop retrying provider proposal publish until the blocking prerequisite is resolved if the provider surface indicates a wallet or provider readiness requirement.

## FAQ

### Why did `Book Now` disappear after I opened the service?

The listing was revalidated and the latest version is no longer Book Now eligible. Use `Request Quote` if custom work is still possible.

### Why am I on contracts instead of quotes after purchase?

Funded quote accepts and Book Now purchases become service contracts immediately, so the follow-up state belongs in the contracts experience.

### Why is my old quote row still visible after the contract exists?

Historical quote rows remain visible so the user can recover context and follow the `View Contract` path without losing the original request/proposal trail.
