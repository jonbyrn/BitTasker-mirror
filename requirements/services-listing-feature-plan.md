# Services Listing Feature Implementation Plan

## 1. Overview

This document outlines the plan for implementing a comprehensive Services Listing feature within BitTasker, allowing users (Taskees) to list and manage public service listings that showcase their skills and offerings. The feature extends **NIP-99 (Classified Listings)** to support BitTasker's advanced service features while maintaining interoperability with standard Nostr clients.

**NIP-99 Compatibility:** This implementation uses NIP-99 as the base standard and extends it with custom tags and features for advanced functionality (service tiers, simple add-ons, inquiry forms, etc.). Basic service information (title, summary, location, price) is stored in NIP-99 compatible tags for interoperability.

**Execution Authority (AI Builder):** Section `4` is the only implementation authority for sequencing, scope, and completion. Sections `1-3` and `6-9` are context/reference and must not override Section `4` statuses, dependencies, or gates.

**Component Reuse Strategy:** This plan maximizes code reuse from the existing task creation system. Many components can be directly reused or adapted, significantly reducing development time and maintaining consistency across the platform. See section `4.0` for locked implemented baseline and reuse boundaries.

### 1.1. Plan Purpose

The Services Listing feature enables:
- **Service Providers (Taskees)** to list detailed service offerings showcasing their expertise
- **Taskers (Clients)** to discover and browse available services
- **Public Service Pages** accessible via Nostr events, similar to task pages
- **Service Discovery** through search and filtering capabilities matching the task discovery system
- **Service Management** allowing providers to list, edit, and deactivate their service listings

### 1.2. Component Reuse Strategy

**Maximizing Code Reuse from Task Creation System:**

This plan identifies significant opportunities to reuse and adapt existing task creation components, reducing development time by an estimated **40-50%** while maintaining consistency across the platform.
Status labels in this section are historical context; implementation authority and current state are defined in Section `4`.

**Directly Reusable Components (Import as-is):**
- ✅ `CategoryMultiselect.svelte` - Category selection (max 3)
- ✅ `SkillsMultiselect.svelte` - Skills input (max 10)
- ✅ `EnhancedLocationPicker.svelte` - Location selection with map integration
- ✅ File upload service (`uploadService`) - Change folder to 'services'
- ✅ Image compression utilities - Reuse as-is
- ✅ Crypto price service - Currency conversion

**Adaptable Components (Modify for Services):**
- 🔄 `TaskBasics.svelte` → `ServiceBasics.svelte` - Remove deadline fields, keep title/description/categories/skills
- 🔄 `TaskLocation.svelte` → `ServiceLocation.svelte` - Adapt for multiple location types with service radius
- 🔄 `TaskBudget.svelte` → Split into:
  - `ServicePricing.svelte` - Pricing logic (budget type → pricing type)
  - `ServicePortfolio.svelte` - File upload logic (change folder to 'services')
- 🔄 `TaskReview.svelte` → `ServiceReview.svelte` - Adapt summary display for service fields
- 🔄 `TaskCard.svelte` → `ServiceCard.svelte` - Adapt card display for services
- 🔄 `TaskDetailsView.svelte` → `ServiceDetailsView.svelte` - Adapt detail view for services

**Reusable Patterns:**
- ✅ Wizard step navigation pattern (from create-task route)
- ✅ Form validation pattern
- ✅ Draft auto-save pattern
- ✅ Store state management pattern (from task.store.ts)
- ✅ Tag generation pattern (from task.ts)
- ✅ Search/filter pattern (from findTasks.ts)
- ✅ Error handling pattern
- ✅ Loading states pattern
- ✅ Translation integration pattern

**New Components (No Task Equivalent):**
- ✨ `ServiceTiers.svelte` - Service tier management
- ✨ `ServiceAddOns.svelte` - Simple add-ons/extras management
- ✨ `InquiryFormBuilder.svelte` - Custom inquiry form builder


### 1.3. Key Differentiators from Tasks

While services share many similarities with tasks, key differences include:
- **Persistent Listings**: Services remain active until explicitly deactivated (unlike tasks which have deadlines/completion)
- **Provider-Focused**: Services showcase what a provider offers, not what a client needs
- **Portfolio Showcase**: Services can include portfolios, work samples, and detailed service descriptions
- **Service Radius**: For services offering "at Tasker's location" option, providers set their own service location (where they operate from) and a service radius indicating how far they're willing to travel from that location
- **Pricing Models**: Services can offer fixed pricing, hourly rates, service tiers, simple add-ons/extras, or inquiry-based pricing (require Tasker to request a quote for details)
- **Service Tiers**: Multiple pricing tiers with different features/levels (like Fiverr packages)
- **Simple Add-Ons**: Optional extras with fixed prices (like Fiverr extras) - available for all pricing types except inquiry-based
- **Inquiry Forms**: Customizable inquiry forms for services requiring quotes (message field and photo upload are always available)
- **Proposal System**: Taskees can respond to inquiries with pricing proposals in a dedicated service-quote domain (adjacent to tasks, not reusing task bid kinds/stores)
- **Location Types**: Multiple select location options (remote, at Tasker's location, at Taskee's location) with per-distance charges when applicable
- **Service Categories**: Organized by service type rather than task categories

### 1.3. Business Value

- **Increased Platform Value**: Enables two-sided marketplace (both task posting and service offering)
- **Provider Discovery**: Makes it easier for Taskers to find qualified service providers
- **Provider Marketing**: Gives Taskees a way to market their services proactively
- **Competitive Advantage**: Differentiates BitTasker from task-only platforms
- **Revenue Opportunities**: Potential for featured service listings and premium service packages

## 2. Current Status

### 2.1. Existing Infrastructure

**Available Components:**
- ✅ Task creation form with multi-step wizard (`src/routes/(protected)/dashboard/create-task/`)
- ✅ Task detail pages with public access (`src/routes/tasks/[taskId]/`)
- ✅ Task search and filtering system (`src/lib/nostr/findTasks.ts`)
- ✅ Task store management (`src/lib/stores/task.store.ts`)
- ✅ Nostr event publishing for tasks (`src/lib/nostr/task.ts`)
- ✅ Translation system for multilingual content
- ✅ File upload service for attachments/portfolios
- ✅ Location services integration
- ✅ Contracts/task lifecycle surfaces (`DashboardContractsPanel`, `ContractCard`, `ContractDrawer`, `ContractActions`, `TaskCompletionModal`) that must be adapted rather than duplicated for service contracts

**Reusable Patterns:**
- ✅ Multi-step form wizard pattern
- ✅ Nostr event kind system (using 31000+ range)
- ✅ Tag-based filtering and search
- ✅ Public page routing with SEO optimization
- ✅ Draft saving and auto-recovery
- ✅ Translation generation and storage
- ✅ NIP-99 compatible tag structure (for interoperability)

**NIP Standards Used:**
- ✅ **NIP-01:** Basic protocol (events, tags, kinds)
- ✅ **NIP-16:** Parameterized replaceable events (for service updates)
- ✅ **NIP-33:** Parameterized replaceable events (same as NIP-16)
- ✅ **NIP-19:** Bech32-encoded entities (`naddr1...`) - standard Nostr format for parameterized replaceable events, encodes `pubkey`, `kind`, `d` tag, and optional relays
- ✅ **NIP-44:** Encryption (for secure service data if needed)
- ✅ **NIP-50:** Full-text search (for service discovery and search functionality)
- ✅ **File Upload Service:** Direct file uploads for portfolio items and inquiry form photos (same as task attachments)
- ✅ **NIP-99:** Classified Listings (base standard, extended for advanced features)

### 2.2. Gaps to Address

**Implementation Status (as of 2026-03-10):**

**Components and Flows:**
- ✅ Service listing form and wizard implemented (`/dashboard/create-service`, service step components, service store)
- ✅ Service browse + detail pages implemented (`/services`, `/services/[serviceId]`) with auth-aware behavior in the same public route
- ✅ Service search/discovery implemented (`findServices`, service indexing/filter UI)
- ✅ Service store management implemented (`service.store.ts`)
- 🟡 Service-specific Nostr event handling is partial:
  - ✅ Service listing lifecycle events are implemented (`30402`/`30403`)
  - ❌ Canonical service quote/proposal/status events (`6420`/`6421`/`6422`) are not implemented yet
- ✅ Service portfolio/gallery components implemented (wizard + detail display support)
- ✅ Service pricing models implemented (fixed, hourly, tiered, inquiry-required)
- 🟡 Service location-type management is partial:
  - ✅ Types/enums/search filters support location type sets
  - 🟡 Create-service step currently uses a single active location selection in UI; planned target remains full multi-select parity
- ✅ Per-distance charge configuration and display implemented
- ✅ Service tier management implemented
- ✅ Simple add-ons/extras system implemented
- ✅ Customizable inquiry form builder implemented
- 🟡 Inquiry form submission with photo upload is partial:
  - ✅ Modal + validation + attachment payload collection are implemented
  - ❌ Canonical publish to service-quote protocol is not implemented yet (current handlers are placeholder logging)
- 🟡 Service contract post-delivery UX is partial:
  - ✅ Shared contract actions, disputes/cancellation patterns, and completion modal already exist for task contracts
  - ❌ Service-aware wording, agreement-detail exposure, and shared task/service action-component refactor are not implemented yet

**Types and Enums:**
- ✅ Service-related TypeScript types implemented (`service.d.ts`)
- ✅ Service pricing type enums implemented (including `INQUIRY_REQUIRED`)
- ✅ Service location type enums implemented
- ✅ Service tier types implemented
- ✅ Add-on types implemented
- ✅ Inquiry form field types implemented
- 🟡 Service status is implemented as NIP-99 compatible type (`ServiceStatus`) rather than a dedicated enum

## 3. Architecture Overview

### 3.1. Nostr Event Structure

**NIP-99 Compatibility:** This implementation extends **NIP-99 (Classified Listings)** to support BitTasker's advanced service features while maintaining interoperability with standard NIP-99 clients.

**Service Event Kind:** NIP-99 Standard Kinds
- **Active Services:** `kind: 30402` (NIP-99 standard for active classified listings)
- **Draft Services:** `kind: 30403` (NIP-99 standard for draft classified listings)
- **Decision:** Use NIP-99 standard kinds for full interoperability and discoverability
- **Interoperability:** Standard NIP-99 clients can discover and read basic service information
- **Extension:** Add custom tags for advanced features (tiers, add-ons, inquiry forms) without conflicting with NIP-99 standard tags

**Event Structure:**
```typescript
{
  kind: status === 'active' ? 30402 : 30403, // NIP-99: 30402 for active, 30403 for drafts
  content: {
    // Full service data (JSON stringified) - includes all advanced features
    title: string;
    description: string;
    serviceLocationTypes: ServiceLocationTypeEnum[]; // Multiple select: 'remote' | 'tasker_location' | 'taskee_location'
    locationDetails?: ServiceLocationDetails;
    pricing: {
      type: ServicePricingTypeEnum; // 'FIXED' | 'HOURLY' | 'TIERED' | 'INQUIRY_REQUIRED' in content JSON
      currency: 'BTC' | 'USDt';
      
      // For FIXED pricing
      amount?: number;
      deliveryTime?: {
        min: number;                    // Minimum delivery time value
        max: number;                    // Maximum delivery time value
        unit: 'hour' | 'day' | 'week' | 'month'; // Time unit
        display: string;                // Human-readable display (e.g., "3-5 days", "2-3 weeks")
      };
      rushDelivery?: {
        enabled: boolean;
        price: number; // Fixed amount for rush delivery
        deliveryTime?: {
          min: number;                  // Minimum rush delivery time value
          max: number;                  // Maximum rush delivery time value
          unit: 'hour' | 'day' | 'week' | 'month'; // Time unit
          display: string;              // Human-readable display (e.g., "1-2 days", "3-5 days")
        };
      };
      
      // For HOURLY pricing
      hourlyRate?: number;
      estimatedHours?: number;
      deliveryTime?: {
        min: number;                    // Minimum delivery time value
        max: number;                    // Maximum delivery time value
        unit: 'hour' | 'day' | 'week' | 'month'; // Time unit
        display: string;                // Human-readable display (e.g., "3-5 days", "2-3 weeks")
      };
      rushDelivery?: {
        enabled: boolean;
        price: number; // Fixed amount for rush delivery
        deliveryTime?: {
          min: number;                  // Minimum rush delivery time value
          max: number;                  // Maximum rush delivery time value
          unit: 'hour' | 'day' | 'week' | 'month'; // Time unit
          display: string;              // Human-readable display (e.g., "1-2 days", "3-5 days")
        };
      };
      
      // For TIERED pricing (2-4 tiers recommended)
      tiers?: Array<{
        id: string;
        name: string; // e.g., "Basic", "Standard", "Premium"
        description: string;
        price: number;
        deliveryTime?: {
          min: number;                    // Minimum delivery time value
          max: number;                    // Maximum delivery time value
          unit: 'hour' | 'day' | 'week' | 'month'; // Time unit
          display: string;                // Human-readable display (e.g., "3-5 days", "2-3 weeks")
        };
        rushDelivery?: {
          enabled: boolean;
          price: number; // Fixed amount for rush delivery (can be different per tier)
          deliveryTime?: {
            min: number;                  // Minimum rush delivery time value
            max: number;                  // Maximum rush delivery time value
            unit: 'hour' | 'day' | 'week' | 'month'; // Time unit
            display: string;              // Human-readable display (e.g., "1-2 days", "3-5 days")
          };
        };
        features: string[]; // List of features included in this tier
        isPopular?: boolean; // Highlight as popular/recommended
      }>;
      
      // For INQUIRY_REQUIRED pricing
      inquiryForm?: {
        fields: Array<{
          id: string;
          type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date' | 'time';
          label: string;
          placeholder?: string;
          required: boolean;
          options?: string[]; // For select/checkbox types
        }>;
        // Note: Photo upload and message field are always available (not configurable by taskee)
      };
      
      // Simple add-ons/extras (available for all pricing types except INQUIRY_REQUIRED)
      addOns?: Array<{
        id: string;
        name: string; // e.g., "Rush delivery", "Extra revisions"
        description?: string;
        price: number; // Fixed price for this add-on
      }>;
    };
    skills: string[];
    categories: Category[];
    portfolio?: Attachment[];  // Portfolio items stored via direct file uploads (same as task attachments)
    faqs?: Array<{
      id: string;
      question: string;
      answer: string;
    }>;
    naddr?: string;  // NIP-19 bech32-encoded service identifier (naddr1... standard format)
    status: 'active' | 'inactive' | 'sold'; // NIP-99 status values
    creator: {
      username: string;
      avatar: string;
    };
    createdAt: number;
    uniqueId: string;
    translations?: ServiceTranslations;
  },
  tags: [
    // ============================================================================
    // NIP-99 COMPATIBLE TAGS (for interoperability)
    // ============================================================================
    ['d', `service-${uniqueId}`], // NIP-99: Unique identifier (parameterized replaceable)
    ['title', serviceTitle], // NIP-99: Service title
    ['summary', shortSummary], // NIP-99: Brief summary/tagline
    ['published_at', createdAt.toString()], // NIP-99: Publication timestamp
    ['location', locationDisplayName || 'Remote'], // NIP-99: Service location (Taskee's service location if tasker_location, or service location if taskee_location, or 'Remote')
    ['price', getPriceForTag(pricing).toString(), currency], // NIP-99: Price array [amount, currency, frequency?]
    // For tiered pricing: uses lowest tier price for discovery
    // For fixed/hourly: uses actual price/rate
    // For inquiry_required: uses '0'
    ['status', status], // NIP-99: 'active' | 'inactive' | 'sold'
    
    // ============================================================================
    // BITTASKER EXTENSIONS (advanced features - human-readable tags)
    // ============================================================================
    ['p', creatorPubkeyHex], // Creator pubkey (64-char hex, standard Nostr tag; not npub)
    ...categoryIds.map((categoryId) => ['categories', categoryId]), // Categories (repeat tag per value)
    ...skills.map((skill) => ['skills', skill]), // Skills tags (repeat tag per value)
    ...serviceLocationTypes.map((locationType) => ['location_types', locationType]), // Location types (repeat tag per value)
    ['location_display_name', locationDisplayName], // Human-readable location display name (optional, for display purposes)
    ['service_radius', serviceRadius], // Service radius in km/miles (if tasker_location) - distance from Taskee's service location that they're willing to travel
    ['per_distance_charge', perDistanceChargeAmount, perDistanceChargeCurrency, perDistanceChargeUnit], // Per distance charge: [amount, currency, unit]
    ['pricing_type', pricingType.toLowerCase()], // Wire tag uses lowercase: 'fixed' | 'hourly' | 'tiered' | 'inquiry_required'
    // Note: Deletion handled via NIP-09 deletion events (kind 5), not status enum
    
    // Price range tags (for filtering - optional, added for tiered pricing)
    ...(pricingType.toLowerCase() === 'tiered' && pricing.tiers ? [
      ['min_price', Math.min(...pricing.tiers.map(t => t.price)).toString(), currency], // Lowest tier price for filtering
      ['max_price', Math.max(...pricing.tiers.map(t => t.price)).toString(), currency] // Highest tier price for filtering
    ] : [])
  ]
}
```

**NIP-99 Compatibility Notes:**
- **Full Compatibility:** Uses NIP-99 standard event kinds (`30402` for active, `30403` for drafts) for maximum interoperability
- **Discovery:** Standard NIP-99 clients can discover services through standard queries for `kind: 30402`
- **Basic Interoperability:** NIP-99 clients can read all standard tags (title, summary, location, price, status, published_at)
- **Status Tag:** Uses NIP-99 status values directly (`'active'`, `'inactive'`, `'sold'`)
- **Advanced Features:** Full feature set (tiers, add-ons, inquiry forms) stored in `content` JSON - accessible to BitTasker clients
- **Tier Data Storage:** Full tier data (name, description, price, features) stored in `content.pricing.tiers[]` (content JSON)
  - NIP-99 `price` tag uses lowest tier price for discovery compatibility
  - `min_price` and `max_price` tags added for price range filtering (BitTasker extension)
  - No tier ID tags needed (tier IDs are client-generated and not useful for filtering)
- **Tag Extensions:** Human-readable tags follow NIP-99's pattern (e.g., `location_types`, `pricing_type`)
- **Tag Philosophy:** Extensions use descriptive, human-readable names consistent with NIP-99's approach (e.g., `title`, `summary`, `location`)
- **Standard Tags:** Standard Nostr tags (`d`, `p`, `e`) remain unchanged for protocol compatibility
- **Draft Support:** Use `kind: 30403` for drafts (NIP-99 standard) and `status: 'inactive'` tag for additional status information
- **Extension Compatibility:** Extension tags don't conflict with NIP-99 standard tags - NIP-99 clients will ignore unknown tags gracefully
- **Portfolio Files:** Portfolio items stored via direct file uploads (same as task attachments), using `uploadService` with `folder: 'services'`
- **Potential NIP Extension:** Human-readable extension tags make this implementation a potential candidate for proposing as a NIP-99 extension
- **Pricing Value Normalization (Required):**
  - `content.pricing.type` uses enum values: `FIXED | HOURLY | TIERED | INQUIRY_REQUIRED`
  - `pricing_type` tag uses lowercase wire values: `fixed | hourly | tiered | inquiry_required`
  - All write/read paths must use one mapper to convert between enum and wire-tag values

### 3.2. Data Models

**Service Location Types:**
```typescript
enum ServiceLocationTypeEnum {
  REMOTE = 'remote',                           // Online/virtual service
  TASKER_LOCATION = 'tasker_location',         // In-person at Tasker's location - flag indicating Taskee can travel to Tasker's location (Tasker's location unknown at listing time)
  TASKEE_LOCATION = 'taskee_location'          // In-person at Taskee's location - tasker travels to taskee's specified service location
}

// Service status uses NIP-99 values directly: 'active' | 'inactive' | 'sold'
// Note: Deletion handled via NIP-09 deletion events (kind 5), not status

enum ServicePricingTypeEnum {
  FIXED = 'FIXED',                    // Fixed price
  HOURLY = 'HOURLY',                  // Hourly rate
  TIERED = 'TIERED',                  // Multiple service tiers with different features/prices
  INQUIRY_REQUIRED = 'INQUIRY_REQUIRED' // Tasker must request a quote for pricing details
}

```

**ServiceBody Interface (User Input / Content JSON Structure):**
```typescript
// ServiceBody represents the data structure for creating/updating services
// This is what goes into event.content (JSON stringified)
// Used as input for createService() and updateService() functions
// Used in service store to hold form data as user fills it out
interface ServiceBody {
  title: string;
  description: string;
  serviceLocationTypes: ServiceLocationTypeEnum[]; // Multiple select location types
  locationDetails?: ServiceLocationDetails;
  pricing: ServicePricing; // Includes tiers, simple add-ons, inquiry forms, delivery times
  skills: string[];
  categories: Category[];
  portfolio?: Attachment[];  // Portfolio items stored via direct file uploads
  faqs?: ServiceFAQ[];       // Frequently asked questions (optional)
  status: 'active' | 'inactive' | 'sold'; // NIP-99 status values
  uniqueId: string; // UUID for stable URLs (generated during creation)
  createdAt: number; // Timestamp (added during creation)
  creator: {
    username: string;
    avatar: string;
  }; // Added during creation from current user
  translations?: ServiceTranslations; // Auto-generated during creation
  naddr?: string; // NIP-19 identifier (generated after creation, added to content)
}

interface ServiceFAQ {
  id: string;
  question: string;                 // FAQ question
  answer: string;                    // FAQ answer
}
```

**Service Interface (Complete Service Object):**
```typescript
// Service represents the complete service object after parsing from Nostr event
// Combines event metadata (id, npub) with content data (ServiceBody + metadata)
// Used for displaying services in the UI
interface Service {
  id: string; // Nostr event ID (from event.id, not in content)
  npub: string; // Creator's Nostr public key (from event.pubkey, not in content)
  uniqueId: string; // UUID for stable URLs (from content)
  status: 'active' | 'inactive' | 'sold'; // NIP-99 status values (from content)
  title: string; // From content
  description: string; // From content
  serviceLocationTypes: ServiceLocationTypeEnum[]; // From content
  locationDetails?: ServiceLocationDetails; // From content
  pricing: ServicePricing; // From content (includes tiers, add-ons, inquiry forms, delivery times)
  skills: string[]; // From content
  categories: Category[]; // From content
  portfolio?: Attachment[]; // From content
  faqs?: ServiceFAQ[]; // From content (optional)
  createdAt: number; // From content (added during creation)
  updatedAt?: number; // Calculated from event.created_at if different from content.createdAt
  creator?: {
    username: string;
    avatar: string;
    rating?: number; // May be added from profile lookup
  }; // From content (added during creation)
  translations?: ServiceTranslations; // From content (auto-generated during creation)
}
```

**Key Differences:**
- **ServiceBody**: User input / form data / what goes in `event.content` (JSON stringified)
- **Service**: Complete service object (ServiceBody + event metadata like `id`, `npub`)
- **Purpose**: ServiceBody ensures type safety for creation/update functions and separates user-provided data from event metadata

```typescript
interface ServiceLocationDetails {
  // For TASKER_LOCATION offer mode (taskee/freelancer travels to tasker/client).
  // Note: despite the property name, this stores the taskee/freelancer base location
  // and travel radius used for discovery and distance-fee calculations.
  taskerLocation?: {
    serviceLocation: Location;         // Taskee's service location (where they operate from - office, studio, base location)
    serviceRadius?: number;            // Service radius in km/miles - distance from Taskee's service location that they're willing to travel
    perDistanceCharge?: {
      amount: number;
      currency: string;                // 'BTC' | 'USDt'
      unit: 'km' | 'mile';            // Distance unit
    };
  };
  
  // For TASKEE_LOCATION offer mode (tasker/client travels to taskee/freelancer location).
  // Global location fallback is being phased out; search should use explicit service location data.
  taskeeLocation?: {
    useGlobalLocation: boolean;        // Deprecated transitional flag while global location is phased out
    serviceLocation?: Location;       // Preferred explicit location for discovery/filtering/search radius checks
    locationDisplayName?: string;      // Human-readable location name for display
  };
}

// Discovery rule: geosearch should use explicit taskee/freelancer service coordinates
// (plus serviceRadius where applicable), not profile-level global location.

interface ServicePricing {
  type: ServicePricingTypeEnum;
  currency: string; // 'BTC' | 'USDt'
  
  // For FIXED pricing
  amount?: number;
  deliveryTime?: DeliveryTime; // Delivery time/turnaround time for fixed pricing
  rushDelivery?: RushDelivery; // Dedicated rush delivery option (fixed amount, required rush delivery time range)
  
  // For HOURLY pricing
  hourlyRate?: number;
  estimatedHours?: number;  // Optional estimate
  deliveryTime?: DeliveryTime; // Delivery time/turnaround time for hourly pricing
  rushDelivery?: RushDelivery; // Dedicated rush delivery option (fixed amount, required rush delivery time range)
  
  // For TIERED pricing (2-4 tiers recommended, like Fiverr packages)
  tiers?: ServiceTier[];
  
  // For INQUIRY_REQUIRED pricing
  inquiryForm?: InquiryForm;
  
  // Simple add-ons/extras (available for all pricing types except INQUIRY_REQUIRED)
  // Like Fiverr extras - simple optional add-ons with fixed prices
  addOns?: AddOn[];
}

interface ServiceTier {
  id: string;
  name: string;                    // e.g., "Basic", "Standard", "Premium"
  description: string;
  price: number;
  deliveryTime?: DeliveryTime;      // Delivery time/turnaround time for this tier (e.g., "3 days", "1 week")
  rushDelivery?: RushDelivery;      // Dedicated rush delivery option for this tier (fixed amount, required rush delivery time range)
  features: string[];             // List of features included in this tier (bullet points)
  isPopular?: boolean;             // Highlight as popular/recommended
}

interface DeliveryTime {
  min: number;                      // Minimum delivery time value (e.g., 3)
  max: number;                      // Maximum delivery time value (e.g., 5)
  unit: 'hour' | 'day' | 'week' | 'month'; // Time unit
  display: string;                  // Human-readable display (e.g., "3-5 days", "2-3 weeks")
}

interface RushDelivery {
  enabled: boolean;                 // Whether rush delivery is available
  price: number;                    // Fixed amount for rush delivery
  deliveryTime: DeliveryTime;       // Required: Rush delivery time range (e.g., "1-2 days" instead of standard "3-5 days")
}

interface AddOn {
  id: string;
  name: string;                    // e.g., "Rush delivery", "Extra revisions", "Source files included"
  description?: string;
  price: number;                   // Fixed price for this add-on (not an adjustment)
}

interface InquiryForm {
  fields: InquiryFormField[];
  // Note: Photo upload and message field are always available (not configurable by taskee)
}

interface InquiryFormField {
  id: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date' | 'time';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];              // For select/checkbox types
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}
```

### 3.3. File Structure

```text
src/
├── lib/
│   ├── components/
│   │   └── service/
│   │       ├── steps/
│   │       │   ├── ServiceBasics.svelte
│   │       │   ├── ServiceLocation.svelte
│   │       │   ├── ServiceDetails.svelte
│   │       │   ├── ServicePricing.svelte
│   │       │   ├── ServiceTiers.svelte
│   │       │   ├── ServiceAddOns.svelte
│   │       │   ├── ServiceFAQs.svelte
│   │       │   ├── InquiryFormBuilder.svelte
│   │       │   ├── ServicePortfolio.svelte
│   │       │   └── ServiceReview.svelte
│   │       ├── ServiceCard.svelte
│   │       ├── ServiceDetailsView.svelte
│   │       ├── ServiceSearchFilters.svelte
│   │       ├── ServiceTierSelector.svelte
│   │       ├── ServiceAddOnsSelector.svelte
│   │       └── RequestQuoteModal.svelte
│   ├── nostr/
│   │   ├── service.ts          // Service CRUD operations
│   │   └── findServices.ts     // Service search and filtering
│   ├── stores/
│   │   └── service.store.ts     // Service state management
│   ├── types/
│   │   └── service.d.ts         // Service TypeScript types
│   └── utils/
│       ├── enums/
│       │   └── service.enum.ts  // Service enums
│       ├── service-indexing.ts          // Service index/filter helpers
│       └── serviceDisplayTranslation.ts // Service display translation helpers
├── routes/
│   ├── (protected)/
│   │   └── dashboard/
│   │       ├── create-service/
│   │       │   └── +page.svelte
│   │       ├── my-services/
│   │       │   └── +page.ts       // redirect-only alias to /dashboard?tab=my-services
│   └── services/
│       ├── +page.svelte         // Public services browse page
│       └── [serviceId]/
│           ├── +page.svelte    // Public service detail page
│           └── +page.ts         // Load function for service data
└── static/
    └── locales/
        └── [lang]/
            └── dashboard/
                └── services/
                    ├── create.json
                    ├── browse.json
                    └── detail.json
```

## 4. Implementation Phases (AI-Builder Delta Plan)

Section 4 is now a delta-only execution plan.
- Already-implemented baseline is locked in `4.0`.
- Only remaining work is specified in `4.1` to `4.4`.
- Quote protocol (`6420/6421/6422`) source of truth is `requirements/services-quotes-execution-plan.md`.
- Escrow-funded `accepted` status and contracts handoff are gated by Phase `4B` in `requirements/services-quotes-execution-plan.md` and are not delivered by `S4-Q4`.

### 4.0 Implemented Baseline (Locked)

Do not rebuild the following; extend/refactor only.

**[IMPLEMENTED] Core Types/State**
- `src/lib/types/service.d.ts` (service domain types including `QuoteRequestPayload`)
- `src/lib/utils/enums/service.enum.ts` (location/pricing/step enums)
- `src/lib/stores/service.store.ts` (create/edit state + draft lifecycle)

**[IMPLEMENTED] Service Creation/Edit Surface**
- `src/routes/(protected)/dashboard/create-service/+page.svelte`
- Step components:
  - `src/lib/components/service/steps/ServiceBasics.svelte`
  - `src/lib/components/service/steps/ServiceLocation.svelte`
  - `src/lib/components/service/steps/ServiceDetails.svelte` (component exists; active create-service step switch currently does not mount it)
  - `src/lib/components/service/steps/ServicePricing.svelte`
  - `src/lib/components/service/steps/ServiceTiers.svelte`
  - `src/lib/components/service/steps/ServiceAddOns.svelte`
  - `src/lib/components/service/steps/ServiceFAQs.svelte`
  - `src/lib/components/service/steps/InquiryFormBuilder.svelte`
  - `src/lib/components/service/steps/ServicePortfolio.svelte`
  - `src/lib/components/service/steps/ServiceReview.svelte`

**[IMPLEMENTED] Nostr Service Listing Domain (`30402`/`30403`)**
- `src/lib/nostr/service.ts` (`createService`, `updateService`, `deleteService`, tags/translations)
- `src/lib/nostr/findServices.ts` (service queries/filtering/deletion filtering)

**[IMPLEMENTED] Public Discovery/Detail Surfaces**
- Browse: `src/routes/services/+page.svelte`
- Detail route/load:
  - `src/routes/services/[serviceId]/+page.svelte`
  - `src/routes/services/[serviceId]/+page.ts`
- UI components:
  - `src/lib/components/service/ServiceSearchFilters.svelte`
  - `src/lib/components/service/ServiceCard.svelte`
  - `src/lib/components/service/ServiceDetailsView.svelte`
  - `src/lib/components/service/ServiceTierSelector.svelte`
  - `src/lib/components/service/ServiceAddOnsSelector.svelte`

**[IMPLEMENTED] Request Quote Modal Baseline (UI only)**
- `src/lib/components/service/RequestQuoteModal.svelte`
- Modal is integrated in detail and browse surfaces.
- Current submit handlers are placeholder logging (canonical `6420` publish not yet wired).

**[IMPLEMENTED] Dashboard/Management Baseline**
- Dashboard tab + alias baseline:
  - `src/routes/(protected)/dashboard/+page.svelte`
  - `src/routes/(protected)/dashboard/my-services/+page.ts`
- My services panel baseline:
  - `src/lib/components/service/DashboardMyServicesPanel.svelte`
  - list/view/edit/status-toggle baseline exists

**[IMPLEMENTED] Contracts Baseline (Task-Centric Today)**
- Shared contracts surfaces already exist and must be adapted in place:
  - `src/lib/components/contracts/DashboardContractsPanel.svelte`
  - `src/lib/components/contracts/ContractCard.svelte`
  - `src/lib/components/contracts/ContractDrawer.svelte`
  - `src/lib/components/contracts/ContractActions.svelte`
  - `src/lib/components/contracts/TaskCompletionModal.svelte`
- Service implementation must extend these shared surfaces rather than create parallel service-specific contract screens/modals

**[IMPLEMENTED] Translation/SEO Baseline**
- Runtime translation generation in `src/lib/nostr/service.ts`
- Display translation helpers in `src/lib/utils/serviceDisplayTranslation.ts`
- Service locale files in `static/locales/{en,es}/dashboard/services/*`
- Basic SEO tags exist on service detail route; browse-route metadata completion remains under `S4-SEO1`

**Do-not-rebuild rule:** Any implementation that duplicates the above baseline is invalid and must be replaced with integration/refactor work.

### 4.1 Remaining Work Index (Only Remaining Items)

| ID | Status | Blocker | Files (Primary) | Test Gate |
|---|---|---|---|---|
| `S4-Q1` | `PARTIAL` | none | `RequestQuoteModal` callers + `service-quote` publish adapter | `Q-G1` |
| `S4-Q2A` | `REMAINING` | `S4-Q1` | proposal publish (`6421`) contract | `Q-G2A` |
| `S4-Q2B` | `REMAINING` | `S4-Q2A` | status publish (`6422`) auth/cardinality contract | `Q-G2B` |
| `S4-Q2C` | `REMAINING` | `S4-Q2A`,`S4-Q2B` | deterministic resolver transitions/expiration | `Q-G2C` |
| `S4-R1` | `REMAINING` | `S4-Q2C` | targeted shared reuse baseline from quotes Phase `1.5` | `R-G1` |
| `S4-Q3` | `REMAINING` | `S4-Q1`,`S4-Q2A`,`S4-Q2B`,`S4-Q2C`,`S4-R1` | taskee quotes UI under `tab=my-services&view=quotes` | `Q-G3` |
| `S4-Q4` | `REMAINING` | `S4-Q1`,`S4-Q2A`,`S4-Q2B`,`S4-Q2C`,`S4-R1` | tasker quotes UI (non-funded states only) under `tab=quotes&view=tasker` | `Q-G4` |
| `S4-D1` | `REMAINING` | `S4-Q2C` | guarded delete workflow + UI | `MG-G1` |
| `S4-E1` | `REMAINING` | none | edit conflict/race handling | `MG-G2` |
| `S4-M1` | `REMAINING` | `S4-Q1`,`S4-R1` | messaging templates + optional DM mirror + quote-notification foundation | `INT-G1` |
| `S4-AC1A` | `REMAINING` | `S4-R1` | shared contracts-surface extraction + context rendering baseline | `ACC-G1A` |
| `S4-AC1B` | `REMAINING` | `S4-Q4`,`S4-M1`,`S4-R1`,`S4-AC1A` | service acceptance engine + reconciliation baseline | `ACC-G1B` |
| `S4-AC1C` | `REMAINING` | `S4-AC1A`,`S4-AC1B`,`S4-M1` | funded service-contract UX/handoff baseline | `ACC-G1C` |
| `S4-IB1A` | `REMAINING` | none | instant-buy schema/authoring/eligibility baseline | `BUY-G1A` |
| `S4-IB1B` | `REMAINING` | `S4-IB1A` | instant-buy buyer CTA + tier selection + confirmation UX | `BUY-G1B` |
| `S4-IB1C` | `REMAINING` | `S4-IB1A`,`S4-IB1B`,`S4-M1`,`S4-AC1C` | instant-buy contract create/redirect/push handoff | `BUY-G1C` |
| `S4-UX1` | `REMAINING` | `S4-Q3`,`S4-Q4`,`S4-M1`,`S4-AC1C`,`S4-IB1C` | UX hardening for loading/empty/error/pending/wallet/deep-link continuity | `UX-G1` |
| `S4-P1` | `REMAINING` | none | profile services/count/links | `INT-G3` |
| `S4-H1` | `REMAINING` | `S4-R1` | homepage featured services module + shared featured-section shell | `HOME-G1` |
| `S4-SEO1` | `PARTIAL` | none | JSON-LD + service detail metadata parity | `SEO-G1` |
| `S4-CI1` | `REMAINING` | `S4-Q3`,`S4-Q4`,`S4-AC1C`,`S4-IB1C`,`S4-UX1`,`S4-H1` | Playwright CI re-enable + required checks | `CI-G1` |
| `S4-T1` | `REMAINING` | `S4-Q1`,`S4-Q2A`,`S4-Q2B`,`S4-Q2C`,`S4-D1`,`S4-E1`,`S4-AC1A`,`S4-AC1B`,`S4-AC1C`,`S4-IB1A`,`S4-IB1C` | unit tests | `TEST-G1` |
| `S4-T2` | `REMAINING` | `S4-Q3`,`S4-Q4`,`S4-D1`,`S4-E1`,`S4-AC1A`,`S4-AC1C`,`S4-IB1A`,`S4-IB1B`,`S4-UX1`,`S4-P1`,`S4-H1` | component tests | `TEST-G2` |
| `S4-T3` | `REMAINING` | `S4-Q1`,`S4-Q2A`,`S4-Q2B`,`S4-Q2C`,`S4-Q3`,`S4-Q4`,`S4-D1`,`S4-E1`,`S4-M1`,`S4-AC1A`,`S4-AC1B`,`S4-AC1C`,`S4-IB1A`,`S4-IB1B`,`S4-IB1C`,`S4-UX1`,`S4-P1`,`S4-H1`,`S4-SEO1`,`S4-CI1` | integration/E2E + CI enforcement | `TEST-G3` |
| `S4-T4` | `REMAINING` | `S4-Q3`,`S4-Q4`,`S4-AC1A`,`S4-AC1C`,`S4-IB1B`,`S4-IB1C`,`S4-UX1`,`S4-H1`,`S4-SEO1` | visual/perf/a11y gates | `TEST-G4` |
| `S4-DOC1` | `PARTIAL` | `S4-Q1`,`S4-Q2A`,`S4-Q2B`,`S4-Q2C`,`S4-Q3`,`S4-Q4`,`S4-D1`,`S4-E1`,`S4-M1`,`S4-AC1A`,`S4-AC1B`,`S4-AC1C`,`S4-IB1A`,`S4-IB1B`,`S4-IB1C`,`S4-UX1`,`S4-P1`,`S4-H1`,`S4-SEO1` | code docs completion | `DOC-G1` |
| `S4-DOC2` | `REMAINING` | `S4-DOC1` | user docs completion | `DOC-G2` |

### 4.2 Execution Order (Dependency-Safe)

Order below is delivery order. For each ID, tests are still written first per Section `5.1`.

1. `S4-Q1`
2. `S4-Q2A`
3. `S4-Q2B`
4. `S4-Q2C`
5. `S4-R1`
6. `S4-Q3` and `S4-Q4`
7. `S4-D1` and `S4-E1`
8. `S4-M1`
9. `S4-AC1A`
10. `S4-AC1B`
11. `S4-AC1C`
12. `S4-IB1A`
13. `S4-IB1B`
14. `S4-IB1C`
15. `S4-UX1`
16. `S4-P1`
17. `S4-H1`
18. `S4-SEO1`
19. `S4-CI1`
20. `S4-T1`, `S4-T2`, `S4-T3`, `S4-T4`
21. `S4-DOC1`, `S4-DOC2`

### 4.2.1 Canonical Dashboard Query Parser Contract (Locked)

Single parser authority for quote-management routes:
1. `tab` allowlist: `tasks | my-services | bids | contracts | saved-searches | quotes`
2. `view` allowlist:
   - `tab=quotes` -> `view=tasker`
   - `tab=my-services` -> `view=default|quotes`
3. `context` allowlist for `tab=contracts` only: `all | tasks | services`
4. `service` is required only when `tab=my-services&view=quotes`; value must be URL-decoded and validated as canonical `serviceAddress` (`<kind>:<serviceAuthorPubkey>:<d>`).
5. `request` is allowed when:
   - `tab=quotes&view=tasker`, or
   - `tab=my-services&view=quotes&service=<encodedServiceAddress>`
   value is `quoteRequestId`.
6. `highlight` is allowed only when `tab=contracts`; value is `escrowId`.
6. Invalid/missing query params are sanitized to deterministic defaults:
   - `tab=tasks`
   - `view=default` for `tab=my-services`
   - `view=tasker` for `tab=quotes`
   - `context=all` for `tab=contracts`
7. On any `tab`/`view` transition, strip query params that are not allowed for the destination scope:
   - remove `service` unless `tab=my-services&view=quotes`
   - remove `request` unless `tab=quotes&view=tasker` or `tab=my-services&view=quotes`
   - remove `highlight` unless `tab=contracts`
   - remove `context` unless `tab=contracts`
   - remove `view` when destination tab does not support `view`
8. Invalid `service` handling (`tab=my-services&view=quotes`):
   - if missing: select first available service and sync query
   - if malformed or not owned/available: replace with first available service
   - if no services available: sanitize to `/dashboard?tab=my-services&view=default`
9. Invalid `highlight` handling (`tab=contracts`):
   - if malformed: clear immediately via `replaceState`, preserve `context`, and show deterministic non-blocking message code `contracts_highlight_not_found`
   - if not found in current result window: defer to the contracts-surface recovery flow in `services-quotes-execution-plan.md` Section `10.3`; perform one deterministic recovery fetch/requery before clearing `highlight`
10. Invalid `request` handling:
   - `tab=quotes&view=tasker`: if malformed, clear immediately; if not yet found but a bounded recent-submit/focus-sync state is active, preserve `request` and render syncing UI; otherwise clear `request` via `replaceState` and show deterministic non-blocking message code `quotes_request_not_found`
   - `tab=my-services&view=quotes`: if malformed, clear immediately; if not yet found but a bounded focus-sync state is active, preserve `request` and render syncing UI; if not found after sync or does not belong to the selected service, clear `request` via `replaceState`, preserve `service`, and show deterministic non-blocking message code `service_quotes_request_not_found`
11. `Q-G3`, `Q-G4`, and `TEST-G3` must include route/deep-link tests for `tab/view/context/service/request/highlight` and prove no parallel parser path exists.

### 4.2.2 Cross-Document Traceability Matrix (Locked)

| Listing ID | Quotes Plan Phase | Required Gate(s) | Required CI Job(s) | Notes |
|---|---|---|---|---|
| `S4-Q1` | `Phase 2` | `Q-G1` | `service-quote-gates` | request publish + redirect wiring |
| `S4-Q2A` | `Phase 1` | `Q-G2A` | `service-quote-gates` | proposal publish (`6421`) |
| `S4-Q2B` | `Phase 1` | `Q-G2B` | `service-quote-gates` | status publish (`6422`) |
| `S4-Q2C` | `Phase 1` | `Q-G2C` | `service-quote-gates` | resolver and terminalization |
| `S4-R1` | `Phase 1.5` | `R-G1` | `service-quote-gates` | targeted shared extraction baseline; no parallel refactor track |
| `S4-Q3` | `Phase 2` | `Q-G3` | `service-quote-gates` | taskee quotes UI |
| `S4-Q4` | `Phase 3` | `Q-G4` | `service-quote-gates` | non-funded tasker lifecycle only |
| `S4-D1` | `Phase 2/3` | `MG-G1` | `service-quote-gates` | delete guards depend on resolver |
| `S4-E1` | `Phase 1.5/2` | `MG-G2` | `service-quote-gates` | edit conflict safeguards |
| `S4-AC1A` | `Phase 4A` | `ACC-G1A` | `service-quote-gates` | shared contracts-surface extraction + context rendering baseline |
| `S4-AC1B` | `Phase 4B` | `ACC-G1B` | `service-quote-gates`,`service-quote-e2e` | service acceptance engine + reconciliation baseline |
| `S4-AC1C` | `Phase 4B` | `ACC-G1C` | `service-quote-gates`,`service-quote-e2e` | funded service-contract UX/handoff baseline |
| `S4-IB1A` | `Phase 4C` | `BUY-G1A` | `service-quote-gates` | instant-buy schema/authoring/eligibility baseline |
| `S4-IB1B` | `Phase 4C` | `BUY-G1B` | `service-quote-gates` | buyer CTA + tier selection + confirmation |
| `S4-IB1C` | `Phase 4C` | `BUY-G1C` | `service-quote-gates`,`service-quote-e2e` | create contract + redirect + push handoff |
| `S4-UX1` | `Phase 4B/4C/5` | `UX-G1` | `service-quote-gates`,`service-quote-e2e` | UX hardening for pending/offline/wallet/contract continuity |
| `S4-H1` | `Phase 5` | `HOME-G1` | `service-quote-gates`,`service-quote-e2e` | homepage featured services module + shared featured-section shell |
| `S4-CI1` | `Phase 5` | `CI-G1` | `service-quote-gates`,`service-quote-e2e` | merge-required CI contract |
| `S4-T3` | `Phase 5` | `TEST-G3` | `service-quote-e2e` | non-funded flow; funded accept belongs to `Phase 4B` |

### 4.2.3 Shared File Ownership Map (Locked)

Primary owner work item/phase for shared files:
1. `src/lib/utils/service-quote/publish.ts`
   - primary owner: `S4-Q1` (request publish path)
   - handoff: `S4-Q2A` may extend proposal publish; `S4-Q2B` may extend status publish only
2. `src/routes/(protected)/dashboard/+page.svelte`
   - primary owner: `S4-Q4` (final parser behavior)
   - handoff: `S4-Q1` may add minimal parse support only; `S4-Q3` may consume parser outputs only
3. `src/lib/stores/service-quote.store.ts`
   - primary owner: `S4-Q2C`
   - handoff: `S4-Q2A`/`S4-Q2B` may add typed action inputs without resolver mutations
4. `src/lib/stores/service-quote-ui.store.ts`
   - primary owner: `S4-Q4`
   - handoff: `S4-M1` may extend UI messaging state only; `S4-UX1` may extend syncing/loading/error/deep-link continuity state only
5. `src/lib/components/service/DashboardMyServicesPanel.svelte`
   - primary owner: `S4-Q3`
   - handoff: `S4-D1` may add delete guard UI hooks only
6. `src/lib/utils/service-quote/query.ts`
   - primary owner: `S4-Q2C`
   - handoff: `S4-Q2B` and `S4-M1` may extend query filters only; resolver-state ownership remains `S4-Q2C`
7. `src/lib/components/service/ServiceDetailsView.svelte`
   - primary owner: `S4-IB1B` (instant-buy CTA/confirmation integration)
   - handoff: `S4-Q1` may wire request-quote publish only; `S4-D1` may add delete-guard UI hooks only; `S4-IB1C` may wire final create/redirect outcomes only
8. `src/lib/components/service/ServiceInstantBuyModal.svelte`
   - primary owner: `S4-IB1B`
   - handoff: `S4-IB1C` may add final create/redirect/pending-state behavior only; `S4-UX1` may add wallet/error/offline/permission-denied states only
9. `src/lib/components/contracts/DashboardContractsPanel.svelte`
   - primary owner: `S4-AC1A`
   - handoff: `S4-AC1C` may wire funded-contract continuity and service-aware follow-up CTAs only; `S4-IB1C` may add service-contract continuity entry points only; `S4-UX1` may extend highlight recovery, loading/error, and continuity-state UX only
10. `src/lib/components/contracts/ContractDrawer.svelte`
   - primary owner: `S4-AC1A`
   - handoff: `S4-AC1C` may wire funded service agreement/detail rendering only; `S4-UX1` may extend immutable-snapshot continuity, loading/error, and permission-denied UX only
11. `src/lib/components/contracts/ContractActions.svelte`
   - primary owner: `S4-AC1A`
   - handoff: `S4-AC1C` may wire funded service-action behavior and service-aware labels only; `S4-M1` may extend notification side-effect hooks only; `S4-UX1` may extend in-context rejection/pending-state UX only
12. `src/lib/utils/escrow/v1/escrowEvents.ts`
   - primary owner: `S4-AC1B`
   - handoff: `S4-M1` may attach notification emission hooks only after acceptance publication points are canonical
13. `src/lib/components/contracts/ContractContextSummary.svelte`
   - primary owner: `S4-AC1A`
   - handoff: `S4-IB1B` may reuse the normalized summary renderer in instant-buy confirmation only; `S4-UX1` may extend continuity/error-state presentation only
14. `src/lib/components/contracts/actions/ContractActionBar.svelte`
   - primary owner: `S4-AC1A`
   - handoff: `S4-UX1` may extend in-context pending/rejection affordances only
15. `src/lib/components/contracts/actions/CompleteContractButton.svelte`
   - primary owner: `S4-AC1A`
16. `src/lib/components/contracts/actions/AcceptContractButton.svelte`
   - primary owner: `S4-AC1A`
17. `src/lib/components/contracts/actions/CancelContractButton.svelte`
   - primary owner: `S4-AC1A`
18. `src/lib/components/contracts/actions/DisputeContractButton.svelte`
   - primary owner: `S4-AC1A`
19. `src/lib/components/contracts/actions/ResolutionProposalButton.svelte`
   - primary owner: `S4-AC1A`

### 4.3 Remaining Task Specs

#### S4-Q1
- `ID:` `S4-Q1`
- `Status:` `PARTIAL`
- `Objective:` Replace placeholder quote submit handlers with canonical `SERVICE_QUOTE_REQUEST (6420)` publish flow.
- `Depends on:` none
- `Files to modify/create:`
  - `src/lib/components/service/ServiceDetailsView.svelte`
  - `src/routes/services/+page.svelte`
  - `src/routes/(protected)/dashboard/+page.svelte` (minimal route parser support for `tab=quotes&view=tasker`)
  - `src/lib/utils/service-quote/publish.ts` (canonical request publish adapter; no `request-publish.ts`)
- `Implementation steps:`
  1. Route submit payload from existing modal callbacks into canonical request publisher in `service-quote/publish.ts`.
  2. Preserve buyer-selected service detail context (`selected tier`, `selected add-ons`, `rush selection`, inquiry answers, and any quoted amount hints supported by the request schema) from detail -> modal -> `6420` payload.
  3. Publish `6420` with required schema/tags/cardinality.
  4. Handle publish success/error deterministically, including a recent-submit syncing state on redirect until the new request is query-visible.
  5. On failed submit, keep the request modal open with entered values and attachments preserved, expose deterministic inline error messaging, and allow in-place retry without losing selected service context.
  6. Add minimal dashboard parser support for `tab=quotes&view=tasker` that conforms to `4.2.1`.
  7. Redirect success path to `/dashboard?tab=quotes&view=tasker&request=<quoteRequestId>` after canonical publish success.
- `Done when:` placeholder logging is removed from browse/detail submit handlers; successful submit emits valid `6420`, preserves selected detail-context inputs in the request payload, redirects to `/dashboard?tab=quotes&view=tasker&request=<quoteRequestId>`, and shows a deterministic syncing state until the new request becomes query-visible; failed submit does not redirect, keeps the request modal open with prior values/attachments intact, and shows deterministic inline retryable error state.
- `Test gate:` `Q-G1` - unit + integration tests for submit flow and routing.
- `Risk notes:` keep modal UI baseline; do not fork new inquiry form component.

#### S4-Q2A
- `ID:` `S4-Q2A`
- `Status:` `REMAINING`
- `Objective:` Implement proposal publish (`6421`) with strict schema/linkage.
- `Depends on:` `S4-Q1`
- `Files to modify/create:`
  - `src/lib/types/service-quote.d.ts`
  - `src/lib/utils/service-quote/protocol.ts`
  - `src/lib/utils/service-quote/publish.ts`
  - `src/lib/stores/service-quote.store.ts`
- `Implementation steps:`
  1. Implement `6421` payload schema and tag cardinality contract.
  2. Enforce linkage from proposal to quote request via canonical `#e` and `serviceAddress`.
  3. Enforce idempotency key `(kind, author, d)` and duplicate suppression.
- `Done when:` proposal publish succeeds only for valid request-linked payloads, invalid schema/linkage attempts are rejected with deterministic error codes, and duplicate `(kind, author, d)` publish attempts are skipped.
- `Test gate:` `Q-G2A`.
- `Risk notes:` no reuse of task-bid kinds/stores.

#### S4-Q2B
- `ID:` `S4-Q2B`
- `Status:` `REMAINING`
- `Objective:` Implement status publish (`6422`) with strict actor authorization and cardinality.
- `Depends on:` `S4-Q2A`
- `Files to modify/create:`
  - `src/lib/utils/service-quote/protocol.ts`
  - `src/lib/utils/service-quote/publish.ts`
  - `src/lib/utils/service-quote/query.ts`
  - `src/lib/stores/service-quote.store.ts`
- `Implementation steps:`
  1. Implement `6422` status payload/tag validation including `m/s/d` cross-field integrity.
  2. Enforce actor-role authorization (`declined`/tasker, `withdrawn`/taskee, etc.).
  3. Enforce pre-publish duplicate check for status events using `(kind, author, d)`.
- `Done when:` unauthorized or malformed status publishes are rejected deterministically, authorized status publishes emit valid `6422` events, duplicate status events are not republished, and `status='accepted'` publish attempts are fail-closed before Phase `4B`/`features.serviceQuotes.accept`.
- `Test gate:` `Q-G2B`.
- `Risk notes:` keep status author-role mapping aligned with `services-quotes-execution-plan.md`.

#### S4-Q2C
- `ID:` `S4-Q2C`
- `Status:` `REMAINING`
- `Objective:` Implement deterministic resolver transitions/expiration and terminalization.
- `Depends on:` `S4-Q2A`, `S4-Q2B`
- `Files to modify/create:`
  - `src/lib/utils/service-quote/resolver.ts`
  - `src/lib/utils/service-quote/query.ts`
  - `src/lib/stores/service-quote.store.ts`
- `Implementation steps:`
  1. Implement allowed-transition validation and explicit invalid-transition rejection.
  2. Implement deterministic winner selection for terminal states with timestamp/tie-break rules.
  3. Implement expiration derivation and near-expiry validity handling per protocol.
- `Done when:` resolver returns deterministic state for equivalent event sets regardless of arrival order, invalid transitions are ignored with deterministic telemetry reasons, and expiration/terminalization behavior matches protocol invariants.
- `Test gate:` `Q-G2C`.
- `Risk notes:` resolver must remain side-effect free and deterministic.

#### S4-R1
- `ID:` `S4-R1`
- `Status:` `REMAINING`
- `Objective:` Execute the quotes-plan Phase `1.5` shared reuse baseline as a targeted extraction pass owned by this plan.
- `Depends on:` `S4-Q2C`
- `Files to modify/create:` shared extraction targets explicitly listed under Phase `1.5` in `services-quotes-execution-plan.md` and required by touched quote/service flows
- `Implementation steps:`
  1. Execute only the shared extractions explicitly listed in Phase `1.5` that are required by downstream quote/services work.
  2. Do not open a separate parallel refactor track beyond those listed targets.
  3. Preserve current user-visible behavior while introducing shared abstractions needed by later work items.
- `Done when:` Phase `1.5` shared extraction targets required by this epic are completed under one owned track, parity tests pass, and no duplicate standalone refactor scope remains outside this plan.
- `Test gate:` `R-G1`.
- `Risk notes:` this is a bounded prerequisite alignment step, not a second epic.

#### S4-Q3
- `ID:` `S4-Q3`
- `Status:` `REMAINING`
- `Objective:` Build taskee inquiry/quotes management UI under `tab=my-services&view=quotes`.
- `Depends on:` `S4-Q1`, `S4-Q2A`, `S4-Q2B`, `S4-Q2C`, `S4-R1`
- `Files to modify/create:`
  - `src/lib/components/service/quotes/ServiceQuotesInbox.svelte`
  - `src/lib/components/service/quotes/ServiceProposalComposer.svelte`
  - `src/lib/components/service/DashboardMyServicesPanel.svelte`
  - `src/routes/(protected)/dashboard/+page.svelte`
- `Implementation steps:`
  1. Render quote request/proposal rows by service context.
  2. Use canonical taskee route state: `/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>` where
     `encodedServiceAddress = encodeURIComponent(serviceAddress)` and
     `serviceAddress` is canonical Nostr `a` format `<kind>:<serviceAuthorPubkey>:<d>`.
  3. Apply parser fallback contract for missing/invalid `service` per `4.2.1`.
  4. Add drawer/details/actions bound to canonical quote domain state.
  5. Support exact-focus deep links with `/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>&request=<quoteRequestId>` for provider notification-driven triage.
  6. Proposal composer must keep the user in-context when freelancer wallet or fee-tier prerequisites are missing: show deterministic inline recovery guidance, block submit, and do not lose the selected request thread.
  7. Keep chat as supplemental only.
- `Done when:` `/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>` renders service-scoped requests/proposals, `/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>&request=<quoteRequestId>` one-shot focuses the matching thread when present, provider proposal authoring blocks cleanly with in-context recovery guidance when wallet/fee-tier prerequisites are missing, `service` query is URL-decoded and validated as canonical `serviceAddress`, taskee actions emit canonical service-quote events, and route reload reproduces the same request/proposal IDs and statuses for the selected service.
- `Test gate:` `Q-G3`.
- `Risk notes:` no direct mutation of derived lifecycle state from UI-only actions.

#### S4-Q4
- `ID:` `S4-Q4`
- `Status:` `REMAINING`
- `Objective:` Add tasker quote timeline (`tab=quotes&view=tasker`) for non-funded quote lifecycle states.
- `Depends on:` `S4-Q1`, `S4-Q2A`, `S4-Q2B`, `S4-Q2C`, `S4-R1`
- `Files to modify/create:`
  - `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte`
  - `src/routes/(protected)/dashboard/+page.svelte`
  - `src/routes/(protected)/dashboard/quotes/+page.ts` (redirect-only alias; no parallel quotes route implementation)
  - `src/lib/stores/service-quote-ui.store.ts`
- `Implementation steps:`
  1. Extend existing `tab=quotes&view=tasker` parser support and preserve existing dashboard tabs behavior per `4.2.1`.
  2. Render tasker timeline for sent requests/received proposals.
  3. Add proposal review drawer/details so tasker can inspect the full proposal/agreement snapshot before acting.
  4. Wire non-funded tasker actions/statuses to canonical flow (`accepting`, `accept_failed`, `accept_unknown`, `declined`) with deterministic state rendering.
  5. Add deep-link and query-sanitization coverage for `tab/view/context/service/request/highlight` parser canonicalization only.
  6. Preserve existing non-quotes tab behavior (`tasks`, `my-services`, `bids`, `contracts`, `saved-searches`).
- `Done when:` `/dashboard?tab=quotes&view=tasker` renders request/proposal/status timeline for non-funded states, `/dashboard?tab=quotes&view=tasker&request=<quoteRequestId>` one-shot focuses the matching request when present, tasker has a proposal detail/review surface exposing the full agreement snapshot before acting, tasker actions emit canonical non-funded status updates, query parser behavior matches `4.2.1`, and `highlight` handling in this task is limited to parser canonicalization (contracts drawer behavior remains Phase `4A` ownership).
- `Test gate:` `Q-G4`.
- `Risk notes:` preserve existing `tasks/my-services/bids/contracts/saved-searches` behavior; do not enable escrow-funded `accepted` UI terminal or contracts handoff until Phase `4B` gates pass in `services-quotes-execution-plan.md`.

#### 4.3.1 Forbidden Before Phase `4B` (Hard Block)
The following are explicitly out of scope until Phase `4B` gates are green in `services-quotes-execution-plan.md`:
1. Emitting funded terminal `accepted` status from tasker UI.
2. Triggering contracts handoff redirect (`/dashboard?tab=contracts&context=services&highlight=<escrowId>`) from `S4-Q4`.
3. Running accept-to-escrow side effects from quote timeline actions.
4. Marking request/proposal flow complete based on funded-acceptance outcomes.
5. Enabling instant-buy escrow creation before `Phase 4B` shared service contract creation/reconciliation work is complete.

#### S4-D1
- `ID:` `S4-D1`
- `Status:` `REMAINING`
- `Objective:` Implement guarded delete workflow (active escrow/open quote checks + modals + safe transitions).
- `Depends on:` `S4-Q2C`
- `Files to modify/create:`
  - `src/lib/components/service/ServiceDetailsView.svelte`
  - `src/lib/components/service/DashboardMyServicesPanel.svelte`
  - `src/lib/nostr/service.ts`
  - `src/lib/utils/service-quote/resolver.ts`
- `Implementation steps:`
  1. Add pre-delete guard checks.
  2. Implement error/warning/confirm modal paths.
  3. Ensure quote/contract constraints are enforced before deletion.
- `Done when:` delete attempts are blocked when open quotes or active contracts exist, warning/confirm modals are shown per policy, and deletion succeeds only when guard checks pass.
- `Test gate:` `MG-G1`.
- `Risk notes:` current `deleteService(eventId)` publisher exists; extend safely.

#### S4-E1
- `ID:` `S4-E1`
- `Status:` `REMAINING`
- `Objective:` Add edit conflict/race detection and user recovery flow.
- `Depends on:` none
- `Files to modify/create:`
  - `src/routes/(protected)/dashboard/create-service/+page.svelte`
  - `src/lib/utils/service-edit-conflict.ts`
- `Implementation steps:`
  1. Snapshot source version at edit load.
  2. Re-check latest version on submit.
  3. Abort/update UI on conflict with deterministic error code.
- `Done when:` stale edit submit is rejected with deterministic conflict code, user sees recovery path, and no newer event is overwritten.
- `Test gate:` `MG-G2`.
- `Risk notes:` avoid silent overwrite of newer listing events.

#### S4-M1
- `ID:` `S4-M1`
- `Status:` `REMAINING`
- `Objective:` Add messaging templates, optional DM mirror behavior, and quote-notification foundation for canonical service quote events.
- `Depends on:` `S4-Q1`,`S4-R1`
- `Files to modify/create:`
  - `src/lib/nostr/nip44.ts`
  - `src/lib/utils/service-quote/publish.ts`
  - `src/lib/utils/service-quote/query.ts`
  - `src/lib/stores/service-quote-ui.store.ts`
  - `src/lib/api/services/push-notification.service.ts`
- `Implementation steps:`
  1. Define optional DM mirror payload contract.
  2. Add template generation and mirror send path.
  3. Send push notifications from canonical request/proposal publish paths only for inquiry received and proposal received.
  4. Reuse existing `pushNotificationService` with canonical deep links for tasker quotes exact-thread focus and my-services quote inbox exact-thread focus.
  5. Define the shared non-blocking + idempotent notification foundation reused later by Phase `4B` funded-contract push and `S4-IB1C` instant-buy push wiring.
  6. Keep `NotificationCenter` and in-app inbox work out of scope.
- `Done when:` canonical quote publish succeeds regardless of DM mirror/push result, mirror/push failures are non-blocking, inquiry/proposal pushes use canonical exact-focus deep links for tasker/provider quote surfaces, duplicate sends are prevented per canonical event/action, and the shared notification foundation is ready for later funded-contract and instant-buy wiring without premature escrow-path edits.
- `Test gate:` `INT-G1`.
- `Risk notes:` canonical state authority remains quote/contract events, not DMs or notification side effects.

#### S4-AC1A
- `ID:` `S4-AC1A`
- `Status:` `REMAINING`
- `Objective:` Extract the shared contracts-surface baseline for task + service contexts before funded acceptance wiring.
- `Depends on:` `S4-R1`
- `Files to modify/create:`
  - `src/lib/components/contracts/DashboardContractsPanel.svelte`
  - `src/lib/components/contracts/ContractDrawer.svelte`
  - `src/lib/components/contracts/ContractActions.svelte`
  - `src/lib/components/contracts/ContractContextSummary.svelte`
  - `src/lib/components/contracts/actions/ContractActionBar.svelte`
  - `src/lib/components/contracts/actions/CompleteContractButton.svelte`
  - `src/lib/components/contracts/actions/AcceptContractButton.svelte`
  - `src/lib/components/contracts/actions/CancelContractButton.svelte`
  - `src/lib/components/contracts/actions/DisputeContractButton.svelte`
  - `src/lib/components/contracts/actions/ResolutionProposalButton.svelte`
  - `src/lib/stores/contract.store.ts`
- `Implementation steps:`
  1. Extract `ContractContextSummary`, `ContractActionBar`, and per-action contract button components so task and service contract surfaces share one implementation path instead of patching duplicated task-biased markup in place.
  2. Adapt shared contracts surfaces so service contracts can render immutable agreement snapshots, context filters, and deterministic highlight recovery without creating a second contracts UI.
  3. Keep placement/styling aligned with task patterns by reusing the extracted action-bar/button components everywhere contract actions are shown.
- `Done when:` extracted shared contract action/summary components are the canonical implementation path for both task and service contexts, contracts filters/highlight/context rendering behave deterministically for services, and Phase `4A` gate criteria in `services-quotes-execution-plan.md` are satisfiable through this owned slice.
- `Test gate:` `ACC-G1A`.
- `Risk notes:` this slice is extraction/rendering only; do not wire funded acceptance or service-specific completion behavior here.

#### S4-AC1B
- `ID:` `S4-AC1B`
- `Status:` `REMAINING`
- `Objective:` Implement the service acceptance engine, durable idempotency ledger, reconciliation flow, and shared contract-create path.
- `Depends on:` `S4-Q4`, `S4-M1`, `S4-R1`, `S4-AC1A`
- `Files to modify/create:`
  - `src/lib/utils/service-quote/accept.ts`
  - `src/lib/utils/service-quote/acceptance-ledger.ts`
  - `src/lib/utils/service-quote/reconciliation.ts`
  - `src/lib/utils/service-contract/create-from-snapshot.ts`
  - `src/lib/utils/escrow/v1/escrow.ts`
  - `src/lib/utils/escrow/v1/nostrContract.ts`
  - `src/lib/utils/escrow/v1/escrowEvents.ts`
- `Implementation steps:`
  1. Implement negotiated quote acceptance through the shared service-contract adapter and durable acceptance/reconciliation flow.
  2. Enforce unique deterministic `purchaseKey`/idempotency semantics and fail closed until ABI prerequisites in `services-quotes-execution-plan.md` are satisfied.
  3. Keep canonical success handoff target data ready for `/dashboard?tab=contracts&context=services&highlight=<escrowId>` without wiring UI continuity here.
- `Done when:` negotiated acceptance creates service-context contracts through the shared adapter, multi-click/multi-tab/reorg/tx-replaced cases reconcile deterministically, and the acceptance-engine subset of Phase `4B` gate criteria in `services-quotes-execution-plan.md` is satisfiable through this owned slice.
- `Test gate:` `ACC-G1B`.
- `Risk notes:` this slice owns the engine and ledger path only; it must not duplicate contracts-surface rendering concerns handled by `S4-AC1A`.

#### S4-AC1C
- `ID:` `S4-AC1C`
- `Status:` `REMAINING`
- `Objective:` Wire funded service-contract UX, service-aware completion/actions, and contracts handoff on top of the extracted surfaces + acceptance engine.
- `Depends on:` `S4-AC1A`, `S4-AC1B`, `S4-M1`
- `Files to modify/create:`
  - `src/lib/components/contracts/DashboardContractsPanel.svelte`
  - `src/lib/components/contracts/ContractDrawer.svelte`
  - `src/lib/components/contracts/ContractActions.svelte`
  - `src/lib/components/contracts/TaskCompletionModal.svelte`
  - `src/lib/api/services/push-notification.service.ts`
- `Implementation steps:`
  1. Wire funded acceptance outcomes into the shared contracts surfaces with canonical handoff to `/dashboard?tab=contracts&context=services&highlight=<escrowId>`.
  2. Make shared completion/action surfaces service-aware: service wording, agreement-detail exposure, and parity-preserving task/service action behavior.
  3. Reuse the `S4-M1` notification foundation so funded service-contract push fires only after successful contract creation.
- `Done when:` service completion modal uses service wording and exposes agreement snapshot details, funded handoff lands in shared contracts surfaces with deterministic continuity, task contract actions remain regression-free after shared extraction, and the remaining UX/handoff subset of Phase `4B` gate criteria in `services-quotes-execution-plan.md` is satisfiable through this owned slice.
- `Test gate:` `ACC-G1C`.
- `Risk notes:` this slice may extend outcomes/labels/continuity only; acceptance engine invariants remain `S4-AC1B` ownership.

#### S4-IB1A
- `ID:` `S4-IB1A`
- `Status:` `REMAINING`
- `Objective:` Add the instant-buy schema, authoring controls, and eligibility baseline for eligible `FIXED` and `TIERED` services.
- `Depends on:` none
- `Files to modify/create:`
  - `src/lib/types/service.d.ts`
  - `src/lib/stores/service.store.ts`
  - `src/lib/nostr/service.ts`
  - `src/lib/components/service/steps/ServicePricing.svelte`
  - `src/routes/(protected)/dashboard/create-service/+page.svelte`
  - `src/lib/utils/service-instant-buy/eligibility.ts`
  - `src/lib/utils/service-instant-buy/time-derivation.ts`
- `Implementation steps:`
  1. Add listing-level `instantBuyLeadHours: number` configuration to the service model, store shape, nostr serialization, and parsing contract, validated as integer hours in the range `0..720`.
  2. In create/edit UX, show instant-buy controls only for `FIXED` and `TIERED`, require `instantBuyLeadHours` only when instant buy is enabled, use one listing-level lead-time field for tiered services in v1, and hide/clear the field when instant buy is disabled.
  3. Limit v1 eligibility to `FIXED` and `TIERED` listings with valid `instantBuyLeadHours`, required delivery-time data, and no add-ons, rush, hourly, inquiry-required, or distance-fee logic.
  4. Lock deterministic time-derivation helpers based on `deliveryTime.max` conversion (`hour=3600`, `day=86400`, `week=604800`, `month=2592000`) for reuse by confirmation and contract creation.
- `Done when:` create/edit flow persists `instantBuyLeadHours` cleanly, field visibility/clearing rules are enforced, parsed listings expose deterministic instant-buy eligibility, and time-derivation helpers are available as shared inputs for later instant-buy steps.
- `Test gate:` `BUY-G1A`.
- `Risk notes:` keep eligibility pure and fail-closed; do not wire purchase CTAs or contract creation in this slice.

#### S4-IB1B
- `ID:` `S4-IB1B`
- `Status:` `REMAINING`
- `Objective:` Add buyer-facing instant-buy CTA, tier selection, and confirmation UX on service detail pages while preserving the normal request-quote path.
- `Depends on:` `S4-IB1A`
- `Files to modify/create:`
  - `src/lib/components/service/ServiceDetailsView.svelte`
  - `src/lib/components/service/ServiceTierSelector.svelte`
  - `src/lib/components/service/ServiceInstantBuyModal.svelte`
  - `src/lib/utils/service-instant-buy/eligibility.ts`
  - `src/lib/utils/service-instant-buy/time-derivation.ts`
- `Implementation steps:`
  1. Add `Buy Now` only on service detail pages, not on browse cards or separate dashboard surfaces.
  2. Keep `Request Quote` on the same detail surface for eligible services as the custom-work fallback.
  3. Reuse existing `ServiceTierSelector` for tiered instant-buy selection and disable `Buy Now` until a tier is selected.
  4. Show confirmation modal/drawer with service title, provider, included scope, selected tier when applicable, price snapshot, estimated start, and estimated end.
  5. Require confirmation UX to reuse the same agreement-summary shape used by shared contracts surfaces rather than introducing a second summary structure.
- `Done when:` eligible fixed/tiered services expose `Buy Now` with `Request Quote` alongside it, `Request Quote` continues to enter the negotiated quote flow unchanged on those same listings, tiered purchases require tier selection, ineligible services fall back to `Request Quote` only, and confirmation surfaces expose the full purchase snapshot with derived timing before create is attempted.
- `Test gate:` `BUY-G1B`.
- `Risk notes:` this slice is UX-only; do not create escrow, redirect, or send push from CTA wiring alone.

#### S4-IB1C
- `ID:` `S4-IB1C`
- `Status:` `REMAINING`
- `Objective:` Complete instant-buy create/redirect/push handoff through the shared service contract path.
- `Depends on:` `S4-IB1A`, `S4-IB1B`, `S4-M1`, and `S4-AC1C`
- `Files to modify/create:`
  - `src/lib/components/service/ServiceDetailsView.svelte`
  - `src/lib/components/service/ServiceInstantBuyModal.svelte`
  - `src/lib/utils/service-instant-buy/create.ts`
  - `src/lib/utils/service-contract/create-from-snapshot.ts`
  - `src/lib/utils/escrow/v1/escrow.ts`
  - `src/lib/utils/escrow/v1/nostrContract.ts`
  - `src/lib/api/services/push-notification.service.ts`
- `Implementation steps:`
  1. Before showing final confirm state and again before create, revalidate the latest listing version and fail closed when the loaded listing is stale or no longer instant-buy eligible.
  2. `src/lib/utils/service-instant-buy/create.ts` may validate/select/snapshot input, but all contract payload shaping must delegate to the shared `createServiceContractFromSnapshot(...)` adapter; it must not build escrow payloads directly.
  3. Create the service-context contract through the shared snapshot adapter, using the deterministic time-derivation contract from `S4-IB1A`.
  4. Redirect success path to `/dashboard?tab=contracts&context=services&highlight=<escrowId>` and send provider push notification using the same notification foundation as quoted service contracts.
  5. Keep instant-buy orders out of quote timelines and require contracts labeling to distinguish `Instant Buy` from negotiated `Quoted Service`.
- `Done when:` the latest listing version is revalidated before confirm/create and stale data fails closed, successful purchase creates a service-context contract through the shared snapshot adapter and redirects to contracts, contracts created via instant buy render `Instant Buy` while negotiated service contracts render `Quoted Service`, provider push fires only after successful contract creation, retry/cancel semantics remain deterministic, and instant-buy orders do not create quote timeline entries.
- `Test gate:` `BUY-G1C`.
- `Risk notes:` requires `Phase 4B` shared service contract creation/reconciliation baseline; do not add a parallel order-management area, and keep post-purchase lifecycle entirely in shared `Contracts`.

#### S4-UX1
- `ID:` `S4-UX1`
- `Status:` `REMAINING`
- `Objective:` Harden user-state UX across quotes, contracts, and instant-buy flows so loading/empty/error/pending/wallet/deep-link continuity is deterministic.
- `Depends on:` `S4-Q3`, `S4-Q4`, `S4-M1`, `S4-AC1C`, `S4-IB1C`
- `Files to modify/create:`
  - `src/routes/(protected)/dashboard/+page.svelte`
  - `src/lib/stores/service-quote-ui.store.ts`
  - `src/lib/components/service/quotes/ServiceQuotesInbox.svelte`
  - `src/lib/components/dashboard/quotes/MyQuotesPanel.svelte`
  - `src/lib/components/contracts/DashboardContractsPanel.svelte`
  - `src/lib/components/contracts/ContractDrawer.svelte`
  - `src/lib/components/contracts/ContractActions.svelte`
  - `src/lib/components/service/ServiceDetailsView.svelte`
  - `src/lib/components/service/ServiceInstantBuyModal.svelte`
  - `src/lib/utils/wallet/contractErrorHandler.ts`
- `Implementation steps:`
  1. Add deterministic loading, empty, and fetch-error states for tasker quotes, provider quotes, contracts highlight handoff, and instant-buy confirmation.
  2. Add recent-submit/recent-create syncing states so post-submit redirects and post-create redirects remain user-visible while query/contract data catches up.
  3. Add relay-partial/offline/reconnect UX: show non-blocking stale-data/reconnecting messaging, disable state-changing actions while required data quorum is unavailable, and provide deterministic retry/refresh behavior.
  4. Lock wallet/preflight UX for negotiated acceptance and instant buy: disconnected wallet -> connect-wallet prompt, wrong network -> switch-network prompt, insufficient funds -> inline actionable error, preflight failure -> remain on current surface with deterministic recovery messaging.
  5. Add interaction locking during in-flight accept/buy actions: disable duplicate clicks, keep the current surface open, and show pending-progress text until success, failure, or cancel.
  6. Add permission-denied/stale-action UX: keep the user on the current surface, show deterministic in-context rejection messaging, immediately re-resolve the affected state, replace invalid actions with the new valid state, and clear only invalid focus params when required.
  7. Keep expired items and converted-to-contract items visible as read-only rows with deterministic badges/status copy; converted rows must expose `View Contract`, and expired tasker rows must link back to canonical service detail route `/services/[serviceId]`, reopening the request-quote entry point with prior valid context when available.
  8. Add provider continuity shortcuts: exact-focus request deep links in the provider inbox and a deterministic `View Active Contracts` shortcut from service-management surfaces when active service contracts exist.
  9. Canonicalize `View Active Contracts` destination behavior: when exactly one related active service contract exists, open `/dashboard?tab=contracts&context=services&highlight=<escrowId>` for that contract; when multiple related active service contracts exist, deterministically choose the most recently updated active contract, tie-break by latest creation time, then lexical `escrowId`, and open that contract via the same route.
- `Done when:` quotes/contracts/instant-buy surfaces all expose deterministic loading/empty/error/syncing states, offline/partial-data conditions disable unsafe actions with recovery affordances, wallet/preflight failures keep the user in-context with explicit next actions, in-flight accept/buy actions suppress duplicate interaction, permission-denied/stale-action cases re-resolve in place with updated CTAs, expired and converted rows remain visible with correct follow-up CTAs, failed request publish preserves draft values/attachments with inline retry, provider deep links can focus exact inquiry threads, `View Active Contracts` uses one deterministic destination rule even when multiple related contracts exist, and users can reach the resulting service contract without relying on push delivery alone.
- `Test gate:` `UX-G1`.
- `Risk notes:` UX hardening must extend existing surfaces; do not create separate inbox, checkout, or contract-management screens.

#### S4-P1
- `ID:` `S4-P1`
- `Status:` `REMAINING`
- `Objective:` Expose services on profile (listing, links, count).
- `Depends on:` none
- `Files to modify/create:`
  - `src/routes/(protected)/dashboard/profile/+page.svelte`
  - `src/routes/(protected)/dashboard/profile/+page.ts`
  - `src/lib/stores/profile.store.ts`
- `Implementation steps:`
  1. Add service list module on profile.
  2. Add links to service detail pages.
  3. Add profile service count metric.
- `Done when:` profile page shows service list, service count, and working links to `/services/[serviceId]` for users with active services.
- `Test gate:` `INT-G3`.
- `Risk notes:` keep profile-edit metadata support backward compatible.

#### S4-H1
- `ID:` `S4-H1`
- `Status:` `REMAINING`
- `Objective:` Add an MVP homepage featured-services module that reuses existing service discovery/detail paths and one shared featured-section shell for homepage services + tasks.
- `Depends on:` `S4-R1`
- `Files to modify/create:`
  - `src/routes/+page.svelte`
  - `src/lib/services/featuredHomepage.ts`
  - `src/lib/services/featuredServices.service.ts`
  - `src/lib/components/homepage/FeaturedServiceCard.svelte`
  - `src/lib/components/homepage/FeaturedHomepageSection.svelte`
  - `src/lib/components/homepage/FeaturedHomepageCardShell.svelte`
  - `src/lib/types/homepage.ts`
  - translation files used by homepage section labels/messages
- `Implementation steps:`
  1. Create a shared homepage-featured data helper (`featuredHomepage.ts`) for cache TTL, capped result shaping, and section-state normalization; `FeaturedTasksService` and `featuredServices.service.ts` must both use it so the homepage does not duplicate loader/cache logic per domain.
  2. Create a lightweight `featuredServices` homepage service that reuses the shared homepage-featured helper and sources from `findServices(...)`; do not import browse-page store state into homepage loading.
  3. Lock the MVP selection rule: active + non-deleted public services only, dedupe by service id, prefer listings with portfolio images, sort newest first, and limit to exactly `8` items.
  4. Create `FeaturedHomepageSection.svelte` as the shared shell for homepage featured-services and featured-tasks sections so both surfaces share the same background, heading treatment, grid spacing, section-level layout, and CTA behavior. The section-level CTA must match current featured-tasks semantics exactly: top-right `View All` link routes to the domain list page (`/services` or `/tasks`) and bottom primary CTA routes to the same page (`Browse Services` or `Browse Tasks`).
  5. Create `FeaturedHomepageCardShell.svelte` as the shared homepage card frame for image/title/meta/CTA layout, and require both `LiveTaskCard` and `FeaturedServiceCard` to use it so homepage card structure is not duplicated per domain.
  6. Create `FeaturedServiceCard.svelte` as a lightweight homepage card that reuses the shared homepage card shell plus existing service display helpers for translated title/description, pricing summary, and image fallback; do not reuse browse/map-specific card behavior.
  7. Update homepage ordering so `Featured Services` occupies the current featured-tasks slot, `Featured Tasks` moves below the `Why Choose BitTasker?` section, and both sections use the same shared visual shell.
  8. Keep homepage cards read-only in MVP: service cards expose only `View Service`, task cards keep their current view-only behavior, and no homepage `Request Quote`, `Buy Now`, share drawer, or map behavior is added.
  9. Use a section-local skeleton loading pattern, not a spinner, for featured services. The shared section shell must render deterministic skeleton cards that reserve the final layout and prevent visible layout shift while services are loading.
  10. Hide the featured-services section entirely when the query returns `0` items or errors; homepage rendering must continue without blocking after loading completes.
  11. Lock MVP card/content rules: fixed image aspect ratio, clamped text, deterministic pricing fallback (`FIXED` exact price, `TIERED` `From $X`, `INQUIRY_REQUIRED` `Request Quote`), keyboard-accessible full-card click target, and lazy-loaded images.
- `Done when:` homepage renders `Featured Services` above featured tasks using the same shared section shell/styling and CTA semantics as featured tasks, featured services show exactly `8` cards when available, the shared homepage card shell is the canonical card-frame path for both featured tasks and featured services, featured-services loading uses deterministic skeleton cards, the entire featured-services section is hidden on empty/error after loading completes, featured tasks render below `Why Choose BitTasker?` using the same shared shell, service cards route to `/services/[serviceId]`, homepage cards remain view-only, and all `HOME-G1` tests pass.
- `Test gate:` `HOME-G1`.
- `Risk notes:` keep this as an organic-discovery MVP only; paid boosting/personalization remain out of scope.

#### S4-SEO1
- `ID:` `S4-SEO1`
- `Status:` `PARTIAL`
- `Objective:` Complete SEO work (JSON-LD + metadata parity for service detail).
- `Depends on:` none
- `Files to modify/create:`
  - `src/routes/services/[serviceId]/+page.svelte`
  - `src/routes/services/+layout.ts`
- `Implementation steps:`
  1. Emit valid JSON-LD for service detail.
  2. Verify OG/Twitter/meta parity and canonical metadata for service detail.
- `Done when:` `SEO-G1` test suite passes and JSON-LD + metadata parity validation asserts pass for service detail route metadata.
- `Test gate:` `SEO-G1`.
- `Risk notes:` preserve existing working title/description tags.

#### S4-CI1
- `ID:` `S4-CI1`
- `Status:` `REMAINING`
- `Objective:` Re-enable Playwright CI and enforce required quote gate jobs (`service-quote-gates`, `service-quote-e2e`).
- `Depends on:` `S4-Q3`, `S4-Q4`, `S4-AC1C`, `S4-IB1C`, `S4-UX1`, `S4-H1`
- `Files to modify/create:`
  - `.gitlab-ci.yml`
  - `playwright.config.ts`
  - `tests/e2e/service-quotes-tasker.spec.ts`
  - `tests/e2e/service-quotes-taskee.spec.ts`
  - `tests/e2e/service-quotes-contracts.spec.ts`
  - `tests/e2e/service-instant-buy.spec.ts`
  - `tests/e2e/homepage-featured-services.spec.ts`
- `Implementation steps:`
  1. Add/enable required `service-quote-gates` and `service-quote-e2e` jobs in CI.
  2. Ensure CI runs service-quotes, service-instant-buy, and homepage featured-services suites for Chromium and Mobile Safari.
  3. Enforce deterministic E2E env bootstrap (backend URL, seeded accounts, relay/test-data setup).
  4. Enforce deterministic Playwright execution in gate runs (`--retries=0`).
  5. Block merge when either required job fails.
- `Done when:` `.gitlab-ci.yml` contains active `service-quote-gates` and `service-quote-e2e` jobs, both jobs include `merge_request_event` rules, neither job sets `allow_failure: true`, project merge policy enforces successful pipelines, and service-quotes, service-instant-buy, plus homepage featured-services suites pass for both browser targets in CI with `--retries=0`.
- `Test gate:` `CI-G1`.
- `Risk notes:` no bypass paths that skip required E2E checks.

#### S4-T1
- `ID:` `S4-T1`
- `Status:` `REMAINING`
- `Objective:` Add unit tests for remaining service domain work.
- `Depends on:` `S4-Q1`, `S4-Q2A`, `S4-Q2B`, `S4-Q2C`, `S4-D1`, `S4-E1`, `S4-AC1A`, `S4-AC1B`, `S4-AC1C`, `S4-IB1A`, `S4-IB1C`
- `Files to modify/create:`
  - `src/lib/tests/unit/service-quote/*.test.ts`
  - `src/lib/tests/unit/service/*.test.ts`
- `Implementation steps:` cover quote publish logic, service delete guards, conflict handling, and instant-buy eligibility/time-derivation helpers.
- `Done when:` target service unit suites are green.
- `Test gate:` `TEST-G1`.
- `Risk notes:` avoid brittle relay/network dependencies in unit layer.

#### S4-T2
- `ID:` `S4-T2`
- `Status:` `REMAINING`
- `Objective:` Add component tests for new/changed service UIs.
- `Depends on:` `S4-Q3`, `S4-Q4`, `S4-D1`, `S4-E1`, `S4-AC1A`, `S4-AC1C`, `S4-IB1A`, `S4-IB1B`, `S4-UX1`, `S4-P1`, `S4-H1`
- `Files to modify/create:`
  - `src/lib/tests/components/service/*.test.ts`
  - `src/lib/tests/components/dashboard/*.test.ts`
  - `src/lib/tests/components/homepage/*.test.ts`
- `Implementation steps:` cover modal, quotes panels, proposal review surface, instant-buy confirmation, wallet/preflight states, loading/empty/error states, homepage featured-services card/shell behavior, and management actions.
- `Done when:` component suites are green.
- `Test gate:` `TEST-G2`.
- `Risk notes:` keep assertions behavior-focused.

#### S4-T3
- `ID:` `S4-T3`
- `Status:` `REMAINING`
- `Objective:` Add integration/E2E flows and enforce in CI.
- `Depends on:` `S4-Q1`, `S4-Q2A`, `S4-Q2B`, `S4-Q2C`, `S4-Q3`, `S4-Q4`, `S4-D1`, `S4-E1`, `S4-M1`, `S4-AC1A`, `S4-AC1B`, `S4-AC1C`, `S4-IB1A`, `S4-IB1B`, `S4-IB1C`, `S4-UX1`, `S4-P1`, `S4-H1`, `S4-SEO1`, `S4-CI1`
- `Files to modify/create:`
  - `tests/e2e/service-quotes-*.spec.ts`
  - `tests/e2e/service-instant-buy*.spec.ts`
  - `tests/e2e/tasks-services-regression-*.spec.ts`
  - `tests/e2e/homepage-featured-services*.spec.ts`
- `Implementation steps:`
  1. Add canonical request -> proposal -> non-funded tasker status E2E.
  2. Add instant-buy happy-path E2E for eligible fixed and tiered services on service detail.
  3. Add UX-hardening E2E for provider request deep links, recent-submit syncing, wallet/preflight failures, and contracts handoff recovery.
  4. Add homepage featured-services E2E covering ordering, hide-on-empty behavior, shared section shell styling contract, and service-card navigation.
  5. Add regression coverage for existing task/services behavior.
  6. Validate `service-quote-gates` and `service-quote-e2e` from `S4-CI1` remain green on both browser targets.
  7. Keep escrow-funded accept -> contracts handoff E2E scoped to `S4-AC1B` + `S4-AC1C` / Phase `4B` gates in `services-quotes-execution-plan.md`.
- `Done when:` all `service-quotes-*.spec.ts`, `service-instant-buy*.spec.ts`, `homepage-featured-services*.spec.ts`, and `tasks-services-regression-*.spec.ts` suites pass for Chromium and Mobile Safari with `--retries=0`, and both required CI jobs from `CI-G1` are green.
- `Test gate:` `TEST-G3`.
- `Risk notes:` do not re-enable CI with legacy command paths that bypass intended env behavior.

#### S4-T4
- `ID:` `S4-T4`
- `Status:` `REMAINING`
- `Objective:` Add visual/performance/accessibility gates.
- `Depends on:` `S4-Q3`, `S4-Q4`, `S4-AC1A`, `S4-AC1C`, `S4-IB1B`, `S4-IB1C`, `S4-UX1`, `S4-H1`, `S4-SEO1`
- `Files to modify/create:` visual/perf/a11y test configs/specs
- `Implementation steps:` add baseline snapshots, perf thresholds, a11y checks, and UX-state coverage for loading/error/offline banners and disabled-action affordances.
- `Done when:` visual snapshots have `0` diffs, accessibility tests report `0` critical WCAG violations, homepage featured-services and featured-tasks sections satisfy the shared visual-shell contract, and performance tests pass pinned numeric budgets defined in the suite configs.
- `Test gate:` `TEST-G4`.
- `Risk notes:` ensure thresholds are realistic for current infra.

#### S4-DOC1
- `ID:` `S4-DOC1`
- `Status:` `PARTIAL`
- `Objective:` Complete code-level documentation for new/changed service modules.
- `Depends on:` `S4-Q1`, `S4-Q2A`, `S4-Q2B`, `S4-Q2C`, `S4-Q3`, `S4-Q4`, `S4-D1`, `S4-E1`, `S4-M1`, `S4-AC1A`, `S4-AC1B`, `S4-AC1C`, `S4-IB1A`, `S4-IB1B`, `S4-IB1C`, `S4-UX1`, `S4-P1`, `S4-H1`, `S4-SEO1`
- `Files to modify/create:` source comments/docs references
- `Implementation steps:` document APIs/props/contracts for remaining deltas, including UX-state codes/messages and wallet/preflight handling contracts.
- `Done when:` every modified service-quote/service module exports documented public APIs and doc coverage assertions in `DOC-G1` pass.
- `Test gate:` `DOC-G1`.
- `Risk notes:` keep docs aligned with actual runtime, not planned abstractions.

#### S4-DOC2
- `ID:` `S4-DOC2`
- `Status:` `REMAINING`
- `Objective:` Publish user-facing docs for service listing/quotes workflows.
- `Depends on:` `S4-DOC1`
- `Files to modify/create:` `docs/services/*` pages/runbooks
- `Implementation steps:` write how-to + FAQ + troubleshooting for service lifecycle, including instant-buy eligibility and fallback to request quote, wallet/preflight recovery, offline/partial-data states, and contract handoff/navigation.
- `Done when:` user docs include request/proposal/status/acceptance flows, instant-buy flow/eligibility, route conventions, wallet/preflight troubleshooting, offline/partial-data recovery, and contract handoff/navigation steps, and `DOC-G2` assertions pass.
- `Test gate:` `DOC-G2`.
- `Risk notes:` avoid documenting deferred features as available.

### 4.4 Test and CI Gates (Remaining Only)

Execution contract per gate (local command, CI job, pass threshold):
Canonical CI contract:
- Required non-E2E gate job: `service-quote-gates`
- Required E2E gate job: `service-quote-e2e`
- Both jobs are required for merge.
- `Q-G1` (quote request publish):
  - command: `npm run test:unit -- --run src/lib/tests/unit/service-quote/protocol*.test.ts src/lib/tests/integration/service-quote/request-flow*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: all tests pass, `0` failed, `0` skipped for targeted suites, and failed request publish preserves modal draft values/attachments with inline retry instead of closing/resetting the entry surface
- `Q-G2A` (proposal publish `6421`):
  - command: `npm run test:unit -- --run src/lib/tests/unit/service-quote/proposal-publish*.test.ts src/lib/tests/integration/service-quote/proposal-linkage*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: valid proposal publish passes; invalid linkage/schema/cardinality attempts fail deterministically
- `Q-G2B` (status publish `6422`):
  - command: `npm run test:unit -- --run src/lib/tests/unit/service-quote/proposal-status*.test.ts src/lib/tests/unit/service-quote/status-authz*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: authorized actor statuses pass; unauthorized/invalid status publishes are rejected deterministically
- `Q-G2C` (resolver transitions/expiration):
  - command: `npm run test:unit -- --run src/lib/tests/unit/service-quote/resolver*.test.ts src/lib/tests/integration/service-quote/resolver-determinism*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: deterministic transition/terminal resolution and expiration invariants pass under out-of-order event arrival
- `R-G1` (shared reuse baseline):
  - command: `npm run test:unit -- --run src/lib/tests/unit/stores/draft-wizard.factory.test.ts src/lib/tests/unit/listing/indexing-core.test.ts src/lib/tests/unit/components/forms/schema-driven-field-renderer.test.ts src/lib/tests/unit/components/forms/form-validation-core.test.ts src/lib/tests/unit/components/shared/entity-share-button.test.ts src/lib/tests/unit/components/shared/usd-sats-input.test.ts src/lib/tests/unit/components/listing/listing-controls.test.ts src/lib/tests/unit/components/listing/listing-shell.test.ts src/lib/tests/unit/components/listing/unified-filter-drawer.test.ts src/lib/tests/unit/components/listing/public-listing-layout-shell.test.ts src/lib/tests/unit/utils/listing/create-listing-finder.test.ts src/lib/tests/integration/routes/tasks-services-parity.test.ts`
  - CI job: `service-quote-gates`
  - threshold: targeted Phase `1.5` extraction tests pass, tasks/services parity remains unchanged, and no duplicate standalone refactor track remains outside `S4-R1`
- `Q-G3` (taskee quotes UI):
  - command: `npm run test:unit -- --run src/lib/tests/components/service/quotes*.test.ts src/lib/tests/integration/service-quote/taskee*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: all tests pass with deterministic assertions, exact `service + request` focus behavior works, provider proposal composer blocks in-context when wallet/fee-tier prerequisites are missing, and no flaky retries accepted in CI
- `Q-G4` (tasker quotes UI):
  - command: `npm run test:unit -- --run src/lib/tests/components/dashboard/my-quotes*.test.ts src/lib/tests/integration/service-quote/tasker*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: all tests pass, route/deep-link parser contract tests (`tab/view/context/service/request/highlight`) pass including exact `request` focus behavior, and no flaky retries accepted in CI
- `MG-G1` (guarded delete):
  - command: `npm run test:unit -- --run src/lib/tests/integration/service-delete-guards*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: all blocked/allowed delete policy cases pass
- `MG-G2` (edit conflict/race):
  - command: `npm run test:unit -- --run src/lib/tests/integration/service-edit-conflict*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: stale-write rejection and recovery tests pass
- `INT-G1` (messaging + push integration):
  - command: `npm run test:unit -- --run src/lib/tests/integration/service-quote/messaging-mirror*.test.ts src/lib/tests/integration/service-quote/push-notifications*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: canonical quote publish succeeds when mirror or push path fails, canonical exact-focus deep links are emitted for inquiry/proposal pushes, and duplicate-notification protection passes deterministic retry/reconciliation tests
- `ACC-G1A` (shared contracts-surface extraction baseline):
  - command: `npm run test:unit -- --run src/lib/tests/components/contracts/context-filter*.test.ts src/lib/tests/components/contracts/highlight*.test.ts src/lib/tests/components/contracts/context-summary*.test.ts src/lib/tests/components/contracts/action-bar-parity*.test.ts src/lib/tests/integration/contracts/highlight-recovery*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: contracts filters/highlight/context-summary/action-bar behavior is deterministic for services, shared contract action/layout components are the canonical task + service path, and no duplicated contracts-surface implementation remains outside the extracted shared components
- `ACC-G1B` (service acceptance engine + reconciliation baseline):
  - command: `npm run test:unit -- --run src/lib/tests/unit/utils/escrow/service-proposal-accept*.test.ts src/lib/tests/unit/utils/escrow/service-proposal-ledger*.test.ts src/lib/tests/unit/utils/escrow/service-proposal-conversion*.test.ts src/lib/tests/unit/utils/escrow/service-proposal-reorg*.test.ts src/lib/tests/unit/utils/escrow/service-proposal-tx-replaced*.test.ts src/lib/tests/integration/service-quote/escrow-accept*.test.ts src/lib/tests/integration/service-quote/wallet-preflight*.test.ts`
  - command: `CI=1 npx playwright test tests/e2e/service-contracts*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/service-contracts*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - CI job: `service-quote-e2e`
  - threshold: negotiated acceptance creates a service-context contract through the shared adapter, wallet/preflight failures stay in-context with deterministic recovery actions, multi-click/reorg/tx-replaced cases reconcile deterministically, and no duplicate acceptance engine or escrow payload builder exists outside the shared service-contract path
- `ACC-G1C` (funded service-contract UX/handoff baseline):
  - command: `npm run test:unit -- --run src/lib/tests/integration/contracts/service-contract-notifications*.test.ts src/lib/tests/components/contracts/service-completion-modal*.test.ts src/lib/tests/integration/contracts/task-service-actions-parity*.test.ts`
  - command: `CI=1 npx playwright test tests/e2e/service-contracts*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/service-contracts*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - CI job: `service-quote-e2e`
  - threshold: service completion modal uses service wording and exposes agreement snapshot details, funded service-contract push fires only after successful contract creation, task contract actions remain regression-free after shared extraction, service contracts render immutable agreement snapshots with service-aware copy, and contracts handoff resolves to `/dashboard?tab=contracts&context=services&highlight=<escrowId>`
- `BUY-G1A` (instant-buy schema/eligibility):
  - command: `npm run test:unit -- --run src/lib/tests/unit/service-instant-buy/eligibility*.test.ts src/lib/tests/unit/service-instant-buy/time-derivation*.test.ts src/lib/tests/integration/service-instant-buy/lead-hours-roundtrip*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: `instantBuyLeadHours` round-trip passes through create/edit/store/serialization parsing, ineligible pricing modes or unsupported options fail closed, and deterministic time-derivation helpers return the canonical second conversions required by later instant-buy steps
- `BUY-G1B` (instant-buy CTA/confirmation):
  - command: `npm run test:unit -- --run src/lib/tests/components/service/instant-buy*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: eligible fixed/tiered services expose both `Buy Now` and `Request Quote`, ineligible services fall back to `Request Quote`, `Request Quote` still enters the negotiated flow unchanged on eligible listings, tier selection is enforced for tiered services, and confirmation shows the full purchase snapshot plus derived start/end before create is attempted
- `BUY-G1C` (instant-buy create/handoff):
  - command: `npm run test:unit -- --run src/lib/tests/integration/service-instant-buy/create-contract*.test.ts`
  - command: `CI=1 npx playwright test tests/e2e/service-instant-buy*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/service-instant-buy*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - CI job: `service-quote-e2e`
  - threshold: the latest listing version is revalidated before confirm/create with stale data failing closed, successful purchase redirects to contracts, contracts created via instant buy render `Instant Buy` while negotiated service contracts render `Quoted Service`, provider push fires only after successful contract creation, and no quote timeline entry is created for instant-buy orders
- `UX-G1` (ux hardening):
  - command: `npm run test:unit -- --run src/lib/tests/components/service/quotes-ux-states*.test.ts src/lib/tests/components/contracts/service-contract-ux*.test.ts src/lib/tests/integration/service-quote/request-syncing*.test.ts src/lib/tests/integration/service-quote/provider-request-focus*.test.ts src/lib/tests/integration/service-quote/wallet-preflight*.test.ts src/lib/tests/integration/service-quote/permission-denied*.test.ts src/lib/tests/integration/contracts/highlight-recovery*.test.ts`
  - command: `CI=1 npx playwright test tests/e2e/service-ux-hardening*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/service-ux-hardening*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - CI job: `service-quote-e2e`
  - threshold: request submit redirect shows syncing until query-visible, failed request publish preserves draft values/attachments with inline retry, provider deep links focus exact request threads, loading/empty/error/offline states are deterministic, wallet/preflight failures keep the user in-context with recovery actions, permission-denied/stale-action cases stay in-context and re-resolve with updated CTAs, converted rows expose `View Contract`, expired rows remain visible read-only, `View Active Contracts` uses one deterministic destination rule even with multiple related active contracts, and contracts highlight recovery can reach the newly created service contract without push-only reliance
- `INT-G3` (profile integration):
  - command: `npm run test:unit -- --run src/lib/tests/integration/profile-services*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: list/count/link tests pass
- `HOME-G1` (homepage featured services MVP):
  - command: `npm run test:unit -- --run src/lib/tests/unit/services/featured-homepage*.test.ts src/lib/tests/unit/services/featured-services*.test.ts src/lib/tests/components/homepage/featured-services*.test.ts src/lib/tests/components/homepage/featured-section-shell*.test.ts src/lib/tests/components/homepage/featured-card-shell*.test.ts src/lib/tests/integration/homepage/featured-services-ordering*.test.ts`
  - command: `CI=1 npx playwright test tests/e2e/homepage-featured-services*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/homepage-featured-services*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - CI job: `service-quote-e2e`
  - threshold: featured-services selection returns exactly `8` items max using the locked sort/dedupe/filter rule, featured-services and featured-tasks reuse the same shared homepage loader helper plus shared section shell/card shell, featured-services loading uses deterministic skeleton cards, featured-services renders above featured tasks, featured tasks render below `Why Choose BitTasker?`, both sections use the same shared visual shell/styling contract, section-level CTA semantics match current featured-tasks behavior (`View All` + bottom browse CTA routing to the domain list page), service cards remain view-only and route to `/services/[serviceId]`, and all targeted Chromium + Mobile Safari homepage tests pass with `--retries=0`
- `SEO-G1` (metadata/JSON-LD):
  - command: `npm run test:unit -- --run src/lib/tests/integration/services-seo*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: JSON-LD + metadata parity validation tests pass
- `CI-G1` (Playwright CI enablement):
  - command: `rg -n \"^service-quote-gates:\" .gitlab-ci.yml`
  - command: `sed -n '/^service-quote-gates:/,/^[^[:space:]]/p' .gitlab-ci.yml | rg -n \"merge_request_event\"`
  - command: `test -z \"$(sed -n '/^service-quote-gates:/,/^[^[:space:]]/p' .gitlab-ci.yml | rg 'allow_failure:\\s*true')\"`
  - command: `rg -n \"^service-quote-e2e:\" .gitlab-ci.yml`
  - command: `sed -n '/^service-quote-e2e:/,/^[^[:space:]]/p' .gitlab-ci.yml | rg -n \"merge_request_event\"`
  - command: `test -z \"$(sed -n '/^service-quote-e2e:/,/^[^[:space:]]/p' .gitlab-ci.yml | rg 'allow_failure:\\s*true')\"`
  - command: `curl -s --header \"PRIVATE-TOKEN: $GITLAB_TOKEN\" \"$CI_API_V4_URL/projects/$CI_PROJECT_ID\" | rg -n '\"only_allow_merge_if_pipeline_succeeds\":true'`
  - command: `CI=1 npx playwright test tests/e2e/service-quotes-*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/service-quotes-*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/service-instant-buy*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/service-instant-buy*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/homepage-featured-services*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/homepage-featured-services*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - CI job: `service-quote-e2e`
  - threshold: `service-quote-gates` and `service-quote-e2e` jobs are active in CI config, required for merge, and service-quotes, service-instant-buy, plus homepage featured-services suites pass on both browser targets with deterministic retries disabled (`--retries=0`)
  - env requirement: `GITLAB_TOKEN` with `read_api` scope for merge-policy verification command
  - env requirement: `CI_API_V4_URL` and `CI_PROJECT_ID` (provided by GitLab CI runtime); for local verification, set both explicitly
- `TEST-G1` (unit aggregate):
  - command: `npm run test:unit -- --run src/lib/tests/unit/service-quote/ src/lib/tests/unit/service/ src/lib/tests/unit/service-instant-buy/`
  - CI job: `service-quote-gates`
  - threshold: all suites pass
- `TEST-G2` (component aggregate):
  - command: `npm run test:unit -- --run src/lib/tests/components/service/ src/lib/tests/components/dashboard/ src/lib/tests/components/homepage/`
  - CI job: `service-quote-gates`
  - threshold: all suites pass
- `TEST-G3` (integration/E2E aggregate):
  - command: `CI=1 npx playwright test tests/e2e/service-quotes-*.spec.ts tests/e2e/service-instant-buy*.spec.ts tests/e2e/homepage-featured-services*.spec.ts tests/e2e/tasks-services-regression-*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `CI=1 npx playwright test tests/e2e/service-quotes-*.spec.ts tests/e2e/service-instant-buy*.spec.ts tests/e2e/homepage-featured-services*.spec.ts tests/e2e/tasks-services-regression-*.spec.ts --project='Mobile Safari' --workers=1 --retries=0 --reporter=line`
  - CI job: `service-quote-e2e`
  - threshold: both projects pass with `0` failed tests and `0` retries
- `TEST-G4` (visual/perf/a11y):
  - command: `CI=1 npx playwright test tests/e2e/service-quotes-visual*.spec.ts tests/e2e/homepage-featured-services-visual*.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`
  - command: `npm run test:unit -- --run src/lib/tests/integration/services-a11y*.test.ts src/lib/tests/integration/services-perf*.test.ts src/lib/tests/integration/homepage/homepage-featured-sections-a11y*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: `0` WCAG critical violations, `0` failed visual snapshots, homepage featured-services and featured-tasks sections satisfy the shared visual-shell contract, and perf checks pass pinned numeric budgets declared in the perf suite
- `DOC-G1` (code docs):
  - command: `npm run test:unit -- --run src/lib/tests/unit/docs/service-doc-coverage*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: public module/API docs coverage for all modified service files is `100%`
- `DOC-G2` (user docs):
  - command: `npm run test:unit -- --run src/lib/tests/integration/docs/service-user-docs*.test.ts`
  - CI job: `service-quote-gates`
  - threshold: docs assertions for implemented flows pass

`TEST-G3` prerequisite (must be complete before gate can pass):
- `service-quote-gates` must pass.
- `CI-G1` must pass.
- E2E environment contract must be present in CI: backend URL, seeded accounts, and deterministic relay/test data bootstrap.

Merge readiness for Section 4 requires all gates relevant to modified IDs to pass locally and in required CI jobs.

### 4.5 Deferred / Out of Scope (for this execution cycle)

- Full multi-select parity UX for location types in create-service flow (current runtime uses single active selection behavior).
- Optional translation-service/component refactor (`ServiceTranslationService`, `TranslatableService`) while current runtime translation pipeline is stable.
- Any redesign of already-working baseline components without direct relation to remaining IDs.

## 5. Testing Strategy Integration

### 5.1. Test-Driven Development Approach

**For Each Remaining Work ID (`S4-*`):**
1. Add or update failing tests for the mapped gate in Section `4.4`
2. Implement only the scoped delta for that ID
3. Run targeted unit/component/integration tests
4. Run relevant service E2E coverage
5. Mark the ID complete only when its gate is green locally and in CI

### 5.2. Testing by Remaining Workstream

**Quote Protocol and Lifecycle (`S4-Q1`, `S4-Q2A`, `S4-Q2B`, `S4-Q2C`):**
- Event schema/cardinality tests for `6420`/`6421`/`6422`
- Resolver transition and expiration tests
- Publish error-handling and retry-path tests

**Quotes UI Surfaces (`S4-Q3`, `S4-Q4`):**
- Dashboard route/query-state tests (`tab=my-services&view=quotes&service=<encodedServiceAddress>`, `tab=quotes&view=tasker`)
- Panel/detail/action flow tests for taskee + tasker roles
- Integration tests from quote request through proposal/status actions

**Management Safety (`S4-D1`, `S4-E1`):**
- Delete-guard tests for open quote/active-contract blocking
- Edit conflict/race detection and recovery tests
- Authorization and ownership regression tests

**Integrations and Discovery Enhancements (`S4-M1`, `S4-P1`, `S4-H1`, `S4-SEO1`):**
- Messaging mirror non-blocking behavior tests
- Profile services list/count/link tests
- Homepage featured-services discovery module with shared featured-section shell tests
- JSON-LD + metadata parity validation tests

**Quality and Completion Gates (`S4-CI1`, `S4-T1` to `S4-T4`, `S4-DOC1`, `S4-DOC2`):**
- Unit/component/integration/E2E service suites
- Visual regression, performance, and accessibility checks
- Code and user documentation completion checks against implemented behavior

**Mandatory completion rule:**
- Service quote-management scope in this plan is not complete until `service-quote-gates` and `service-quote-e2e` pass in CI (`TEST-G3`) for request -> proposal -> non-funded tasker lifecycle on both Chromium and Mobile Safari.
- Homepage featured-services scope is not complete until `HOME-G1` passes in CI on Chromium + Mobile Safari and both homepage featured sections satisfy the shared visual-shell contract.
- Escrow-funded acceptance and contracts handoff completion additionally require Phase `4B` gates from `requirements/services-quotes-execution-plan.md`.

### 5.3. Continuous Testing

**During Development:**
- Run unit tests on file changes
- Run linting on save
- Run type checking on build
- Visual testing in browser during development

**Before Commits:**
- Run full test suite
- Check TypeScript compilation
- Run linting
- Check for console errors

**Before Deployment:**
- Run full test suite
- Run integration tests
- Run visual regression tests
- Run performance tests
- Run accessibility tests

## 6. Key Considerations

Context-only reference section. If any statement conflicts with Section `4`, Section `4` controls implementation.

### 6.1. Nostr Event Design

**NIP-99 Base Standard:**
- **Reference:** NIP-99 (Classified Listings) - [NIP-99 Specification](https://github.com/nostr-protocol/nips/blob/master/99.md)
- **Standard Kinds:** NIP-99 defines `kind: 30402` (active) and `kind: 30403` (draft)
- **Our Implementation:** Uses NIP-99 standard kinds (`30402`/`30403`) for full compatibility and discoverability
- **Compatibility:** Fully compatible with NIP-99 - standard clients can discover and read services

**Event Kind:** Use NIP-99 standard kinds for service listings
- **Active Services:** `kind: 30402` - Discoverable by all NIP-99 clients
- **Draft Services:** `kind: 30403` - Drafts use NIP-99 standard draft kind
- **Full Interoperability:** Standard NIP-99 clients can discover services through standard queries
- **Advanced Features:** Extension tags and content JSON provide full BitTasker functionality
- **Backward Compatible:** Extension tags are ignored by NIP-99 clients but don't break compatibility

**Tag Conventions:**

**NIP-99 Compatible Tags (for interoperability):**
- `d`: Unique service identifier (`service-{uniqueId}`)
- `title`: Service title
- `summary`: Brief summary/tagline
- `published_at`: Publication timestamp
- `location`: Service location (Taskee's service location if tasker_location, or service location if taskee_location, or 'Remote')
- `price`: Price array `[amount, currency, frequency?]`
- `status`: 'active' | 'inactive' | 'sold' (NIP-99 status values)

**BitTasker Extension Tags (Human-Readable, NIP-99 Style):**
- `p`: Creator pubkey (standard Nostr tag - unchanged)
- `categories`: Category IDs array (BitTasker extension)
- `skills`: Skills tags array (BitTasker extension)
- `location_types`: Service location types array - `['remote', 'tasker_location', 'taskee_location']` (BitTasker extension)
  - Encoding rule: for indexed arrays (`categories`, `skills`, `location_types`), use one value per tag instance (repeat tag entries), not variable-length spread payloads
- `location_display_name`: Human-readable location display name for display purposes (BitTasker extension)
- `service_radius`: Service radius in km/miles (if tasker_location) - distance from Taskee's service location that they're willing to travel (BitTasker extension)
- `per_distance_charge`: Per-distance charge array `[amount, currency, unit]` (BitTasker extension)
- `pricing_type`: Pricing type - `'fixed' | 'hourly' | 'tiered' | 'inquiry_required'` (BitTasker extension)
  - `content.pricing.type` remains enum-based (`FIXED|HOURLY|TIERED|INQUIRY_REQUIRED`) and maps to lowercase only at tag boundary
- `min_price`: Minimum price (for tiered pricing) - lowest tier price for filtering (BitTasker extension)
- `max_price`: Maximum price (for tiered pricing) - highest tier price for filtering (BitTasker extension)
- **Note:** Full tier data (name, description, price, features) stored in `content.pricing.tiers[]` (content JSON) - not in tags

**Tag Naming Philosophy:**
- **Human-Readable Tags:** Follow NIP-99's pattern of using descriptive, self-documenting tag names
- **Benefits:** More maintainable, easier to understand, better for debugging, easier to extend NIP-99
- **Consistency:** Aligns with NIP-99's use of tags like `title`, `summary`, `location`, `price`, `status`
- **Standard Tags:** Keep standard Nostr tags (`d`, `p`) unchanged for protocol compatibility
- **Use `service-` prefix:** For `d` tag identifier (vs `task-` for tasks)
- **Potential NIP Extension:** Human-readable tags make this a candidate for proposing as a NIP-99 extension

**Event Updates:**
- Use parameterized replaceable events (same `d` tag, per NIP-16)
- Include `updatedAt` timestamp in content
- Update `published_at` tag only on initial publication
- Maintain event history through tags
- NIP-99 clients will see latest version automatically

### 6.2. Performance Optimization

**Caching:**
- Cache service search results
- Cache service detail pages
- Use service worker for offline support

**Indexing:**
- Index services for fast filtering
- Use frontend filtering for complex queries
- Optimize Nostr queries

**Lazy Loading:**
- Lazy load service images
- Lazy load portfolio galleries
- Lazy load service lists

### 6.3. User Experience

**Form UX:**
- Multi-step wizard prevents overwhelm
- Auto-save drafts prevent data loss
- Clear validation messages
- Progress indicators

**Search UX:**
- Fast search results
- Clear filter options
- Visual feedback for loading
- Empty states with helpful messages

**Detail Page UX:**
- Clear call-to-action buttons
- Easy contact methods
- Portfolio showcases work

### 6.4. Security Considerations

**Input Validation:**
- Validate all form inputs
- Sanitize user content
- Validate file uploads
- Rate limit service listing

**Access Control:**
- Only service owners can edit
- Verify Nostr signatures
- Validate event ownership

**Data Privacy:**
- Encrypt sensitive data
- Respect user privacy settings
- Secure file uploads

### 6.5. Scalability

**Event Management:**
- Efficient Nostr queries
- Pagination for large lists
- Caching strategies

**File Storage:**
- Optimize image sizes
- Use CDN for assets
- Compress uploads

**Database/Indexing:**
- Index services efficiently
- Optimize search queries
- Cache frequently accessed data

## 7. Success Metrics

### 7.1. Feature Adoption

- Number of services created
- Number of active services
- Service listing completion rate
- Service edit frequency

### 7.2. User Engagement

- Service detail page views
- Service search queries
- Contact provider clicks
- Service inquiry rate

### 7.3. Quality Metrics

- Service listing error rate
- Search performance (time to results)
- Page load times
- User satisfaction (surveys)

### 7.4. Business Metrics

- Services per provider
- Services per category
- Geographic distribution
- Pricing distribution

## 8. Future Enhancements

### 8.1. Advanced Features (Post-MVP)

- **Service Packages**: Bundle multiple services
- **Service Subscriptions**: Recurring service offerings
- **Service Reviews**: Reviews for service providers
- **Service Analytics**: Provider dashboard with quote metrics (requests received, proposals sent, accepted/withdrawn rates)
- **Featured Services**: Paid promotion / boosted ranking for services (homepage organic featured-services discovery remains in MVP scope under `S4-H1`)
- **Service Recommendations**: AI-powered service matching
- **Service Templates**: Pre-built service templates
- **Service Scheduling**: Integrated calendar booking

### 8.2. Integration Opportunities

- **Task Integration**: Link services to task categories
- **Task Bid Integration**: Allow service providers to participate in task bids without reusing task-bid protocol for service quotes
- **Wallet Integration**: Narrow MVP instant buy for eligible fixed-price and tiered services, reusing the same service contract path with provider-defined default start lead time and offer-based duration
- **Escrow Integration**: Secure service payments
- **Notification Integration**: MVP push notifications must reuse existing infrastructure for inquiry/proposal/contract-created events; instant-buy orders must use the same notification foundation

## 9. NIP-99 Integration Summary

Context-only reference summary. Delivery status and scope remain governed by Section `4`.

### 9.1. NIP-99 Compatibility

**Base Standard:** NIP-99 (Classified Listings) - [NIP-99 Specification](https://github.com/nostr-protocol/nips/blob/master/99.md)

**Compatible Elements:**
- ✅ Standard tags: `title`, `summary`, `published_at`, `location`, `price`, `status`
- ✅ Status tag uses NIP-99 values directly ('active' | 'inactive' | 'sold')
- ✅ Parameterized replaceable events (using `d` tag per NIP-16/33)
- ✅ Basic service information visible to NIP-99 clients
- ✅ Standard filtering by location, price, status
- ✅ Event kinds: `30402` (active) and `30403` (drafts) per NIP-99 specification

**Extensions:**
- ✅ Uses NIP-99 standard event kinds (`30402`/`30403`) for full compatibility
- ✅ Advanced pricing models (tiers, add-ons, inquiry forms)
- 🟡 Multiple location types model + per-distance charges exist; create-flow full multi-select parity remains deferred (see Section `4.5`)
- ✅ Service tiers and simple add-ons
- ✅ Inquiry form system
- ✅ Extended tag set for BitTasker-specific features

**Additional NIP Integrations:**
- ✅ **NIP-19:** Bech32-encoded service URLs (`naddr1...`) for sharing
- ✅ **NIP-50:** Full-text search for service discovery
- ✅ **File Upload Service:** Direct file uploads for portfolio items and inquiry photos (same as task attachments)

### 9.2. Interoperability Benefits

**For NIP-99 Clients:**
- ✅ **Full Discovery:** Can discover services through standard `kinds: [30402]` queries
- ✅ **Complete Basic Info:** Can read all standard NIP-99 tags (title, summary, location, price, status, published_at)
- ✅ **Standard Filtering:** Can filter by standard NIP-99 tags (location, price range, status)
- ⚠️ **Tiered Pricing:** NIP-99 `price` tag uses lowest tier price for discovery; `min_price`/`max_price` are BitTasker extensions and not guaranteed across generic NIP-99 clients
- ✅ **Interoperability:** Services appear in standard NIP-99 classified listing queries
- ⚠️ **Advanced Features:** Extension tags and advanced features in content JSON are ignored (gracefully)

**For BitTasker Clients:**
- ✅ **Full Discovery:** Can discover services through standard NIP-99 queries or extended filters
- ✅ **Complete Basic Info:** Can read all standard NIP-99 tags
- ✅ **Advanced Features:** Full access to tiers, add-ons, inquiry forms via content JSON
- ✅ **Extended Filtering:** Can filter by extension tags (categories, skills, location_types, pricing_type)
- 🟡 **Core Functionality:** Per-distance charges and service management are implemented; full create-flow multi-select parity for location types remains deferred in Section `4.5`

**For Developers:**
- Clear separation between NIP-99 compatible and extended features
- Human-readable tags make code self-documenting and easier to maintain
- Easy to add NIP-99 client support
- Human-readable tags align with NIP-99's philosophy, making this a potential extension candidate
- Maintains consistency with existing task system (though task system uses single-char tags)
- Extensible architecture for future enhancements
- Easier debugging and troubleshooting with descriptive tag names
