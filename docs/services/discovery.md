# Service Discovery

## Public Browse And Detail Routes

- Public services browse page: `/services`
- Public service detail page: `/services/[serviceId]`
- Homepage discovery entry point: `Featured Services`

## Homepage Featured Services

- The homepage `Featured Services` section links directly to the canonical public service detail route.
- Cards remain read-only in this surface.
- The homepage CTA is `View Service`.
- Pricing falls back to `Request Quote` when a service does not expose a fixed or tiered price snapshot for display.

## Browse-Route Continuity

- `View All` from the homepage opens `/services`.
- `Browse Services` from the homepage opens `/services`.
- Detail pages keep the same public route regardless of whether the service was opened from the homepage or the browse page.

## Quote And Purchase Entry Points

- Buyers can use `Request Quote` from the public service detail page.
- Eligible listings can also expose `Buy Now` on the public service detail page.
- Homepage cards do not open quote or purchase flows directly; they always route through `View Service` first.
