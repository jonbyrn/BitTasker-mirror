# Service Book Now

This guide covers the direct-purchase path for eligible services and its fallback to negotiated quotes.

## Eligibility

- Only eligible `FIXED` and `TIERED` services can expose `Book Now`.
- Book Now listings must include the timing data required to derive a deterministic delivery schedule.
- Even when `Book Now` is available, `Request Quote` remains the fallback path for custom scope or unsupported options.

## Buyer flow

1. Open a service detail page.
2. If the listing is Book Now eligible, review the displayed price and delivery timing.
3. For tiered services, choose the tier before continuing.
4. Confirm the purchase and follow the contract handoff into the dashboard contracts experience.

## After redirect and contract handoff

1. Successful Book Now purchases should end in `Dashboard -> Contracts` with the service context active.
2. When contract creation resolves quickly, the dashboard should focus the exact contract through the `highlight=<escrowId>` target.
3. If the dashboard loads before the contract appears, refresh the contracts surface once before retrying checkout.
4. Book Now orders do not create quote timeline entries, so follow-up state should be recovered from contracts rather than quotes.

## When to use Request Quote instead

- The buyer needs custom scope, add-ons, or revisions that are not part of the Book Now offer.
- The listing is inquiry-only or the selected tier is not Book Now eligible.
- Wallet or preflight checks fail and the user wants to negotiate timing instead of retrying checkout immediately.

## Route and handoff expectations

- Book Now starts on the same service detail route used for negotiated quotes.
- Successful purchases should redirect to the contracts experience rather than the quote inbox.
- Book Now orders do not appear as quote timeline entries.

## FAQ

### When should I choose `Request Quote` instead of `Book Now`?

Use `Request Quote` when the work needs custom scope, unsupported options, negotiation, or when direct purchase is no longer eligible after revalidation.

### Why did `Book Now` disappear?

The latest service version was revalidated and is no longer Book Now eligible. The negotiated quote path remains the fallback.

### Why am I in contracts instead of quotes after purchase?

Book Now creates a service contract directly, so the authoritative follow-up state lives in the contracts experience rather than the quote inbox.

## Troubleshooting

- If eligibility disappears after refresh, assume the listing changed and re-check the latest service state before trying again.
- If wallet or preflight checks fail, keep the buyer in context with a retry option and the visible `Request Quote` fallback.
- If the direct purchase cannot proceed, do not hide the negotiated quote path.

For offline, contracts-handoff, and dashboard-route recovery steps, see [Service Troubleshooting](./troubleshooting.md).
