# Execution plan: Service quotes

Complements the main plan `services-listing-feature-plan.md`. Focus: **receiving quotes (taskee)** and **managing sent quotes (tasker)** up to contract creation.

---

## 1. Quote request types

Any request a **tasker** sends about a service is a **quote**. The type depends on the service’s pricing:

| Service type   | Tasker action                                               | Quote payload |
|----------------|-------------------------------------------------------------|---------------|
| **inquiry_required** | “Request quote” → modal with inquiry form | `type: 'inquiry'`, `formResponses`, `message`, `photos` |
| **fixed**       | “Request” / “Hire” → confirm price + add-ons + rush (if applicable) | `type: 'fixed'`, `selectedAddOns`, `rushDelivery` |
| **hourly**      | Same as fixed: add-ons + rush                               | `type: 'hourly'`, `selectedAddOns`, `rushDelivery` |
| **tiered**      | Select tier + add-ons + rush → “Request”                    | `type: 'tiered'`, `tierId`, `selectedAddOns`, `rushDelivery` |

- **inquiry_required:** flow already exists (Request Quote → inquiry modal → DM with `message_type: 'service_inquiry'`).
- **fixed / hourly / tiered:** on the service page (tasker view), add a CTA such as “Request” or “Hire” that opens a confirmation step (tier if applicable, add-ons, rush) and on submit creates a **quote** using the same DM pattern (tags + JSON content), but with `message_type: 'service_quote_request'` and payload with `pricingType`, `tierId` (if tiered), `selectedAddOns`, `rushDelivery`, etc.

---

## 2. Taskee panel: My Services → View quotes

### 2.1 Changes in My Services

- **Component:** `DashboardMyServicesPanel.svelte`
- **New button per service:** “View quotes” (next to View / Edit).
- **Action:** Navigate to a quotes view for that service (reusing the “bids per task” pattern).

### 2.2 Route or view for quotes per service

- **Options:**
  - **A)** Dedicated route: `/dashboard/service/[serviceId]/inquiries` (or `/quotes`) that shows only that service’s quotes.
  - **B)** Drawer/panel in the dashboard (like Tasks with “bids” tab) so that clicking “View quotes” opens the quotes panel for the selected service.

Recommendation: **A)** to stay consistent with the current plan (`service/[serviceId]/inquiries`).

### 2.3 View content (taskee)

- **Reuse:** pattern from `BidsPanel.svelte` / `DashboardBidsPanel.svelte` but for **received quotes** (inquiries + fixed/tiered/hourly quote requests).
- **List:** quote cards with:
  - Tasker (name, avatar).
  - Date.
  - Type: “Inquiry form” vs “Request with tier/fixed price”.
  - Summary: form responses (inquiry) or tier/price selected (fixed/tiered/hourly).
- **Detail drawer** (reuse `BidDetailsDrawer.svelte` pattern):
  - Full quote data.
  - **Taskee actions:**
    1. **Reject:** mark quote as rejected and optionally notify.
    2. **Make offer:** open offer form (price/delivery proposal).

### 2.4 “Make offer” form (taskee)

- **Reuse:** same component as in Find task when the taskee makes an offer on a task (`BidForm.svelte`) or the planned `ServiceProposalForm.svelte`.
- **Difference:** here the offer is from the **taskee to the quote** sent by the tasker (amount, payment type FIXED/HOURLY, description, duration, etc.).
- **Submission:** bid/proposal-style event with tags `service`, `inquiry_id` or `quote_request_id`, `message_type: 'proposal'`, etc., and DM to the tasker.

---

## 3. Tasker panel: New “My quotes” tab

### 3.1 Dashboard

- **File:** `src/routes/(protected)/dashboard/+page.svelte`
- **New tab:** “My quotes” (e.g. `id: 'my-quotes'`).
- **Content:** list of **quotes I (tasker) have sent** (inquiries + fixed/tiered/hourly quote requests).

### 3.2 “My quotes” list

- **Data source:** DMs or events of type inquiry/quote_request where I am the author (tasker) and the recipient is the service’s taskee.
- **Card per quote:**
  - Service (title, link).
  - Taskee (name, avatar).
  - Date.
  - Status: pending, responded (with offer), rejected, accepted (contract created).
  - If the taskee sent an offer: amount, short description.

### 3.3 Tasker actions per quote

- **Remove:** withdraw or archive the quote (does not delete the DM; only marks in UI or in tags as “cancelled” by the tasker).
- **Accept offer:** if the taskee already sent an offer (proposal), “Accept offer” button that triggers the **contract creation flow** (only the tasker can create the contract, same as for tasks).

### 3.4 “Accept offer” → Contract flow

- **Reuse:** logic from `BidAcceptanceForm.svelte` / `acceptBidAndCreateEscrow` but in **service** context (serviceId, proposal event, etc.).
- **Steps:**
  1. Tasker clicks “Accept offer” on a quote that has a proposal.
  2. Acceptance flow opens (modal/page) with summary: amount, taskee, service, estimated dates.
  3. **Pre-validation** (as in main plan):
     - Check latest service version (via `d` tag) before creating escrow.
     - Service active, prices consistent with the offer.
  4. Tasker confirms and escrow/contract creation is called (adapt `acceptBidAndCreateEscrow` or equivalent for service proposals).
  5. On success: contract created, quote/proposal status set to “accepted”.

---

## 4. Service with fixed / tiered (tasker view): create quote

### 4.1 Service detail page

- **Component:** `ServiceDetailsView.svelte` (and/or public service page).
- **For fixed / hourly / tiered pricing:** in addition to “Contact”, show a primary button such as **“Request”** or **“Hire”**.

### 4.2 “Request” flow (fixed / hourly / tiered)

- **Tiered:** tasker has already chosen the tier in the selector; optionally add-ons and rush. “Request” button → confirmation (summary: tier, add-ons, total) → submit.
- **Fixed / Hourly:** add-ons and rush selector if applicable → “Request” → confirmation → submit.
- **Submission:** create quote event/DM with:
  - `message_type: 'service_quote_request'` (or equivalent tag).
  - Payload: `pricingType`, `tierId` (if tiered), `selectedAddOns`, `rushDelivery`, `serviceId`, `taskerNpub`, etc.
- Same notification/inbox layer as inquiries so the taskee sees the request under “View quotes”.

### 4.3 Reusing the service creation component

- Review `ServiceTierSelector.svelte`, `ServiceAddOnsSelector.svelte` and logic in `ServicePricing.svelte` / list-service steps to:
  - Show the same tier and add-ons selector on the public view.
  - Compute total (tier or fixed + add-ons + rush) and pass it in the quote payload when clicking “Request”.

---

## 5. Summary of components and routes

| Element | Action |
|--------|--------|
| `DashboardMyServicesPanel.svelte` | Add “View quotes” button per service → link to `/dashboard/service/[serviceId]/inquiries` (or chosen name). |
| New route `dashboard/service/[serviceId]/inquiries` | Page with service quote list + detail drawer; actions Reject / Make offer. |
| Quote list component | New or adapt `BidsPanel` → `ServiceQuotesPanel.svelte` (quotes received per service). |
| Quote detail component | New or adapt `BidDetailsDrawer` → `ServiceQuoteDetailsDrawer.svelte`. |
| Offer form (taskee) | Reuse `BidForm.svelte` or `ServiceProposalForm.svelte` (taskee’s offer to tasker). |
| Dashboard `+page.svelte` | New “My quotes” tab. |
| New route or panel “My quotes” | List of quotes sent by the tasker; actions Remove / Accept offer. |
| Accept offer (tasker) | Reuse flow `BidAcceptanceForm` + `acceptBidAndCreateEscrow` adapted for service/proposal. |
| `ServiceDetailsView.svelte` | For fixed/tiered/hourly: “Request” button + confirmation flow (tier, add-ons, rush) and quote submission. |

---

## 6. Event types / tags (reminder)

- **Quote (tasker → taskee):**
  - Inquiry: already defined (`message_type: 'service_inquiry'`, etc.).
  - Quote request (fixed/tiered/hourly): `message_type: 'service_quote_request'`, payload with `pricingType`, `tierId`, `selectedAddOns`, `rushDelivery`, `serviceId`, etc.
- **Proposal (taskee → tasker):** reuse bid structure with `message_type: 'proposal'`, tags `service`, `inquiry_id` or `quote_request_id`, and bid-like content (amount, payment type, description, etc.).

---

## 7. Suggested implementation order

1. **Types and utilities:** define type `ServiceQuoteRequest` (inquiry vs fixed/hourly/tiered) and helpers to parse/create quote DMs.
2. **Taskee – View quotes:** button in My Services + route `dashboard/service/[serviceId]/inquiries` + list + drawer + actions Reject / Make offer (with reused form).
3. **Tasker – My quotes:** tab in dashboard + list of sent quotes + Remove + Accept offer with contract flow.
4. **Fixed/tiered/hourly – Request:** in `ServiceDetailsView`, “Request” button + confirmation flow (tier, add-ons, rush) + quote request submission.
5. **Contract integration:** connect “Accept offer” (tasker) to escrow/contract creation (adapt `acceptBidAndCreateEscrow` or equivalent for service proposals).
6. **Translations and tests:** i18n keys for “View quotes”, “My quotes”, “Request”, “Reject”, “Make offer”, “Accept offer”, “Remove”; E2E tests per quote type.

---

This plan integrates with section 4.6.3 (Create Service Inquiry Management) and the proposed reuse of `BidForm` / `BidsPanel` / `BidDetailsDrawer` / `BidAcceptanceForm` from the main document.
