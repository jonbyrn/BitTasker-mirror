# Service Quotes

This guide covers the negotiated service flow for listings that use `Request Quote` instead of a direct purchase.

## What users see

- Service discovery starts on `/services` and service detail pages live at `/services/[serviceId]`.
- Quote requests begin from the service detail page and stay tied to that service listing.
- Providers review incoming quote requests from `Dashboard -> My Services -> Quotes`.
- Taskers review their own requests and provider replies from `Dashboard -> Quotes -> My Quotes`.

## Tasker flow

1. Open a service detail page.
2. Use `Request Quote` when the work needs custom scope, custom timing, or pricing is marked `Request Quote`.
3. Submit a title, description, optional custom-form responses, and optional images.
4. After publish succeeds, the dashboard deep-link should land on the quotes area with the matching tasker context focused.

## Provider flow

1. Open `Dashboard -> My Services`.
2. Select the relevant service and open its quotes view.
3. Review the exact request thread before drafting a proposal.
4. Reply with scope, delivery, and pricing details from the proposal composer.

## Statuses and acceptance

- After a provider replies, the tasker reviews the proposal from `Dashboard -> Quotes -> My Quotes`.
- Proposal threads can remain visible even after the listing changes so users can recover historical context.
- When the tasker accepts a funded proposal successfully, the next active state moves into the service contracts experience.
- Converted or historical quote rows should be treated as read-only context; use the follow-up contract link instead of trying to restart the same request thread.

## After redirect and contract handoff

1. A successful funded acceptance should hand off into `Dashboard -> Contracts` with the service context active.
2. The contract route may include a focused `highlight=<escrowId>` target so the exact contract can be surfaced when multiple service contracts exist.
3. If the dashboard opens before the contract is visible, refresh the contracts surface once before retrying the original acceptance flow.

## Deep links and routing

- Tasker quote deep links normalize to `tab=quotes&view=tasker`.
- Provider deep links normalize to the matching `my-services` quotes context for the selected service.
- Exact-focus links should only highlight an existing request or proposal; invalid focus targets are cleared instead of leaving stale state in the URL.

## FAQ

### What happens after a provider replies?

The tasker reviews the proposal in `My Quotes`, then either continues the negotiation or accepts the funded proposal and moves into contracts.

### Why is an old quote row still visible?

Historical rows remain visible so users can recover the original request/proposal context and use `View Contract` when a service contract already exists.

### What if a linked request or proposal is no longer available?

Invalid focus targets should be cleared by the route normalization logic. Refresh the quotes surface once and confirm the thread still exists before retrying the link.

## Troubleshooting

- If quote publish fails, keep the draft values and uploaded images in place and retry from the same modal.
- If a dashboard deep link opens without the expected thread focused, refresh the quotes surface once and confirm the linked request still exists.
- If wallet or provider prerequisites block proposal publish, stay in the quotes context and resolve the prerequisite before retrying.
- If a service was converted or removed, treat the quote thread as historical and do not start a new proposal from that listing state.

For broader wallet, offline, and contracts-handoff recovery steps, see [Service Troubleshooting](./troubleshooting.md).
