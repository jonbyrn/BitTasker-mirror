# Services Listing Feature Implementation Plan

## 1. Overview

This document outlines the plan for implementing a comprehensive Services Listing feature within BitTasker, allowing users (Taskees) to list and manage public service listings that showcase their skills and offerings. The feature extends **NIP-99 (Classified Listings)** to support BitTasker's advanced service features while maintaining interoperability with standard Nostr clients.

**NIP-99 Compatibility:** This implementation uses NIP-99 as the base standard and extends it with custom tags and features for advanced functionality (service tiers, simple add-ons, inquiry forms, etc.). Basic service information (title, summary, location, price) is stored in NIP-99 compatible tags for interoperability.

**Component Reuse Strategy:** This plan maximizes code reuse from the existing task creation system. Many components can be directly reused or adapted, significantly reducing development time and maintaining consistency across the platform. See section 4.2.2 for detailed component reuse analysis.

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
- **Proposal System**: Taskees can respond to inquiries with pricing proposals (reuses bid infrastructure for consistency)
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
- ✅ **NIP-19:** Bech32-encoded entities (`nservice1...` format - default) - standard Nostr format for parameterized replaceable events, encodes `pubkey`, `kind`, `d` tag, and optional relays
- ✅ **NIP-44:** Encryption (for secure service data if needed)
- ✅ **NIP-50:** Full-text search (for service discovery and search functionality)
- ✅ **NIP-51:** Lists (for saved services/favorites functionality)
- ✅ **File Upload Service:** Direct file uploads for portfolio items and inquiry form photos (same as task attachments)
- ✅ **NIP-99:** Classified Listings (base standard, extended for advanced features)

### 2.2. Gaps to Address

**New Components Needed:**
- ❌ Service listing form and wizard
- ❌ Service detail pages (public and protected)
- ❌ Service search and discovery system
- ❌ Service store management
- ❌ Service-specific Nostr event handling
- ❌ Service portfolio/gallery components
- ❌ Service pricing models (fixed, hourly, service tiers, simple add-ons, inquiry-based)
- ❌ Service location type management (multiple select: remote, at Tasker's location, at Taskee's location)
- ❌ Per-distance charge configuration and display
- ❌ Service tier management (multiple tiers with different features)
- ❌ Simple add-ons/extras system (optional extras with fixed prices)
- ❌ Customizable inquiry form builder
- ❌ Inquiry form submission with photo upload

**New Types and Enums:**
- ❌ Service-related TypeScript types
- ❌ Service status enums
- ❌ Service pricing type enums (including INQUIRY_REQUIRED)
- ❌ Service location type enums (multiple select support)
- ❌ Service tier types
- ❌ Add-on types (simple optional extras with fixed prices)
- ❌ Inquiry form field types

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
      type: 'fixed' | 'hourly' | 'tiered' | 'inquiry_required';
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
    naddr?: string;  // NIP-19 bech32-encoded service identifier (nservice1... format - default) - standard Nostr format
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
    ['p', creatorNpub], // Creator pubkey (standard Nostr tag)
    ['categories', ...categoryIds], // Categories (BitTasker extension)
    ['skills', ...skills], // Skills tags (BitTasker extension)
    ['location_types', ...serviceLocationTypes], // Multiple location types: 'remote' | 'tasker_location' | 'taskee_location'
    ['location_display_name', locationDisplayName], // Human-readable location display name (optional, for display purposes)
    ['service_radius', serviceRadius], // Service radius in km/miles (if tasker_location) - distance from Taskee's service location that they're willing to travel
    ['per_distance_charge', perDistanceChargeAmount, perDistanceChargeCurrency, perDistanceChargeUnit], // Per distance charge: [amount, currency, unit]
    ['pricing_type', pricingType], // Pricing type: 'fixed' | 'hourly' | 'tiered' | 'inquiry_required'
    // Note: Deletion handled via NIP-09 deletion events (kind 5), not status enum
    
    // Price range tags (for filtering - optional, added for tiered pricing)
    ...(pricingType === 'tiered' && pricing.tiers ? [
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

### 3.2. Data Models

**Service Location Types:**
```typescript
enum ServiceLocationTypeEnum {
  REMOTE = 'remote',                           // Online/virtual service
  TASKER_LOCATION = 'tasker_location',         // In-person at Tasker's location - flag indicating Taskee can travel to Tasker's location (Tasker's location unknown at listing time)
  TASKEE_LOCATION = 'taskee_location'          // In-person at Taskee's location - flag indicating service can be provided at Taskee's specified location or global location
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
// Used as input for listService() and updateService() functions
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
  // For TASKER_LOCATION (when service can be provided at Tasker's location)
  // Note: Tasker's location is unknown at listing time - this is just a flag/option
  // Taskee provides their own service location and radius indicating how far they're willing to travel
  taskerLocation?: {
    serviceLocation: Location;         // Taskee's service location (where they operate from - office, studio, base location)
    serviceRadius?: number;            // Service radius in km/miles - distance from Taskee's service location that they're willing to travel
    perDistanceCharge?: {
      amount: number;
      currency: string;                // 'BTC' | 'USDt'
      unit: 'km' | 'mile';            // Distance unit
    };
  };
  
  // For TASKEE_LOCATION (when service can be provided at Taskee's specified location)
  taskeeLocation?: {
    useGlobalLocation: boolean;        // Use Taskee's global app location setting
    serviceLocation?: Location;       // Specific service location where service can be provided (if not using global)
    locationDisplayName?: string;      // Human-readable location name for display
  };
}

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
│   │       └── ServiceInquiryForm.svelte
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
│       └── helpers/
│           ├── serviceHelpers.ts
│           ├── nip19ServiceNaddr.ts  // NIP-19 naddr/nservice encoding/decoding (standard Nostr format)
│           ├── serviceHelpers.ts     // Service utility functions
├── routes/
│   ├── (protected)/
│   │   └── dashboard/
│   │       ├── list-service/
│   │       │   └── +page.svelte
│   │       ├── my-services/
│   │       │   └── +page.svelte
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

## 4. Implementation Phases

### Phase 1: Foundation - Types, Enums, and Core Infrastructure

**Objective:** Establish the foundational data structures and core utilities needed for services.

#### 4.1.1. Create Service Types (`src/lib/types/service.d.ts`)

**Reuse from Task Types:**
- ✅ Type structure pattern from `src/lib/types/task.d.ts`
- ✅ Attachment interface (reuse as-is for portfolio items)
- ✅ Category type definitions
- ✅ Location type definitions (adapt for service location types)
- ✅ Store state interface pattern

**Features:**
- Define `Service` interface matching task structure but adapted for services
- Define `ServiceLocationDetails` interface for location-specific configurations
- Define `ServicePricing` interface with multiple pricing models (fixed, hourly, tiered, inquiry-based)
- Define `ServiceTier` interface for tiered pricing (includes delivery time and rush delivery)
- Define `DeliveryTime` interface for delivery time/turnaround time
- Define `RushDelivery` interface for dedicated rush delivery option (fixed amount, required rush delivery time range)
- Define `AddOn` interface for simple add-ons/extras
- Define `InquiryForm` and `InquiryFormField` interfaces for inquiry-based services
- Define `ServiceBody` interface for service listing/update
  - **Purpose:** Represents user input / form data / what goes in `event.content` (JSON stringified)
  - **Usage:** Input parameter for `listService()` and `updateService()` functions
  - **Store:** Used in service store to hold form data as user fills it out
  - **Difference from Service:** ServiceBody excludes event metadata (id, npub) which comes from the Nostr event itself
  - **Content Structure:** ServiceBody + metadata (creator, createdAt, uniqueId, translations) = what gets stringified into `event.content`
- Define `SearchServicesParams` interface matching task search patterns
- Define `NostrServiceEvent` interface for Nostr event structure
- Define `ServiceTranslations` interface for multilingual support
- Define NIP-99 compatible tag structures for interoperability

**Testing:**
- Unit tests for type validation
- TypeScript compilation checks
- Interface compatibility tests with existing task types

**Acceptance Criteria:**
- ✅ All service types defined and exported
- ✅ Types are compatible with existing task type patterns
- ✅ Types include proper JSDoc documentation
- ✅ TypeScript compilation passes without errors

#### 4.1.2. Create Service Enums (`src/lib/utils/enums/service.enum.ts`)

**Reuse from Task Enums:**
- ✅ Enum structure pattern from `src/lib/utils/enums/task.enum.ts`
- ✅ Status enum pattern (adapt for service statuses)
- ✅ Step enum pattern (reuse for wizard steps)

**Features:**
- `ServiceLocationTypeEnum`: REMOTE, TASKER_LOCATION, TASKEE_LOCATION (multiple select support)
- Status: Uses NIP-99 values directly ('active' | 'inactive' | 'sold')
  - Note: Deletion handled via NIP-09 deletion events (kind 5), same as task system
- `ServicePricingTypeEnum`: FIXED, HOURLY, TIERED, INQUIRY_REQUIRED
- `ServiceStepEnum`: BASICS, LOCATION, DETAILS, PRICING, TIERS, ADD_ONS, FAQS, INQUIRY_FORM, PORTFOLIO, REVIEW

**Testing:**
- Enum value validation tests
- Enum usage in type definitions
- Enum serialization/deserialization tests

**Acceptance Criteria:**
- ✅ All enums defined and exported
- ✅ Enum values match Nostr tag conventions
- ✅ Enums are used consistently in type definitions

#### 4.1.3. Create Service Store (`src/lib/stores/service.store.ts`)

**Reuse from Task Store:**
- ✅ Store structure pattern from `src/lib/stores/task.store.ts`
- ✅ Step management logic (currentStep, STEPS array, nextStep, previousStep)
- ✅ Draft saving and auto-recovery pattern
- ✅ Loading and error state management
- ✅ Store update methods pattern
- ✅ LocalStorage draft persistence pattern

**Features:**
- Service state management using Svelte 5 runes - reuse task store runes pattern
- Multi-step form state (similar to task store) - reuse task store structure
- Draft saving and auto-recovery - reuse task store draft logic
- Service list management - adapt from task list management
- Current service editing state - reuse task editing state pattern
- Loading and error states - reuse task store state management

**Store Structure:**
```typescript
interface ServiceStoreState {
  currentStep: ServiceStepEnum;  // Reuse step enum pattern from task store
  service: Partial<ServiceBody>;  // Similar to task.task in task store
  id: string | null;  // Same pattern as task store
  isLoading: boolean;  // Reuse loading state pattern
  error: string | null;  // Reuse error state pattern
  isEditing: boolean;  // True when in edit mode
  isDuplicating: boolean;  // True when in duplicate mode
  originalServiceId: string | null;  // For edit/duplicate mode - stores source service ID
  // ... other state properties - adapt from task store
}
```

**Store Initialization Logic:**
- **Three Modes:** Store detects mode from URL query parameters:
  - **Create Mode** (default): No query params, uses `CREATE_STORAGE_KEY`
  - **Edit Mode** (`?edit=true&serviceId=${serviceId}`): Uses `EDIT_STORAGE_KEY`, loads existing service data
  - **Duplicate Mode** (`?duplicate=true&serviceId=${serviceId}`): Uses `CREATE_STORAGE_KEY`, loads service data including portfolio files
- **Storage Keys:**
  ```typescript
  const CREATE_STORAGE_KEY = 'bittasker_service_draft';
  const EDIT_STORAGE_KEY = 'bittasker_service_edit_draft';
  ```
- **Initialization Flow:**
  1. Check URL params: `$page.url.searchParams.get('edit')` and `$page.url.searchParams.get('duplicate')`
  2. Determine mode and storage key
  3. If edit mode: Load service by `serviceId`, populate store, set `isEditing: true`
  4. If duplicate mode: Load service by `serviceId`, remove translations/ids (keep portfolio), populate store, set `isDuplicating: true`
  5. If create mode: Initialize empty store
  6. Load draft from appropriate storage key

**Testing:**
- Store initialization tests for all three modes
- Draft storage separation tests (create vs edit drafts don't conflict)
- Mode detection tests (URL param parsing)
- Service loading tests (edit and duplicate modes)
- Portfolio duplication tests (duplicate mode - portfolio files are copied)
- Store initialization tests
- State update tests
- Draft persistence tests
- Error handling tests

**Acceptance Criteria:**
- ✅ Store follows same patterns as task store
- ✅ Draft saving works correctly
- ✅ State updates are reactive
- ✅ Error states are properly managed

### Phase 2: Service Listing - Form and Wizard

**Objective:** Build the service listing interface allowing providers to list their services.

#### 4.2.1. Create Service Listing Route (`src/routes/(protected)/dashboard/list-service/+page.svelte`)

**Reuse from Task Creation:**
- ✅ Wizard structure and step navigation logic from `create-task/+page.svelte`
- ✅ Step counter display (Step X of Y)
- ✅ Forward/backward navigation buttons
- ✅ Direction-based transitions (fly animation)
- ✅ Error handling pattern
- ✅ Loading states
- ✅ Draft auto-save functionality pattern
- ✅ Edit mode detection (`?edit=true` parameter)

**Features:**
- Multi-step wizard matching task creation flow - reuse wizard structure
- Step navigation (forward/backward) - reuse navigation logic
- Form validation at each step - reuse validation pattern
- Draft auto-save functionality - reuse draft save pattern
- Integration with service store - adapt task store pattern
- Translation support for all form fields - reuse translation pattern
- Responsive design (mobile-first) - reuse responsive layout
- **Duplicate Mode Handling:**
  - **Detection:** Check for `?duplicate=true&serviceId=${serviceId}` query params in `onMount`
  - **Service Loading:** 
    - Load service data using `findServiceByNaddr()` or `findServiceByUniqueId()`
    - Store all service fields EXCEPT: `id`, `uniqueId`, `createdAt`, `updatedAt`, `npub`, `status`, `translations` (portfolio files are included)
    - **Portfolio Handling:** Portfolio files are duplicated (all portfolio Attachment objects with URLs are copied)
    - **Translation Handling:** Translations field is excluded (will be regenerated on publish)
  - **Store Population:**
    - Pre-populate service store with copied data (excluding removed fields)
    - Set `isDuplicating: true` in store state
    - Set `originalServiceId` to source service ID (for reference)
    - Use `CREATE_STORAGE_KEY` for draft storage (same as create mode)
  - **Form Behavior:** 
    - Form behaves exactly like create mode
    - User can modify any fields
    - On publish, generates new `uniqueId` and translations
    - Creates new service event (not an update)
  - **Error Handling:**
    - If service not found: Show error, redirect to my-services page
    - If service deleted: Show error, redirect to my-services page
    - If loading fails: Show error, allow retry

**Steps:**
1. **Service Basics**: Title, description, categories, skills
2. **Location Types**: Multiple select location types (remote, at Tasker's location, at Taskee's location)
   - If "at Tasker's location": Taskee's service location picker (where they operate from), service radius (how far they're willing to travel), optional per-distance charge
   - If "at Taskee's location": Option to use global location or specify service location (where service can be provided)
3. **Service Details**: Extended description, tags, service highlights
4. **Pricing Model**: Select pricing type (fixed, hourly, tiered, inquiry required)
5. **Pricing Details**: 
   - For fixed/hourly: Amount/rate input, currency selection, delivery time selection
   - For tiered: Create multiple service tiers with features, prices, and delivery times
   - For inquiry: Build customizable inquiry form
6. **Add-Ons**: Add simple optional extras (if not inquiry-based)
   - Add/remove add-on buttons
   - For each add-on: Name, description (optional), fixed price
   - Simple list of optional extras (like Fiverr extras)
7. **FAQs**: Add frequently asked questions (optional)
   - Add/remove FAQ buttons
   - For each FAQ: Question and answer inputs
   - Expandable/collapsible FAQ section
8. **Portfolio**: Upload work samples, images, documents (optional)
9. **Review**: Summary of all entered information before publishing

**Testing:**
- Form validation tests for each step
- Navigation flow tests
- Draft saving tests
- File upload tests
- Responsive design tests (mobile/tablet/desktop)
- Browser testing for visual verification
- **Duplicate Mode Tests:**
  - Duplicate mode detection tests
  - Service loading in duplicate mode tests
  - Portfolio exclusion tests (verify portfolio field not copied)
  - Translation exclusion tests (verify translations field not copied)
  - Store population tests (verify correct fields copied)
  - Form behavior tests (verify behaves like create mode)
  - Error handling tests (service not found, deleted, loading failure)
  - Draft storage tests (verify uses CREATE_STORAGE_KEY)

**Acceptance Criteria:**
- ✅ All form steps functional
- ✅ Validation works correctly
- ✅ Draft saving works
- ✅ File uploads work
- ✅ Responsive on all devices
- ✅ Translations load correctly

#### 4.2.2. Create Service Step Components

**Reusable Components from Task Creation:**

**Directly Reusable (No Changes Needed):**
- ✅ `CategoryMultiselect.svelte` - Reuse as-is for category selection (max 3 categories)
- ✅ `SkillsMultiselect.svelte` - Reuse as-is for skills input (max 10 skills)
- ✅ `EnhancedLocationPicker.svelte` - Reuse for location selection with map integration

**Adaptable Components (Modify for Services):**
- 🔄 `TaskBasics.svelte` → `ServiceBasics.svelte` - Adapt by removing deadline/date fields, keeping title, description, categories, skills
- 🔄 `TaskBudget.svelte` → `ServicePricing.svelte` + `ServicePortfolio.svelte` - Split file upload logic for portfolio, adapt budget logic for pricing
- 🔄 `TaskLocation.svelte` → `ServiceLocation.svelte` - Adapt for multiple location types (remote, tasker_location, taskee_location) with service radius
- 🔄 `TaskReview.svelte` → `ServiceReview.svelte` - Adapt review display for service-specific fields

**New Components (No Task Equivalent):**
- ✨ `ServiceTiers.svelte` - Service tier management (new)
- ✨ `ServiceAddOns.svelte` - Simple add-ons/extras management (new)
- ✨ `InquiryFormBuilder.svelte` - Custom inquiry form builder (new)

**ServiceBasics.svelte:**
- **Reuse:** `CategoryMultiselect` component (direct import)
- **Reuse:** `SkillsMultiselect` component (direct import)
- **Adapt from:** `TaskBasics.svelte` structure and layout
- Title input (required, max 200 chars) - same as TaskBasics
- Description textarea (required, max 5000 chars) - same as TaskBasics
- Category multi-select (max 3 categories) - reuse CategoryMultiselect
- Skills input (tags, max 10 skills) - reuse SkillsMultiselect
- **Remove:** Deadline/date range fields (not applicable to services)

**ServiceLocation.svelte:**
- **Reuse:** `EnhancedLocationPicker` component for location selection
- **Adapt from:** `TaskLocation.svelte` structure and conditional rendering
- Location type multi-select (remote, at Tasker's location, at Taskee's location)
- Conditional fields based on selected types:
  - **If "at Tasker's location" selected:**
    - Taskee's service location picker (address/coordinates) - where Taskee operates from - reuse EnhancedLocationPicker
    - Service radius input (km/miles) - distance from Taskee's service location that they're willing to travel - new field, similar to location picker integration
    - Toggle for per-distance charge
    - If per-distance enabled: Amount, currency, unit (km/mile)
  - **If "at Taskee's location" selected:**
    - Toggle: "Use my global location" or "Specify service location"
    - If specify: Service location selector - reuse EnhancedLocationPicker (specific location where service can be provided)
- Display selected location types clearly
- **Note:** Similar structure to TaskLocation but supports multiple location types simultaneously

**ServiceDetails.svelte:**
- Extended description (optional, rich text)
- Additional tags/keywords
- Service highlights/features list

**ServicePricing.svelte:**
- **Adapt from:** `TaskBudget.svelte` - reuse budget type selector pattern, currency selector, amount input logic
- **Reuse:** Currency conversion logic (BTC/USD) from TaskBudget
- **Reuse:** Amount input formatting and validation from TaskBudget
- Pricing type selector (fixed/hourly/tiered/inquiry_required) - similar to budget type selector
- Currency selector (BTC/USDt) - reuse TaskBudget currency selector
- Conditional fields based on pricing type:
  - **Fixed**: 
    - Amount input - reuse TaskBudget amount input logic
    - **Delivery Time Selection** (optional):
      - Min value input (number) - minimum delivery time
      - Max value input (number) - maximum delivery time
      - Unit selector (hour, day, week, month)
      - Auto-generate display string (e.g., "3-5 days", "2-3 weeks")
      - Validation: Max must be >= min
    - **Rush Delivery Option** (optional):
      - Toggle: Enable rush delivery
      - If enabled:
        - Price input (fixed amount for rush delivery)
        - Rush delivery time range selection (required) (min value, max value, unit, display)
          - Shows rush delivery time range when rush delivery is selected (e.g., "1-2 days" instead of standard "3-5 days")
          - Delivery time display updates automatically when rush delivery is selected
  - **Hourly**: 
    - Hourly rate input, estimated hours (optional) - adapt from TaskBudget hourly logic
    - **Delivery Time Selection** (optional):
      - Min value input (number) - minimum delivery time
      - Max value input (number) - maximum delivery time
      - Unit selector (hour, day, week, month)
      - Auto-generate display string (e.g., "3-5 days", "2-3 weeks")
      - Validation: Max must be >= min
    - **Rush Delivery Option** (optional):
      - Toggle: Enable rush delivery
      - If enabled:
        - Price input (fixed amount for rush delivery)
        - Rush delivery time range selection (min value, max value, unit, display)
          - If set: Shows rush delivery time range when rush delivery is selected (e.g., "1-2 days" instead of standard "3-5 days")
  - **Tiered**: Link to ServiceTiers component (delivery time set per tier)
  - **Inquiry Required**: Link to InquiryFormBuilder component

**ServiceTiers.svelte:**
- Add/remove tier buttons
- For each tier:
  - Tier name input
  - Description textarea
  - Price input
  - **Delivery Time Selection:**
    - Min value input (number) - minimum delivery time
    - Max value input (number) - maximum delivery time
    - Unit selector (hour, day, week, month)
    - Auto-generate display string (e.g., "3-5 days", "2-3 weeks")
    - Validation: Max must be >= min
    - Optional field (can be left empty)
  - **Rush Delivery Option** (optional, per tier):
    - Toggle: Enable rush delivery for this tier
    - If enabled:
      - Price input (fixed amount for rush delivery - can be different per tier)
      - Rush delivery time range selection (required) (min value, max value, unit, display)
        - Shows rush delivery time range when rush delivery is selected for this tier (e.g., "1-2 days" instead of this tier's standard "3-5 days")
        - Delivery time display updates automatically when rush delivery is selected for this tier
  - Features list (add/remove features)
  - "Popular" badge toggle
- Tier reordering (drag and drop)
- Preview of tier comparison (includes delivery times and rush delivery options)

**ServiceAddOns.svelte:**
- **Simple Add-Ons Management:**
  - Add/remove add-on buttons
  - For each add-on:
    - Add-on name input (e.g., "Rush delivery", "Extra revisions", "Source files included")
    - Description textarea (optional)
    - Fixed price input (not an adjustment - full price for the add-on)
    - Currency selector (matches service currency)
  - Add-on reordering (drag and drop)
  - Simple list display (like Fiverr extras)
  - Note: Add-ons are optional and available for all pricing types except INQUIRY_REQUIRED

**ServiceFAQs.svelte:**
- **FAQ Management:**
  - Add/remove FAQ buttons
  - For each FAQ:
    - Question input (required, max 200 chars)
    - Answer textarea (required, max 1000 chars)
  - FAQ reordering (drag and drop)
  - Preview of FAQ section (expandable/collapsible)
  - **Reuse Pattern:** Similar structure to ServiceAddOns component
  - **UI Pattern:** Use DaisyUI accordion/collapse component for preview

**InquiryFormBuilder.svelte:**
- Add/remove form field buttons
- For each field:
  - Field type selector (text, textarea, number, select, checkbox, date, time)
  - Label input
  - Placeholder input (optional)
  - Required toggle
  - Options input (for select/checkbox types)
  - Validation rules (min, max, pattern)
- Field reordering
- **Note:** Photo upload and message field are always available (not configurable by taskee)
- Form preview

**ServicePortfolio.svelte:**
- **Reuse:** File upload logic from `TaskBudget.svelte` (lines 95-276)
- **Reuse:** File validation, compression, and upload functions from TaskBudget
- **Reuse:** File preview and gallery display from TaskBudget
- **Reuse:** File removal logic from TaskBudget
- **Reuse:** `uploadService.uploadMultipleFiles()` pattern from TaskBudget
- **Adapt:** Change upload folder from 'tasks' to 'services'
- **Adapt:** Support additional file types (PDFs, documents) beyond images/videos
- **Upload Implementation:**
  - Uses `uploadService` with `folder: 'services'` (same as tasks use 'tasks')
  - Files uploaded to Cloudflare R2 with compression and variants
  - Attachments stored as `Attachment[]` with `url`, `key`, `type`, `size`, `variants`
  - No NIP-94 file events needed (same as task attachments)
- File upload component (images, PDFs, documents)
- Portfolio gallery preview - reuse TaskBudget gallery display
- File management (add/remove/reorder) - reuse TaskBudget file management
- Alt text and descriptions for images - extend TaskBudget attachment handling

**ServiceReview.svelte:**
- **Adapt from:** `TaskReview.svelte` structure and layout
- **Reuse:** Card-based summary display pattern from TaskReview
- **Reuse:** Category and skills badge display from TaskReview
- **Reuse:** Attachment gallery display from TaskReview
- **Reuse:** BTC price fetching and conversion display from TaskReview
- Summary display of all entered data:
  - Service basics (title, description, categories, skills) - reuse TaskReview display pattern
  - Location types with details (service radius, per-distance charge if applicable) - adapt TaskReviewLocation component
  - Service details and highlights
  - Pricing model and details (or inquiry form preview) - adapt TaskReview budget display
    - **Delivery Time Display:** Show delivery time range for fixed/hourly pricing or per tier for tiered pricing (e.g., "3-5 days", "2-3 weeks")
    - **Rush Delivery Display:** Show rush delivery option (if enabled) with price and rush delivery time range for fixed/hourly pricing (updates display when selected)
  - Service tiers (if tiered pricing) - new section
    - **Delivery Time Display:** Show delivery time range for each tier (e.g., "3-5 days", "2-3 weeks")
    - **Rush Delivery Display:** Show rush delivery option (if enabled) with price and rush delivery time range for each tier (updates display when selected)
  - Add-ons list (if available) - new section
    - Display all add-ons with names, descriptions, and prices
  - **FAQs** (if available) - new section
    - Display as expandable/collapsible FAQ section
    - Show question and answer for each FAQ
  - Inquiry form fields (if inquiry-based) - new section
  - Portfolio items - reuse TaskReview attachment display
- Edit links to each section - reuse TaskReview edit pattern
- Publish button - adapt from TaskReview submit button
- Preview mode - reuse TaskReview preview structure
- **Service Preview Mode:** Add "Preview" button accessible from any step in the wizard
  - Opens preview modal/drawer showing how service will appear on detail page
  - Reuses `ServiceReview.svelte` component for preview display
  - Shows all sections: title, description, location types, pricing, tiers, add-ons, FAQs, portfolio
  - Preview updates in real-time as user edits form fields
  - **Reuse Pattern:** Same preview structure as `TaskReview.svelte` preview mode
- Validation check before publishing - reuse TaskReview validation

**Testing:**
- Component rendering tests
- Form input validation tests
- File upload component tests
- Visual regression tests
- Accessibility tests (ARIA labels, keyboard navigation)
- **Service Preview Mode Tests:**
  - Preview button functionality tests
  - Preview modal/drawer display tests
  - Preview content accuracy tests (matches final service)
  - Preview real-time updates tests
  - Preview accessibility tests

**Acceptance Criteria:**
- ✅ All components render correctly
- ✅ Form inputs validate properly
- ✅ Rush delivery time range is required when rush delivery is enabled
- ✅ File uploads work
- ✅ Components are accessible
- ✅ Responsive design works
- ✅ Preview button opens preview correctly
- ✅ Preview displays all service sections correctly
- ✅ Preview updates in real-time as form changes

#### 4.2.3. Create Service Listing Logic (`src/lib/nostr/service.ts`)

**Features:**
- `listService(serviceData: ServiceBody): Promise<string>` - List new service (creates NIP-99 event)
  - **Input:** `ServiceBody` - user-provided service data (title, description, pricing, etc.)
  - **Process:**
    1. Validate required fields (title, description, pricing, categories, skills)
    2. Generate `uniqueId` (UUID) for stable URLs
    3. Get current user data (npub, username, avatar)
    4. Add metadata to ServiceBody:
       - `creator`: { username, avatar } (from current user)
       - `createdAt`: Current timestamp
       - `uniqueId`: Generated UUID
    5. Generate translations for all supported languages
    6. Create `serviceDataWithMeta` = { ...serviceData, creator, createdAt, uniqueId, translations }
    7. Stringify: `event.content = JSON.stringify(serviceDataWithMeta)`
    8. Generate tags using `generateServiceTags()`
    9. Create and publish Nostr event (kind 30402 for active, 30403 for drafts)
    10. Generate and add `naddr` to content (optional, can be added later)
  - **Returns:** Event ID (string)
  - **Reuse:** Pattern from `src/lib/nostr/task.ts` `createTask()` function (lines 189-261)
- `updateService(serviceId: string, updates: Partial<ServiceBody>): Promise<string>` - Update existing service using NIP-33 parameterized replaceable events
  - **Reuse:** Update pattern from `src/lib/nostr/task.ts` `updateTask()` function (lines 320-419)
  - **NIP-33 Replacement Mechanism:** Services use parameterized replaceable events (kinds 30402/30403) with `d` tag `service-${uniqueId}`
  - **Update Process:**
    1. Query original service event by `d` tag value (`service-${uniqueId}`)
    2. Keep same `uniqueId` and `d` tag value (required for replacement)
    3. Use same event kind (30402 for active, 30403 for drafts) - or update if status changed
    4. Create new event with higher `created_at` timestamp
    5. New event automatically replaces old event (same author, kind, `d` tag, higher timestamp)
  - **Translation Handling:** Regenerate translations if title/description changed
  - **Cache Invalidation:** Clear/update cache when service is updated
- `deactivateService(serviceId: string): Promise<string>` - Deactivate service (sets status to 'inactive')
- `deleteService(serviceId: string): Promise<string>` - Delete service using NIP-09 deletion event (kind 5)
  - **Reuse:** Deletion pattern from `src/lib/nostr/task.ts` `deleteTask()` function (lines 424-447)
  - **Note:** This function is called after checking for active escrows/inquiries and handling decline flow
  - Creates NIP-09 deletion event with `kind: 5`
  - Includes tags: `['e', serviceId]` and `['k', '30402']` (service event kind)
  - Signs and publishes deletion event to relays
  - Returns success message or throws error
  - Clients filter out deleted services when querying (check for deletion events)
- `declineAllInquiries(serviceId: string): Promise<void>` - Declines all active inquiries for a service
  - Query all active inquiries for service (status in `['new', 'responded', 'proposal_sent']`)
  - For each inquiry:
    - Update inquiry status to 'declined' (create status update event)
    - Create decline DM to tasker (NIP-04/NIP-44 encrypted)
    - Include structured data and tags: `['reason', 'service_deleted']`
  - Return when all inquiries are declined
  - **Reuse:** DM sending pattern from inquiry form submission
- `generateServiceTags()` - Generate Nostr tags for service events (includes NIP-99 compatible tags)
  - **Price Tag Logic:**
    - For `FIXED`: Use `pricing.amount`
    - For `HOURLY`: Use `pricing.hourlyRate`
    - For `TIERED`: Use lowest tier price (`Math.min(...pricing.tiers.map(t => t.price))`) for NIP-99 discovery compatibility
    - For `INQUIRY_REQUIRED`: Use `'0'`
  - **Price Range Tags (Tiered Pricing Only):**
    - Add `min_price` tag with lowest tier price
    - Add `max_price` tag with highest tier price
    - Used for price range filtering in search queries
  - **Delivery Time Tags** (for filtering):
    - `delivery_time`: Maximum delivery time in hours (for consistent filtering across units)
      - For fixed/hourly: Use max value from delivery time range
      - For tiered: Use fastest tier's max delivery time (for filtering)
      - Convert to hours: hour=1, day=24, week=168, month=720
      - **Note**: Uses max value to ensure filtering includes all services that can deliver within the specified time
    - `delivery_time_display`: Human-readable display (e.g., "3-5 days", "2-3 weeks") - for display purposes
  - **Tier Data Storage:**
    - Full tier data (name, description, price, features, delivery time) stored in `content.pricing.tiers[]` (content JSON)
    - No tier ID tags needed (tier IDs are client-generated and not useful for filtering)
  - **FAQ Data Storage:**
    - Full FAQ data (question, answer) stored in `content.faqs[]` (content JSON)
    - No FAQ tags needed (FAQs are not useful for filtering)
- `generateServiceTranslations()` - Auto-translate service content
- `generateServiceNaddr()` - Generate NIP-19 bech32-encoded service identifier from service data (standard Nostr format)
  - Encodes: `pubkey`, `kind` (30402), `d` tag value (`service-${uniqueId}`), optional relays
  - Returns: `nservice1...` format (default - custom prefix for BitTasker services)
  - Uses custom `nservice` prefix (instead of standard `naddr`) for better branding and clarity
- `uploadPortfolioFiles()` - Upload portfolio files using uploadService (same pattern as task attachments)

**Tag Generation:**
- **Reuse:** Tag generation pattern from `src/lib/nostr/task.ts` `generateTaskTags()` function
- **Reuse:** Category and skills tag generation logic from task system
- Use `d` tag with `service-{uniqueId}` prefix (NIP-16/33 parameterized replaceable) - same pattern as tasks
- NIP-99 compatible tags: `title`, `summary`, `published_at`, `location`, `price`, `status`
- **Price Tag Logic (`generatePriceForTag()` helper function):**
  - For `FIXED` pricing: Use `pricing.amount`
  - For `HOURLY` pricing: Use `pricing.hourlyRate`
  - For `TIERED` pricing: Use `Math.min(...pricing.tiers.map(t => t.price))` (lowest tier price for NIP-99 discovery)
  - For `INQUIRY_REQUIRED`: Use `'0'`
- **Price Range Tags (Tiered Pricing Only):**
  - `min_price`: Lowest tier price (`Math.min(...pricing.tiers.map(t => t.price))`)
  - `max_price`: Highest tier price (`Math.max(...pricing.tiers.map(t => t.price))`)
  - Used for price range filtering in search queries
- Category tags (`categories`) - array of category IDs - reuse task category tag logic
- Skills tags (`skills`) - array of skill identifiers - reuse task skills tag logic
- Creator pubkey (`p`) - standard Nostr tag - same as tasks
- Service location type tags (`location_types`) - array of location types - adapt from task location tags
- Location display name tag (`location_display_name`) if tasker_location or taskee_location - adapt from task location
- Service radius tag (`service_radius`) if tasker_location - new tag
- Per-distance charge tag (`per_distance_charge`) if tasker_location with travel charge - new tag
- Pricing type tag (`pricing_type`) - adapt from task budget type tag
- **Delivery Time Tags:**
  - `delivery_time`: Delivery time in hours (for filtering)
  - `delivery_time_display`: Human-readable display (e.g., "3 days", "1 week")
- **Tier Data:** Full tier data stored in `content.pricing.tiers[]` (content JSON) - includes delivery times per tier
- **FAQ Data:** Full FAQ data stored in `content.faqs[]` (content JSON) - no FAQ tags needed
- Portfolio attachments stored in content JSON (same as task attachments) - no special tags needed

**Testing:**
- Service listing tests
- Service update tests
- Tag generation tests (including delivery time tags)
- Translation generation tests
- Error handling tests
- Nostr event publishing tests
  - **Delivery Time Tests:**
  - Delivery time range input validation tests (min/max validation, max >= min)
  - Delivery time range conversion tests (hours, days, weeks, months to hours - using max value for filtering)
  - Delivery time tag generation tests (using max value for `delivery_time` tag)
  - Delivery time range display tests (e.g., "3-5 days", "2-3 weeks")
  - Rush delivery validation tests (rush delivery time range required when rush delivery enabled)
  - Rush delivery time range display tests (updates automatically when rush delivery selected)
- **FAQ Tests:**
  - FAQ creation tests
  - FAQ validation tests (question/answer length limits: 200 chars for question, 1000 chars for answer)
  - FAQ reordering tests
  - FAQ display tests (expandable/collapsible)

**Acceptance Criteria:**
- ✅ Services list successfully
- ✅ Nostr events publish correctly
- ✅ Tags are generated correctly (including delivery time tags)
- ✅ Delivery times are stored and displayed correctly
- ✅ Rush delivery options are stored and displayed correctly (for fixed/hourly pricing and per tier)
- ✅ FAQs are stored and displayed correctly
- ✅ Translations are generated
- ✅ Error handling works

### Phase 3: Service Discovery - Search and Browse

**Objective:** Enable users to discover and browse available services.

#### 4.3.1. Create Service Search Logic (`src/lib/nostr/findServices.ts`)

**Features:**
- `findServices(params: SearchServicesParams): Promise<{services: Service[], total: number, hasMore: boolean}>` - Main search function
- `findMyServices(params): Promise<{services: Service[], total: number, hasMore: boolean}>` - Get user's own services
- `findServiceByUniqueId(uniqueId: string): Promise<Service | null>` - Get single service by uniqueId
  - **NIP-33 Query:** Query by `d` tag filter: `#d: ['service-${uniqueId}']`
  - **Latest Version:** Relays automatically return latest version for parameterized replaceable events (highest `created_at` with same author, kind, `d` tag)
  - **Use Cases:** Service detail pages, escrow creation validation, edit form pre-population
- `createServiceFilter()` - Convert search params to Nostr filters (uses `kinds: [30402]` for NIP-99 compatibility)
- `filterIndexedServices()` - Frontend filtering for complex queries
- `indexServiceData()` - Index services for optimized filtering
- Caching system for performance

**NIP-99 Compatibility:**
- Query `kinds: [30402]` for active services (NIP-99 standard)
- Query `kinds: [30403]` for draft services (NIP-99 standard)
- Standard NIP-99 clients can discover services through these queries

**Search Parameters:**
- `search`: Text search (title, description, skills) - uses NIP-50 search
- `categories`: Filter by categories
- `deliveryTime`: Filter by delivery time range (in hours)
  - Filter options: "< 24 hours", "24-72 hours", "168 hours (1 week)", "> 168 hours"
  - "Fast delivery" quick filter (< 72 hours / 3 days)
- `skills`: Filter by skills
- `serviceLocationTypes`: Filter by location types using `location_types` tag (multiple select support)
- `pricingType`: Filter by pricing model using `pricing_type` tag (fixed, hourly, tiered, inquiry_required)
- `minPrice`/`maxPrice`: Price range filter
- `location`: Location-based filtering
- `radius`: Search radius for location
- `status`: Filter by service status
- `sortBy`: Sort by relevance, date, price
- `page`: Pagination support
- `limit`: Results per page

**Filtering Strategy:**
- **NIP-99 Standard Filters:** Query `kinds: [30402]` for active services, use standard NIP-99 tags (`title`, `location`, `price`, `status`) for basic queries
- **NIP-99 Compatible Filters:** Standard NIP-99 clients can discover services through `kinds: [30402]` queries
- **BitTasker Extended Filters:** Use human-readable extension tags (`categories`, `skills`, `location_types`, `pricing_type`) for advanced filtering
- **Price Range Filtering:**
  - For tiered pricing: Filter using `min_price` and `max_price` tags
  - For fixed/hourly pricing: Filter using NIP-99 `price` tag
- **Deletion Filtering:** Filter out services that have been deleted via NIP-09 deletion events (kind 5)
  - Query for deletion events (`kind: 5`) with `['e', serviceId]` and `['k', '30402']` tags
  - Exclude any services that have corresponding deletion events
  - Reuse deletion filtering pattern from task search system
- Use Nostr filters for basic queries (kinds, status, location, price range)
- Use frontend filtering for complex queries (location radius, price ranges, add-ons, deletion filtering)
- **Caching System:** Implement caching similar to task search (`src/lib/nostr/findTasks.ts`)
  - Memory cache: `Map<string, { data: IndexedService[], timestamp: number }>`
  - Cache TTL: 5 minutes (same as tasks)
  - Max cache size: 100 items (same as tasks)
  - Cache key: JSON stringified filter
  - Cache merging: Merges new results with existing cache
  - **Cache Invalidation:**
    - On service deletion: Clear cache entries containing that service
    - On service update: Update cache entry or clear if major change
    - On manual refresh: Clear cache for that filter
    - TTL expiration: Automatic (5 minutes)
  - **Deletion Event Caching:**
    - Query deletion events once per cache period
    - Store deleted service IDs in separate cache
    - Filter services against deleted IDs cache
    - Invalidate deletion cache on TTL expiration
- Use indexing for performance optimization
- **Full NIP-99 Support:** Standard NIP-99 clients can discover and read services - they'll see basic service info and can filter by standard tags

**Testing:**
- Search functionality tests
- Filter combination tests
- Pagination tests
- Caching tests
- Performance tests (large result sets)
- Location filtering tests
- Deletion filtering tests (ensure deleted services don't appear in search results)
- **Recently Viewed Services Tests:**
  - Service view tracking tests (localStorage)
  - Recently viewed display tests
  - History limit tests (max 20 items)
  - Duplicate removal tests
  - Clear history tests

**Acceptance Criteria:**
- ✅ Search returns correct results
- ✅ Filters work correctly
- ✅ Pagination works
- ✅ Caching improves performance
- ✅ Location filtering works accurately
- ✅ Recently viewed services are tracked correctly
- ✅ Recently viewed section displays correctly

#### 4.3.2. Create Public Services Browse Page (`src/routes/services/+page.svelte`)

**Objective:** Create a public services browse page that is essentially identical to the find tasks page (`src/routes/tasks/+page.svelte`), adapted for services.

**Reuse from Find Tasks Page (`src/routes/tasks/+page.svelte`):**

**✅ Directly Reusable (90%+ code reuse):**
- **Page Structure & Layout:**
  - Container structure (`<div class="mx-auto max-w-6xl p-4 md:p-0">`)
  - Search and filter controls layout (same row, same styling)
  - List/Map view toggle pattern
  - Responsive layout (mobile: full width list, desktop: split with map)
  - Scroll to top button (mobile only)
  - View mode toggle button (mobile only)
- **State Management Pattern:**
  - `searchParams` state initialization pattern
  - `searchQuery` state with debounce
  - `isFilterDrawerOpen` state
  - `viewMode` state ('list' | 'map')
  - Loading states (`showSkeleton`, `dataLoaded`, `isLoadingMore`)
  - BTC price state and fetching
  - `hasActiveParams` derived state
- **Functions (adapt for services):**
  - `getInitialSearchParams()` → `getInitialSearchParams()` (adapt for `SearchServicesParams`)
  - `debouncedSearch()` → Same pattern, call `findServices()` instead of `findTasks()`
  - `handleFilterApply()` → Same pattern, adapt for service filters
  - `clearFilters()` → Same pattern
  - `setupInfiniteScroll()` → Same pattern (scroll listener, 300-500px threshold)
  - `loadNostrData()` → Adapt to call `findServices()` instead of `findTasks()`
  - `fetchBtcPrice()` → Reuse completely
  - `scrollToServiceCard()` → Adapt from `scrollToTaskCard()`
  - `registerServiceCard()` → Adapt from `registerTaskCard()`
  - `toggleViewMode()` → Reuse completely
  - `scrollToTop()` → Reuse completely
- **Lifecycle Hooks:**
  - `onMount()` pattern (setup lazy loading, fetch BTC price, load initial data)
  - `onDestroy()` pattern (cleanup scroll handlers, observers, timers)
  - `$effect()` patterns (hasActiveParams, dark mode detection)
- **UI Patterns:**
  - Search input with icon (same styling, same debounce pattern)
  - Filter button with icon (same styling)
  - Error message display (same alert pattern)
  - Task count display → Service count display
  - Skeleton loading pattern
  - Empty state pattern
  - Loading more indicator
  - Scroll listener setup pattern

**🔄 Adaptable Components:**
- **FilterDrawer** (`src/lib/components/filters/FilterDrawer.svelte`):
  - **Reuse:** Component structure, drawer pattern, filter UI patterns
  - **Adapt:** Filter options (categories, skills, pricing types, delivery time, location types instead of task types)
  - **Adapt:** Props to accept `SearchServicesParams` instead of `SearchTasksParams`
  - **Adapt:** Filter application logic for service-specific filters
- **Drawer Component** (`src/lib/components/Drawer.svelte`):
  - **Reuse:** Completely reusable (no changes needed)
- **TaskLocationMap** → **ServiceLocationMap**:
  - **Reuse:** Map component structure, marker rendering, click handlers
  - **Adapt:** Accept `Service[]` instead of `Task[]`
  - **Adapt:** Service location data structure (service location types, service radius)
  - **Adapt:** Marker display for services (different icon/color if needed)
- **TranslatableTask** → **TranslatableService**:
  - **Reuse:** Translation wrapper pattern, reactive translation logic
  - **Adapt:** Accept `Service` instead of `Task`
  - **Adapt:** Service-specific translation keys

**🔄 Adaptable Stores:**
- **tasksStore** → **servicesStore**:
  - **Reuse:** Store structure pattern (items, currentPage, hasMore, error, loading)
  - **Adapt:** Store `Service[]` instead of `Task[]`
  - **Adapt:** Store methods for services

**🔄 Adaptable Functions:**
- **findTasks()** → **findServices()**:
  - **Reuse:** Query pattern, filter creation, pagination logic
  - **Adapt:** Query `kinds: [30402]` instead of task kinds
  - **Adapt:** Service-specific filters (pricing types, delivery time, location types)
  - **Adapt:** Service-specific tag queries

**🆕 New/Service-Specific:**
- **ServiceCard Component** (`src/lib/components/service/ServiceCard.svelte`):
  - **Reuse:** Card structure pattern from task cards
  - **New:** Service-specific fields (pricing display, delivery time badge, location types, provider info)
- **Service Filters:**
  - Pricing type filter (fixed, hourly, tiered, inquiry_required)
  - Delivery time filter (new)
  - Location type filter (tasker location, taskee location, remote)
  - Per-distance charge filter (new)
- **Recently Viewed Services Section** (if user has viewed services)
  - **Reuse Pattern:** Adapt user history tracking pattern from `src/lib/api/services/user-history.service.ts`
  - **Implementation:**
    - Track service views in localStorage (client-side only, no Nostr event needed)
    - Store: `{ serviceId: string, viewedAt: number, title: string, naddr: string }[]`
    - Max 20 recently viewed services (FIFO queue)
    - Storage key: `bittasker_recently_viewed_services`
    - **Quota Management:** If localStorage quota exceeded, remove oldest entries first (FIFO)
    - **Deleted Services:** Do NOT filter out deleted services (show them even if deleted)
  - **Display:**
    - Show "Recently Viewed" section at top of browse page (if user has viewed services)
    - Grid layout with service cards (reuse `ServiceCard.svelte`)
    - Limit to 6-8 recently viewed services
    - Link to service detail pages
    - Clear history button (optional)
  - **Tracking:**
    - Track view when user visits service detail page (`/services/[serviceId]`)
    - Update localStorage on page load
    - Remove duplicates (keep most recent)

**Testing:**
- Page rendering tests
- Search functionality tests
- Filter application tests
- Pagination tests
- Responsive design tests
- Browser testing for visual verification

**Acceptance Criteria:**
- ✅ Page loads and displays services (same pattern as tasks page)
- ✅ Search works correctly (same debounce pattern as tasks)
- ✅ Filters apply correctly (adapted for service-specific filters)
- ✅ Infinite scroll pagination works (same scroll listener pattern as tasks)
- ✅ List/Map view toggle works (same pattern as tasks)
- ✅ Responsive design works (same layout patterns as tasks)
- ✅ Empty states display correctly (same pattern as tasks)
- ✅ Loading states work correctly (same skeleton pattern as tasks)
- ✅ Error handling works correctly (same alert pattern as tasks)
- ✅ Recently viewed services section displays correctly (if applicable)

#### 4.3.3. Create Service Search Filters Component (`src/lib/components/service/ServiceSearchFilters.svelte`)

**Reuse from Task Search Filters:**
- ✅ Filter component structure pattern (if task search has filters)
- ✅ Multi-select filter pattern
- ✅ Price range slider pattern (if tasks have budget filters)
- ✅ Clear/apply filter button pattern

**Features:**
- **Adapt from:** Task search filter components (if they exist)
- Category filter (multi-select) - uses `categories` tag - reuse CategoryMultiselect component
- Skills filter (tag input) - uses `skills` tag - reuse SkillsMultiselect component
- Service location type filter (multiple select: remote, at Tasker's location, at Taskee's location) - uses `location_types` tag - adapt task location filter
- Pricing type filter (fixed, hourly, tiered, inquiry required) - uses `pricing_type` tag - adapt task budget type filter
- Price range slider - adapt task budget range filter
- **Delivery Time Filter** (new):
  - Filter by delivery time range (e.g., "< 1 day", "1-3 days", "1 week", "> 1 week")
  - Uses `delivery_time` tag for filtering (stores delivery time in hours for consistent filtering)
  - "Fast delivery" quick filter (< 3 days / 72 hours)
  - **Filter Options:**
    - "< 1 day" (< 24 hours)
    - "1-3 days" (24-72 hours)
    - "1 week" (168 hours)
    - "> 1 week" (> 168 hours)
- Location filter with radius - reuse EnhancedLocationPicker component
- Clear filters button - reuse filter clear pattern
- Apply filters button - reuse filter apply pattern

**Testing:**
- Filter component tests
- Filter state management tests
- Filter application tests
- UI interaction tests

**Acceptance Criteria:**
- ✅ All filters render correctly
- ✅ Filter state updates correctly
- ✅ Filters apply to search results
- ✅ Clear filters works

#### 4.3.4. Create Service Card Component (`src/lib/components/service/ServiceCard.svelte`)

**Objective:** Create a service card component that displays service information in browse/search results, adapted from the TaskCard component pattern.

**Reuse from TaskCard (`src/lib/components/task/TaskCard.svelte`):**

**✅ Directly Reusable (70%+ code reuse):**
- **Card Structure:**
  - DaisyUI card classes: `card bg-base-100 shadow-xl transition-shadow hover:shadow-lg`
  - Card body structure: `<div class="card-body">`
  - Responsive layout patterns
- **Click Handling & Accessibility:**
  - Card click handler with `onclick` prop
  - Keyboard accessibility: `role="button"`, `tabindex="0"`, `onkeydown` handler for Enter/Space
  - Navigation pattern: Use `uniqueId` if available, fallback to `id` for backward compatibility
  - `goto()` navigation to service detail page
  - `stopPropagation()` on nested button clicks
- **Component Props Pattern:**
  - Props structure: `{ service, btcPrice, onclick }` (simplified from TaskCard's action buttons pattern)
  - TypeScript props with `$props<>()`
- **Layout Patterns:**
  - Title and description section with flex layout
  - Two-column layout for key info (left: time/location, right: price)
  - Responsive flex patterns (`flex-col gap-2`, `md:flex-row`)
  - Line clamping for text overflow (`line-clamp-1`, `line-clamp-2`)
- **Styling Patterns:**
  - Text color utilities: `text-base-content/60`, `text-base-content/70`
  - Icon sizing: `h-4 w-4`, `h-5 w-5`
  - Font weights: `font-semibold`, `font-medium`, `font-bold`
  - Spacing: `gap-2`, `gap-3`, `mt-1`

**🔄 Adaptable Components:**
- **TranslatableTask** → **TranslatableService**:
  - **Reuse:** Component wrapper pattern, translation logic, props structure
  - **Adapt:** Accept `Service` instead of `Task`
  - **Adapt:** Translation keys from `dashboard.task.*` to `dashboard.service.*`
  - **Usage:** Same pattern - `showTitle={true}`, `showDescription={true}`, `showToggle={false}`
- **Date Formatting Functions:**
  - **Reuse:** `formatStandardDateShort()`, `formatStandardDateTime()`, `parseDateToLocalMidnight()` helpers
  - **Adapt:** Not needed for services (no deadline/date range), but keep for potential future use
  - **Note:** Services use delivery time ranges instead of deadlines

**🔄 Adaptable Display Sections:**
- **Title & Description Section:**
  - **Reuse:** Same flex layout, line-clamp patterns, TranslatableService usage
  - **Adapt:** Service title/description instead of task title/description
  - **Adapt:** Navigation to `/services/${serviceIdentifier}` instead of `/tasks/${taskIdentifier}`
- **Pricing Display (replaces Budget):**
  - **Reuse:** Same layout pattern (right-aligned, large font)
  - **Reuse:** `formatNumberWithTwoDecimals()` helper
  - **Reuse:** `satsFromUsd()` helper for BTC conversion
  - **Adapt:** Display pricing based on type:
    - Fixed: Show amount
    - Hourly: Show hourly rate
    - Tiered: Show price range (min-max) or "From $X"
    - Inquiry: Show "Request Quote"
  - **Adapt:** Handle different currencies (BTC, USDT)
- **Location Display:**
  - **Reuse:** Same icon (location pin SVG)
  - **Reuse:** Same layout pattern (icon + text, flex layout)
  - **Adapt:** Display service location types instead of task locations:
    - Show location type badges (Tasker Location, Taskee Location, Remote)
    - Show location display name if available
    - Show "Remote" if only remote option selected
    - Show per-distance charge indicator if applicable

**🆕 New/Service-Specific:**
- **Provider Info Section:**
  - Provider avatar (from `service.creator.avatar`)
  - Provider name (from `service.creator.username`)
  - Provider rating (if available)
  - **Layout:** Small avatar + name, positioned at top or bottom of card
- **Delivery Time Badge:**
  - Display delivery time range (e.g., "3-5 days delivery")
  - Show for fixed/hourly pricing or fastest tier for tiered pricing
  - Badge styling (similar to status badges in task cards)
  - **Note:** Rush delivery time updates handled at browse page level, not card level
- **Location Type Indicators:**
  - Badges for each selected location type
  - Icons or text badges (Tasker Location, Taskee Location, Remote)
  - Color coding if needed
- **Per-Distance Charge Indicator:**
  - Small badge or text showing per-distance charge rate
  - Example: "$0.50/km travel fee"
- **Categories and Skills Tags:**
  - Display category badges (similar to task categories)
  - Display skills tags (similar to task skills)
  - Limit display (e.g., first 3 categories, first 5 skills)
- **Portfolio Image Preview:**
  - **Reuse Pattern:** Similar to `LiveTaskCard.svelte` image display
  - **Reuse:** `<figure>` with `<img>` pattern, lazy loading, placeholder image
  - **Adapt:** Use first portfolio image or placeholder
  - **Adapt:** Image from `service.portfolio?.[0]?.url` or placeholder

**Implementation Notes:**
- **Code Reuse Estimate:** ~70% of TaskCard code can be directly reused or minimally adapted
- **Primary Adaptations:**
  1. Replace `Task` type with `Service` type
  2. Replace `TranslatableTask` with `TranslatableService`
  3. Replace budget display with pricing display (handle multiple pricing types)
  4. Replace deadline/date range with delivery time badge
  5. Replace task location with service location types
  6. Add provider info section
  7. Add portfolio image preview
  8. Add categories/skills tags
  9. Update navigation to `/services/` instead of `/tasks/`
  10. Update translation keys
- **Simplified Props:**
  - ServiceCard doesn't need `activeFilter` or `getActionButtons` (used in dashboard)
  - Public browse page cards are simpler - just click to view details
  - Props: `{ service: Service, btcPrice: number, onclick: () => void }`

**Testing:**
- Card rendering tests (reuse test patterns from TaskCard)
- Data display tests (pricing types, delivery time, location types)
- Click interaction tests (same pattern as TaskCard)
- Responsive layout tests (same patterns as TaskCard)
- Image loading tests (portfolio image, placeholder fallback)
- Visual regression tests

**Acceptance Criteria:**
- ✅ Cards display all information correctly (title, description, pricing, delivery time, location types, provider info)
- ✅ Cards are clickable (same accessibility pattern as TaskCard)
- ✅ Responsive layout works (same patterns as TaskCard)
- ✅ Images load correctly (portfolio image or placeholder)
- ✅ Pricing displays correctly for all pricing types
- ✅ Delivery time badge displays correctly
- ✅ Location type indicators display correctly

### Phase 4: Service Detail Pages

**Objective:** Create a single public service detail page that adapts based on authentication state and ownership (logged in, logged out, owner viewing own service).

#### 4.4.1. Create Service Detail Page (`src/routes/services/[serviceId]/+page.svelte`)

**Note:** Single public route that adapts to authentication state and ownership - all service links use this public URL (`/services/[serviceId]`)

**Reuse from Task Detail Page (`src/routes/tasks/[taskId]/+page.svelte`):**
- ✅ **Page structure**: Dashboard layout with sidebar for logged-in users, simple layout for non-logged-in users
- ✅ **Authentication check**: Same `authState.isAuthenticated` pattern
- ✅ **Responsive design**: Same width detection and sidebar visibility logic (`devicePlatform` check, `width >= 1200`)
- ✅ **Active section tracking**: Same `activeSection` state management pattern (if services added to dashboard navigation)
- ✅ **Layout wrapper**: Same `bg-base-200 mx-auto flex h-full w-full flex-row gap-8 px-2 md:py-4` structure
- ✅ **Sidebar component**: Reuse dashboard sidebar menu structure (if services added to navigation)
- ✅ **WarningPopup**: Include same `<WarningPopup />` component
- ✅ **SEO head**: Same `<svelte:head>` pattern with title and meta description

**Features:**
- Full service information display
- Provider profile section
- Portfolio gallery
- Pricing details (or inquiry form if inquiry-based)
  - **Delivery Time Display:** Show delivery time range badge for fixed/hourly pricing or per tier for tiered pricing (e.g., "3-5 days", "2-3 weeks")
  - **Rush Delivery Option:** Show rush delivery checkbox/option (if enabled) with price and rush delivery time range for fixed/hourly pricing
    - When rush delivery is selected, update delivery time display to show rush delivery time range (e.g., "1-2 days" instead of "3-5 days")
- Service location types display with per-distance charge (if applicable)
- Service tier selector (if tiered pricing)
  - **Delivery Time Display:** Show delivery time range for each tier in tier comparison (e.g., "3-5 days", "2-3 weeks")
  - **Rush Delivery Option:** Show rush delivery checkbox/option (if enabled) with price and rush delivery time range for each tier
    - When rush delivery is selected for a tier, update that tier's delivery time display to show rush delivery time range (e.g., "1-2 days" instead of "3-5 days")
- Add-ons selector (if available) - simple checkboxes with prices
- **FAQs Section** (if available):
  - Expandable/collapsible FAQ section using DaisyUI accordion component
  - Display question and answer pairs
  - Helps reduce inquiry volume
- "Contact Provider" button (links to messaging)
- "Request Quote" button (for inquiry-based pricing) - Opens in-page modal with inquiry form; taskee responds with proposal
  - **Modal Behavior:**
    - Clicking "Request Quote" opens an in-page modal (not a drawer/sidebar)
    - Modal contains the inquiry form with all configured fields
    - Upon successful form submission, disable the "Request Quote" button
    - Button state: Show "Quote Requested" or similar disabled state after submission
- Inquiry form submission (if inquiry-based) with photo upload
- Share functionality
- SEO optimization
- Social media meta tags

**Page Structure (Inspired by Task Detail Page):**
```svelte
{#if isLoggedIn}
  <!-- Dashboard layout for logged-in users -->
  <div class="bg-base-200 mx-auto flex h-full w-full flex-row gap-8 px-2 md:py-4">
    {#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200}
      <!-- Fixed Sidebar - Only on desktop -->
      <!-- Reuse sidebar structure from task detail page -->
    {/if}
    <!-- Main Content -->
    <div class="min-h-0 w-full flex-1">
      <ServiceDetailsView {serviceId} />
    </div>
  </div>
  <WarningPopup />
{:else}
  <!-- Simple layout for non-logged-in users -->
  <ServiceDetailsView {serviceId} />
{/if}
```

**Page Sections:**
1. **Header**: Title, provider info
2. **Overview**: Description, service location types (with badges), categories, skills
3. **Location Details**: 
   - If tasker_location: 
     - Taskee's service location address (public, displayed on map - where Taskee operates from)
     - Service radius displayed on map (circle overlay showing travel area)
     - Per-distance charge rate displayed prominently
     - Distance estimate calculator (if user logged in): Shows "Estimated travel fee: $X.XX (Y km × $Z.ZZ/km)" - calculates from Tasker's location to Taskee's service location
     - If user not logged in: Shows "Travel fee: $Z.ZZ/km" (per-unit only)
     - "Calculate distance from my location" button (if logged in) - calculates from Tasker's current location to Taskee's service location
   - If taskee_location: Service location information (specific location where service can be provided, or uses global location)
4. **Pricing**: 
   - For fixed/hourly: Pricing display
   - For tiered: Tier selector with feature comparison
   - For inquiry_required: "Request Quote" button that opens in-page modal with inquiry form
     - **Button State Management:**
       - Initially enabled: Shows "Request Quote"
       - After submission: Disabled, shows "Quote Requested" or similar text
       - Prevents duplicate submissions
5. **Add-Ons**: 
   - Simple add-ons selector (checkboxes with prices)
   - Price calculation: Base price + selected add-ons
7. **Portfolio**: Gallery of work samples
8. **Provider Info**: Avatar, name, rating, other services
9. **Actions**: Contact, Request Quote (opens in-page modal with inquiry form; disables button after submission; taskee responds with proposal or message), share

**Testing:**
- Page rendering tests
- Data display tests
- Button functionality tests
- SEO meta tag tests
- Share functionality tests
- Browser testing for visual verification

**Acceptance Criteria:**
- ✅ Page displays all service information
- ✅ All sections render correctly
- ✅ Buttons work correctly
- ✅ SEO tags are correct
- ✅ Responsive design works

#### 4.4.2. Create Service Detail Load Function (`src/routes/services/[serviceId]/+page.ts`)

**Maximize Code Reuse from Task Detail Load Function (`src/routes/tasks/[taskId]/+page.ts`):**

**Step 1: Extract Shared Helper Functions to Utility File**

Create `src/lib/utils/helpers/nostrIdHelpers.ts` with shared functions:
- ✅ **Extract `isEventId()`**: Move from task load function to shared utility (100% reusable)
- ✅ **Extract `isUuid()`**: Move from task load function to shared utility (100% reusable)
- ✅ **Extract `isNpub()`**: Move from task load function to shared utility (100% reusable)
- ✅ **Extract `npubToHex()`**: Move from task load function to shared utility (100% reusable)
- ✅ **Add `isNaddr()`**: New function for nservice1/naddr1 detection (services-specific)

**Step 2: Extract Shared Query Functions to Utility File**

Create `src/lib/utils/helpers/nostrQueryHelpers.ts` with parameterized query functions:
- ✅ **Extract `findEntityByUniqueId()`**: Generic function that accepts:
  - `entityType: 'task' | 'service'` (determines `d` tag prefix: `task-` vs `service-`)
  - `kind: number` (KINDS.TASK_CREATION vs 30402)
  - `uniqueId: string`
  - Returns same structure as `findTaskByUniqueId()`
- ✅ **Extract `findEntityByAuthor()`**: Generic function that accepts:
  - `kind: number` (KINDS.TASK_CREATION vs 30402)
  - `pubkey: string`
  - Returns same structure as `findTaskByAuthor()`
- ✅ **Update task load function**: Refactor to use shared `findEntityByUniqueId('task', KINDS.TASK_CREATION, uniqueId)` and `findEntityByAuthor(KINDS.TASK_CREATION, pubkey)`

**Step 3: Extract NIP-19 Query Function**

Create `src/lib/utils/helpers/nip19QueryHelpers.ts`:
- ✅ **Create `findEntityByNaddr()`**: Generic function that accepts:
  - `naddr: string` (nservice1 or naddr1 format)
  - Returns decoded naddr data and query result
  - Handles both nservice1 (custom) and naddr1 (standard) prefixes
  - Used by services (primary) and can be used by tasks (if needed)

**Step 4: Reuse Load Function Structure**

**Directly Reusable (Copy with minimal changes):**
- ✅ **Imports**: Same imports pattern (PageLoad, nostrEventsService, redirect, nip19, KINDS)
- ✅ **Constants**: `SITE_URL` constant (reuse exact same)
- ✅ **Prerender setting**: `export const prerender = false` (reuse exact same)
- ✅ **Error handling pattern**: Same try-catch structure and error logging
- ✅ **Redirect logic structure**: Same redirect pattern (just change URL path from `/tasks/` to `/services/`)

**Adaptable (Change entity-specific values):**
- ✅ **Load function flow**: Same overall structure:
  1. Detect ID type (event ID, UUID, npub, naddr/nservice)
  2. Query event based on ID type
  3. Extract uniqueId/naddr for redirect
  4. Redirect if needed
  5. Generate SEO metadata
  6. Return data
- ✅ **Event parsing**: Same `JSON.parse(event.content)` pattern (just change type from `Task` to `Service`)
- ✅ **SEO generation structure**: Same SEO object structure (adapt field names: `task` → `service`, `taskTitle` → `serviceTitle`, etc.)
- ✅ **JSON-LD generation**: Adapt `generateTaskJsonLd()` → `generateServiceJsonLd()` (change schema type from `JobPosting` to `Service`)

**Services-Specific (New code):**
- ✨ **NIP-19 nservice handling**: Primary approach - decode nservice1/naddr1, query by components
- ✨ **NIP-19 naddr generation**: `generateServiceNaddr()` function (services-specific)
- ✨ **Service-specific SEO fields**: Adapt SEO fields for services (pricing type, location types, etc.)
- ✨ **Service JSON-LD schema**: Use `Service` schema instead of `JobPosting` schema

**Code Reuse Summary:**
- **~70% reusable**: Helper functions, query functions, load function structure, error handling, constants
- **~20% adaptable**: SEO generation, JSON-LD generation, field names
- **~10% new**: NIP-19 nservice handling, service-specific SEO fields

**Features:**
- **Primary approach**: Load service by NIP-19 `naddr`/`nservice` identifier - decode to get `pubkey`, `kind`, `d` tag, then query latest version
- **Standard Nostr format**: Use NIP-19 `nservice1...` encoding (default format) - standard way to reference parameterized replaceable events
- **Fallback support**: Accept event ID, UUID, npub, or naddr1, but redirect to nservice1 URL (default format) for consistency
- **Query Latest Version:** Decode naddr to get `pubkey`, `kind` (30402), and `d` tag value, then query - relays automatically return newest version for parameterized replaceable events (NIP-33)
- Handle URL redirects (event ID → nservice1, UUID → nservice1, npub → nservice1, naddr1 → nservice1)
- Generate SEO metadata
- Handle 404 errors (service not found or deleted)
- Preload related data

**Load Function Implementation (Maximizing Reuse):**

```typescript
import type { PageLoad } from './$types';
import nostrEventsService from '$lib/api/services/nostr/events';
import type { Service } from '$lib/types/service';
import { nip19 } from 'nostr-tools';
import { redirect } from '@sveltejs/kit';
import KINDS from '$lib/utils/constants/kinds';
// Import shared helpers (extracted from task load function)
import { isEventId, isUuid, isNpub, npubToHex, isNaddr } from '$lib/utils/helpers/nostrIdHelpers';
import { findEntityByUniqueId, findEntityByAuthor } from '$lib/utils/helpers/nostrQueryHelpers';
import { findEntityByNaddr } from '$lib/utils/helpers/nip19QueryHelpers';
import { generateServiceNaddr } from '$lib/utils/helpers/nip19ServiceNaddr';

const SITE_URL = 'https://bittasker.com'; // Reuse exact same constant

export const prerender = false; // Reuse exact same setting

export const load: PageLoad = async ({ params, url }) => {
  const serviceId = params.serviceId;
  let naddr = serviceId; // Default to using serviceId as naddr
  let shouldRedirect = false;
  let event: any = null;
  
  // 1. PRIMARY: Check if it's NIP-19 nservice format (default) or naddr format (fallback)
  if (isNaddr(serviceId)) {
    // Use shared helper function
    const result = await findEntityByNaddr(serviceId);
    if (result?.data) {
      event = result.data;
      // If it's naddr format, redirect to nservice format for consistency
      if (serviceId.startsWith('naddr1')) {
        const contentData = JSON.parse(event.content) as ServiceBody; // Parse content JSON
        naddr = generateServiceNaddr(event.pubkey, 30402, `service-${contentData.uniqueId}`);
        shouldRedirect = true;
      }
      // No redirect needed if already nservice format
    }
  }
  // 2. FALLBACK: Check if it's event ID - decode and redirect to nservice1 format
  else if (isEventId(serviceId)) {
    // Reuse exact same pattern as tasks
    try {
      const result = await nostrEventsService.findEventById(serviceId);
      event = result.data;
      
      if (event) {
        // Extract uniqueId and generate naddr, then redirect
        try {
          const contentData = JSON.parse(event.content) as ServiceBody; // Parse content JSON
          if (contentData.uniqueId) {
            naddr = generateServiceNaddr(event.pubkey, 30402, `service-${contentData.uniqueId}`);
            shouldRedirect = true;
          }
        } catch (parseError) {
          console.error('Error parsing service data from event:', parseError);
        }
      }
    } catch (error) {
      console.error('Error loading service by event ID:', error);
    }
  }
  // 3. FALLBACK: Check if it's UUID - query and redirect to nservice format
  else if (isUuid(serviceId)) {
    // Use shared helper function with service-specific parameters
    try {
      const result = await findEntityByUniqueId('service', 30402, serviceId);
      if (result?.data) {
        event = result.data;
        // Generate naddr and redirect
        try {
          const contentData = JSON.parse(event.content) as ServiceBody; // Parse content JSON
          naddr = generateServiceNaddr(event.pubkey, 30402, `service-${contentData.uniqueId}`);
          shouldRedirect = true;
        } catch (parseError) {
          console.error('Error parsing service data:', parseError);
        }
      }
    } catch (error) {
      console.error('Error loading service by unique ID:', error);
    }
  }
  // 4. FALLBACK: Check if it's npub - find by author and redirect to nservice format
  else if (isNpub(serviceId)) {
    // Reuse exact same pattern as tasks
    try {
      const hexPubkey = npubToHex(serviceId);
      const result = await findEntityByAuthor(30402, hexPubkey);
      if (result?.data) {
        event = result.data;
        // Extract uniqueId for redirect
        try {
          const contentData = JSON.parse(event.content) as ServiceBody; // Parse content JSON
          if (contentData.uniqueId) {
            naddr = generateServiceNaddr(event.pubkey, 30402, `service-${contentData.uniqueId}`);
            shouldRedirect = true;
          }
        } catch (parseError) {
          console.error('Error parsing service data:', parseError);
        }
      }
    } catch (error) {
      console.error('Error loading service by npub:', error);
    }
  }
  
  // Redirect to nservice URL if we accessed via non-standard identifier
  // Reuse exact same redirect pattern as tasks (just change path)
  if (shouldRedirect && naddr !== serviceId && naddr) {
    throw redirect(301, `/services/${naddr}`);
  }
  
  // Generate SEO metadata using nservice1 as canonical URL (default format)
  const canonicalUrl = `${SITE_URL}/services/${naddr}`;
  
  // Default SEO data (adapt from task SEO structure)
  let seo = {
    title: 'Service Details - BitTasker',
    description: 'View service details and contact the provider on BitTasker, the Bitcoin-powered service marketplace.',
    keywords: 'bitcoin services, freelance work, gig economy, service marketplace, bitcoin payments',
    canonical: canonicalUrl,
    ogTitle: 'Service Details - BitTasker',
    ogDescription: 'View service details and contact the provider on BitTasker, the Bitcoin-powered service marketplace.',
    ogImage: `${SITE_URL}/images/og-service-default.jpg`,
    twitterTitle: 'Service Details - BitTasker',
    twitterDescription: 'View service details and contact the provider on BitTasker, the Bitcoin-powered service marketplace.',
    twitterImage: `${SITE_URL}/images/og-service-default.jpg`,
    jsonLd: null as any,
    service: null as Service | null
  };

  if (event) {
    // Parse content JSON (ServiceBody + metadata added during creation)
    const contentData = JSON.parse(event.content) as ServiceBody;
    // Combine content data with event metadata to create complete Service object
    const service: Service = {
      ...contentData,  // ServiceBody fields (title, description, pricing, etc.) + metadata (creator, createdAt, uniqueId, translations)
      id: event.id,    // From event metadata (not in content)
      npub: event.pubkey // From event metadata (not in content)
    };

    // Generate dynamic SEO data (adapt field names from tasks)
    const serviceTitle = service.title || 'Untitled Service';
    const serviceDescription = service.description || 'No description available';
    const servicePrice = service.pricing?.amount ? `$${service.pricing.amount}` : 
                        service.pricing?.hourlyRate ? `$${service.pricing.hourlyRate}/hr` : 
                        'Price varies';
    const serviceLocation = service.locationDetails?.taskeeLocation?.locationDisplayName || 
                           service.locationDetails?.taskerLocation?.serviceLocation?.displayName || 
                           'Remote';
    const serviceSkills = service.skills?.join(', ') || '';
    
    // Reuse exact same truncation logic as tasks
    const truncatedDescription = serviceDescription.length > 150 
      ? serviceDescription.substring(0, 147) + '...' 
      : serviceDescription;

    seo = {
      title: `${serviceTitle} - ${servicePrice} - BitTasker`,
      description: `${truncatedDescription} | Price: ${servicePrice} | Location: ${serviceLocation} | Skills: ${serviceSkills}`,
      keywords: `bitcoin service, ${serviceSkills}, ${serviceLocation}, freelance work, gig economy, service marketplace, bitcoin payments, ${serviceTitle.toLowerCase()}`,
      canonical: canonicalUrl,
      ogTitle: `${serviceTitle} - ${servicePrice} - BitTasker`,
      ogDescription: `${truncatedDescription} | Price: ${servicePrice} | Location: ${serviceLocation}`,
      ogImage: service.portfolio?.[0]?.url || `${SITE_URL}/images/og-service-default.jpg`,
      twitterTitle: `${serviceTitle} - ${servicePrice} - BitTasker`,
      twitterDescription: `${truncatedDescription} | Price: ${servicePrice} | Location: ${serviceLocation}`,
      twitterImage: service.portfolio?.[0]?.url || `${SITE_URL}/images/og-service-default.jpg`,
      jsonLd: generateServiceJsonLd(service, canonicalUrl),
      service
    };
  }
  
  // Reuse exact same return pattern as tasks
  return {
    seo,
    serviceId: naddr // Always use naddr for the component (standard Nostr identifier)
  };
};

// Adapt JSON-LD generation from tasks (change schema type and fields)
function generateServiceJsonLd(service: Service, canonicalUrl: string) {
  const baseUrl = SITE_URL;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Service', // Changed from JobPosting
    name: service.title,
    description: service.description,
    provider: {
      '@type': 'Person',
      name: service.creator?.username || 'Service Provider'
    },
    areaServed: service.locationDetails?.taskeeLocation?.locationDisplayName || 
                service.locationDetails?.taskerLocation?.serviceLocation?.displayName || 
                'Remote',
    offers: service.pricing?.amount ? {
      '@type': 'Offer',
      price: service.pricing.amount,
      priceCurrency: service.pricing.currency === 'BTC' ? 'BTC' : 'USD'
    } : undefined,
    url: canonicalUrl,
    identifier: {
      '@type': 'PropertyValue',
      name: 'BitTasker Service ID',
      value: service.id
    }
  };
}
```

**Implementation Steps:**

1. **Extract shared helpers** from task load function to utility files (before implementing service load function)
2. **Refactor task load function** to use shared helpers (ensures compatibility)
3. **Implement service load function** using shared helpers (minimal new code)
4. **Clean Up** remove old helper functions from tasks files that are no longer being used
5. **Test both** task and service load functions to ensure shared helpers work correctly

**Key Points:**
- **Primary: NIP-19 naddr**: Standard Nostr format for parameterized replaceable events - encodes `pubkey`, `kind`, `d` tag, and optional relays
- **Automatic latest version**: Decoding naddr and querying by its components automatically gets latest version (relays handle this)
- **Redirect pattern**: Non-standard identifiers (event ID, UUID, npub, naddr1) redirect to nservice1 URL (default format) for consistency
- **Component receives naddr**: The component always receives naddr from load function (standard Nostr identifier)
- **Interoperability**: Other Nostr clients can use the naddr directly to reference the service

**Testing:**
- Load function tests
- Error handling tests
- SEO generation tests
- Redirect tests

**Acceptance Criteria:**
- ✅ Service loads correctly
- ✅ Redirects work
- ✅ SEO data is generated
- ✅ Errors are handled gracefully

#### 4.4.3. Create Service Details View Component (`src/lib/components/service/ServiceDetailsView.svelte`)

**Reuse from Task Details View (`src/lib/components/task/TaskDetailsView.svelte`):**
- ✅ **Component structure**: Overall layout pattern (`mx-auto max-w-6xl px-2 pb-24 md:px-0 md:pb-0`)
- ✅ **Header section**: Title, description, and action buttons (share, copy link) - reuse same button styling and icons
- ✅ **Loading/error states**: Same loading and error message display pattern
- ✅ **State management**: Same `$state` pattern for service data, loading, error
- ✅ **Props pattern**: Same `taskId` prop pattern → `serviceId`
- ✅ **Owner detection**: Same `isOwner` derived state pattern (`service?.npub === $user?.npub`)
- ✅ **Share functionality**: Reuse `handleShare()` and `handleCopyLink()` functions (adapt share link URL)
- ✅ **Share link generation**: Same `shareLink` derived state pattern
- ✅ **Copy link success state**: Same `copyLinkSuccess` state and toast pattern
- ✅ **Gallery component**: Reuse `Gallery` component import and `prepareGalleryImages()` helper function
- ✅ **Translatable content**: Reuse `TranslatableTask` component pattern → adapt to `TranslatableService`
- ✅ **Location map**: Reuse `TaskLocationMap` component → adapt to `ServiceLocationMap`
- ✅ **Modal pattern**: Use in-page modal for inquiry form (adapt modal pattern from existing modals, not drawer/sidebar)
  - **State Management:**
    - `isInquiryModalOpen` state (boolean)
    - `quoteRequested` state (boolean) - tracks if user has already submitted inquiry
    - Disable "Request Quote" button when `quoteRequested === true`
- ✅ **BTC price fetching**: Reuse `fetchBtcPrice()` and `cryptoPriceService` pattern (for price conversions)
- ✅ **Date formatting**: Reuse date formatting helpers (`formatStandardDateShort`, `formatStandardDateTime`)
- ✅ **Currency formatting**: Reuse `formatNumberWithTwoDecimals`, `satsFromUsd` helpers
- ✅ **Navigation handling**: Reuse `afterNavigate` pattern for reloading on navigation
- ✅ **Effect for prop changes**: Same `$effect` pattern to reload when `serviceId` changes
- ✅ **Owner detection**: Same `isOwner` derived state pattern (`service?.npub === $user?.npub`) - used to conditionally show edit/delete buttons
- ✅ **NIP-19 decoding**: Decode `nservice1...` identifier (default) or `naddr1...` (fallback) to get `pubkey`, `kind`, `d` tag value
- ✅ **Query pattern**: Decode nservice/naddr, then query by `pubkey`, `kind`, and `d` tag to get latest version automatically; fallback to event ID if not nservice/naddr format
- ✅ **onMount pattern**: Same `onMount` for initial data loading
- ✅ **Icon imports**: Reuse same icon import pattern (unplugin-icons)
- ✅ **Responsive design**: Same responsive classes and breakpoints

**Features:**
- **Adapt from:** `TaskDetailsView.svelte` structure and layout (copy structure, adapt content)
- Reusable component for service display - reuse TaskDetailsView component pattern
- **Single public route**: All service links use public URL (`/services/[serviceId]`) - no separate protected route
- **Adaptive UI**: Component adapts based on authentication state (`isLoggedIn`) and ownership (`isOwner`)
  - **Logged out**: Shows public service information, "Contact Provider" button, inquiry form (if applicable)
  - **Logged in (not owner)**: Shows same as logged out + messaging integration, inquiry form with user context
  - **Logged in (owner)**: Shows same as logged in + edit button, delete button, status toggle, inquiry statistics
- Responsive layout - reuse TaskDetailsView responsive design
- Image gallery - reuse `Gallery` component and `prepareGalleryImages()` helper from TaskDetailsView
- Provider information - reuse TaskDetailsView creator display pattern
- Service location types display with per-distance charge indicator - adapt `TaskLocationMap` to `ServiceLocationMap`
- Service tier selector (if tiered pricing) - new section
- Add-ons selector (if available) - simple checkboxes with prices - new section
- Price calculator component showing total breakdown (base price + selected add-ons) - adapt TaskDetailsView budget display
- Inquiry form component (if inquiry-based pricing) - displayed in in-page modal (not drawer)
  - **Modal Implementation:**
    - Use DaisyUI modal component (`<dialog>` or modal pattern)
    - Opens when "Request Quote" button is clicked
    - Contains full inquiry form with all configured fields
    - Close button/backdrop click closes modal
    - On successful submission: Close modal, disable "Request Quote" button, show success message
- **Enhanced Share Actions** - Extended share functionality
  - **Reuse Pattern:** Extend `handleShare()` and `handleCopyLink()` from `TaskDetailsView.svelte` (lines 86-110)
  - **Share Menu Dropdown:** Replace single share button with dropdown menu
    - Copy Link (reuse `handleCopyLink()` pattern)
    - Share to Twitter/X (generate Twitter share URL: `https://twitter.com/intent/tweet?text=${encodeURIComponent(service.title)}&url=${encodeURIComponent(shareLink)}`)
    - Share to Facebook (generate Facebook share URL: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`)
    - Generate QR Code (use QR library to encode `nservice1...` URL, display in modal)
    - Native Share (reuse Web Share API: `navigator.share()`)
  - **QR Code Generation:** 
    - **Reuse Pattern:** Use existing `generateQrCodeUrl()` helper from `src/lib/utils/helpers/generateQrCodeUrl.ts`
    - **Library:** Uses `qrcode` npm package (already installed: version 1.5.4)
    - **Implementation:**
      ```typescript
      import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
      const qrCodeDataUrl = await generateQrCodeUrl(serviceUrl); // Returns data URL with BitTasker logo
      ```
    - Encode service URL (`nservice1...` format)
    - Display QR code in modal with download option (same pattern as wallet QR codes)
    - **Fallback:** If QR generation fails, hide QR option or show error message
  - **Social Share URLs:** Generate share URLs for major platforms (Twitter, Facebook, LinkedIn)
- **Related Services Section** - Show similar services
  - **Reuse Pattern:** Adapt similarity calculation logic from `src/lib/nostr/recommendations.ts`
  - **Implementation:**
    - Create `getRelatedServices(service: Service, limit: number = 5): Promise<Service[]>`
    - **Matching Criteria:** Match by title similarity, categories, and skills (NOT user preferences)
    - **Similarity Scoring:**
      - Title similarity: 40% weight (calculate using string similarity/Levenshtein distance)
      - Categories match: 35% weight (percentage of matching categories)
      - Skills match: 25% weight (percentage of matching skills)
      - Overall match % = (titleScore × 0.4) + (categoryScore × 0.35) + (skillsScore × 0.25)
    - Exclude current service
    - Sort by overall match % (descending)
    - Return top 5 related services (minimum 30% match threshold)
  - **Performance Optimization:**
    - **Query Optimization:** 
      - First filter by matching categories (reduce candidate set using `#categories` tag filter)
      - Then calculate similarity scores on filtered set
      - Limit initial query to 50-100 services max
    - **Caching:** Cache related services results (TTL: 5 minutes, cache key: `related-services-${serviceId}`)
    - **Lazy Loading:** Load related services after main service loads (don't block page render)
  - **Display:** Show "Similar Services" section on service detail page
    - Grid layout with service cards (reuse `ServiceCard.svelte`)
    - Limit to 5 services
    - Link to related service detail pages
- Action buttons - reuse TaskDetailsView action button pattern (share dropdown, copy link, contact, request quote)
- **Owner-specific actions**: When `isOwner` is true, show edit button (links to `/dashboard/list-service?edit=true&serviceId=${serviceId}`), delete button, status toggle
- **Edit button**: Only visible to owner, navigates to edit flow using `?edit=true` parameter (same pattern as tasks)

**Testing:**
- Component rendering tests
- Props handling tests
- Responsive design tests
- Tier selection tests
- Add-ons selection tests
- Inquiry form submission tests
- **Enhanced Share Actions Tests:**
  - Share dropdown menu tests
  - Copy link functionality tests
  - Social share URL generation tests
  - QR code generation tests
  - Native share API tests
- **Related Services Tests:**
  - Related services calculation tests (title, categories, skills matching)
  - Similarity scoring tests (verify scoring weights: 40% title, 35% categories, 25% skills)
  - Related services display tests
  - Service exclusion tests (current service not shown)
  - **Limit Tests:** Verify maximum 5 services returned
  - Query optimization tests (category filtering before scoring)
  - Caching tests (verify cache TTL and invalidation)
  - Lazy loading tests (verify doesn't block page render)

**Acceptance Criteria:**
- ✅ Component renders correctly
- ✅ All props work correctly
- ✅ Responsive design works
- ✅ Tier selection works
- ✅ Add-ons selection works
- ✅ Inquiry form submission works
- ✅ "Request Quote" button disables after successful submission
- ✅ Modal closes after successful submission
- ✅ Share dropdown menu works correctly
- ✅ All share options work (copy link, social shares, QR code)
- ✅ Related services are calculated and displayed correctly
- ✅ Related services exclude current service

#### 4.4.4. Create Service Inquiry Form Component (`src/lib/components/service/ServiceInquiryForm.svelte`)

**Component Usage:**
- **Displayed in:** In-page modal (not drawer/sidebar)
- **Triggered by:** "Request Quote" button click
- **Modal Component:** Use DaisyUI modal pattern or custom modal component
- **Props:**
  - `service: Service` - Service data including inquiry form configuration
  - `isOpen: boolean` - Controls modal visibility
  - `onClose: () => void` - Callback to close modal
  - `onSubmit: (formData: InquiryFormData) => Promise<void>` - Callback on successful submission
  - `onQuoteRequested: () => void` - Callback to update parent component's button state

**Features:**
- Dynamic form rendering based on service's inquiry form configuration
- Support for all field types (text, textarea, number, select, checkbox, date, time)
- **Field Validation:** Comprehensive validation based on form configuration
  - **Required Fields:** Show error if required field is empty (display inline error below field)
  - **Number Fields:** Validate min/max if specified in config (show error if out of range)
  - **Select/Checkbox:** Validate at least one option selected if required (show error if none selected)
  - **Date/Time:** Validate date is not in past (if applicable, show error if invalid)
  - **Photo Upload Validation:**
    - **Maximum Photos:** 5 photos per inquiry
    - **Maximum File Size:** 10MB per photo
    - **Allowed File Types:** JPEG, PNG, WebP, GIF
    - **Validation Errors:**
      - If > 5 photos: "Maximum 5 photos allowed. Please remove extra photos."
      - If file > 10MB: "File size exceeds 10MB limit. Please compress or choose a smaller file."
      - If invalid file type: "Invalid file type. Please use JPEG, PNG, WebP, or GIF."
  - **Text Field Validation:**
    - **Maximum Length:** 5000 characters for text/textarea fields
    - **Validation Error:** "Text exceeds 5000 character limit. Please shorten your message."
  - **Field Configuration:**
    - Service provider can mark fields as required/optional in inquiry form builder
    - Required fields show asterisk (*) and must be filled before submission
    - Optional fields can be left empty
  - **Error Display:** Show inline errors below each field with clear error messages
  - **Form Submission:** Prevent submission if any validation errors exist
- Message field (if enabled in form config)
- Photo upload/capture functionality
  - Upload from device
  - Take picture (mobile)
  - Image preview
  - Multiple photos support
  - **File Upload:** Photos uploaded via `uploadService` with `folder: 'services/inquiries'` (same pattern as task attachments)
  - **Attachment Storage:** Photos stored as `Attachment[]` with URLs, keys, and metadata
- Form submission handling
- Loading states during submission
- Success/error feedback
- Integration with messaging system (creates DM with provider)

**Form Submission Flow:**
1. User clicks "Request Quote" button
2. In-page modal opens with inquiry form
3. User fills out inquiry form
4. User can upload photos (always available, via `uploadService` with `folder: 'services/inquiries'`)
5. User can add a message (always available)
6. User submits form
7. System creates specialized DM to service provider using `sendDirectMessage()` with inquiry tags
8. DM includes structured inquiry data (similar to location sharing DMs)
9. Provider receives notification and inquiry appears in inbox with special rendering
10. **On successful submission:**
    - Modal closes automatically
    - "Request Quote" button is disabled
    - Button text changes to "Quote Requested" or similar disabled state
    - User receives confirmation message (toast or inline message)
11. **Button State Management:**
    - Track submission state: `quoteRequested` (boolean)
    - If `quoteRequested === true`: Disable button, show disabled state
    - Prevents duplicate submissions

**DM Integration Details:**
- **Reuse:** DM pattern from `src/lib/utils/location/sendLocation.ts` `sendLocationToTaskee()` function
- **DM Structure:** Uses `TAG_PATTERNS.inquiry()` (create new pattern) for structured data
- **Create TAG_PATTERNS.inquiry() Function (`src/lib/utils/constants/tags.ts`):**
  ```typescript
  export const TAG_PATTERNS = {
    inquiry: (inquiryData: {
      serviceId: string;
      inquiryId: string;
      taskerNpub: string;
    }) => [
      ['e', inquiryData.serviceId], // Service event ID
      ['p', inquiryData.taskerNpub], // Tasker pubkey
      ['message_type', 'service_inquiry'], // Human-readable message type
      ['inquiry_id', inquiryData.inquiryId], // Unique inquiry identifier
      ['service', inquiryData.serviceId] // Service reference (human-readable)
    ]
  };
  ```
- **Message Format:** Includes human-readable text + structured JSON data: `[INQUIRY_DATA:${JSON.stringify(inquiryData)}]`
- **Inquiry Data Structure:**
  ```typescript
  {
    type: 'service_inquiry',
    serviceId: string,
    serviceTitle: string,
    formResponses: { [fieldId]: any },
    message?: string,
    photos?: Attachment[],
    taskerNpub: string,
    taskerName?: string
  }
  ```
- **Inbox Display:** Inquiry DMs show up in inbox with special rendering (similar to location messages)
- **Thread Management:** Creates new thread or uses existing thread with service provider

**Testing:**
- Form rendering tests
- **Field Validation Tests:**
  - Required field validation tests
  - Number field min/max validation tests
  - Select/checkbox required option tests
  - Date/time validation tests (past date prevention)
  - **Photo Upload Validation Tests:**
    - Maximum 5 photos limit tests
    - Maximum 10MB file size tests
    - File type validation tests (JPEG, PNG, WebP, GIF)
    - Multiple validation error display tests
  - **Text Field Validation Tests:**
    - Maximum 5000 character limit tests
    - Character count display tests
  - **Field Configuration Tests:**
    - Required/optional field configuration tests
    - Required field asterisk display tests
  - Inline error display tests
  - Form submission prevention on validation errors
- Photo upload tests
- Form submission tests
- Integration with messaging tests
- Modal open/close tests
- Button state management tests (enabled/disabled states)
- Quote requested state tracking tests
- Duplicate submission prevention tests

**Modal Integration (in ServiceDetailsView):**
- **Modal State Management:**
  - Parent component (`ServiceDetailsView`) manages `isInquiryModalOpen` state
  - Parent component manages `quoteRequested` state (tracks if user has submitted inquiry)
  - Modal opens when "Request Quote" button is clicked
  - Modal closes on successful submission or user cancellation
- **Button State Management:**
  - `quoteRequested` state: `boolean` - tracks if inquiry has been submitted
  - "Request Quote" button:
    - **Initial state:** Enabled, shows "Request Quote"
    - **After submission:** Disabled, shows "Quote Requested" (or similar text)
    - **Button props:** `disabled={quoteRequested}`, `class={quoteRequested ? 'btn-disabled' : 'btn-primary'}`
  - Button click handler:
    - If `quoteRequested === false`: Open modal (`isInquiryModalOpen = true`)
    - If `quoteRequested === true`: Do nothing (button is disabled)
- **Success Handling:**
  - On successful form submission:
    1. Call `onQuoteRequested()` callback to update parent state
    2. Close modal (`isInquiryModalOpen = false`)
    3. Set `quoteRequested = true` in parent
    4. Show success message (toast or inline notification)

**Acceptance Criteria:**
- ✅ Form renders all configured fields
- ✅ Validation works correctly
- ✅ Photo upload works
- ✅ Modal opens when "Request Quote" button is clicked
- ✅ Modal closes on successful submission
- ✅ "Request Quote" button disables after successful submission
- ✅ Button shows "Quote Requested" (or similar) when disabled
- ✅ Form submission creates DM
- ✅ Provider receives inquiry notification
- ✅ Duplicate submissions are prevented (button remains disabled)

#### 4.4.5. Create Service Add-Ons Selector Component (`src/lib/components/service/ServiceAddOnsSelector.svelte`)

**Features:**
- Display list of available add-ons
- Simple checkbox selection for each add-on
- Show add-on name, description (if available), and price
- Real-time price calculation as add-ons are selected
- Display total price breakdown (base price + selected add-ons)

**Component Props:**
- `addOns`: Array of AddOn objects
- `basePrice`: Base service price (for fixed/hourly) or selected tier price (for tiered pricing)
- `onSelectionChange`: Callback when add-on selections change
- `selectedAddOns`: Current selected add-on IDs

**User Interaction:**
- Check/uncheck add-ons to include/exclude them
- See real-time price updates
- View price breakdown (base + add-ons = total)

**Testing:**
- Add-on list rendering tests
- Checkbox selection tests
- Price calculation tests
- Price breakdown display tests
- Stock availability tests
- Responsive design tests

**Acceptance Criteria:**
- ✅ All display types render correctly
- ✅ Single and multiple selection work
- ✅ Quantity inputs work
- ✅ Real-time price updates work
- ✅ Image grid is responsive
- ✅ Out-of-stock options are disabled
- ✅ Price adjustments display correctly

#### 4.4.6. Owner-Specific Features (Integrated into ServiceDetailsView Component)

**Note:** No separate protected route needed - owner-specific features are integrated into the single public service detail page (`/services/[serviceId]`). All service links use the public URL regardless of ownership.

**Reuse from Task System:**
- ✅ Delete button pattern from `TaskTab.svelte` (lines 453-480)
- ✅ Delete confirmation modal pattern from `TaskTab.svelte` (lines 562-627)
- ✅ Owner detection pattern (`isOwner` derived state: `service?.npub === $user?.npub`)
- ✅ Deletion modal patterns (error modal, warning modal, confirmation modal) - adapt for services

**Owner Actions (Shown when `isOwner === true`):**
- **Edit button**: Visible only to owner, navigates to `/dashboard/list-service?edit=true&serviceId=${serviceId}` (uses edit flow)
- **Delete button**: Visible only to owner, always enabled, creates NIP-09 deletion event (conditional modals based on active escrows/inquiries)
- **Status toggle**: Toggle button/switch for active/inactive status (owner only)
  - **Valid Status Transitions:**
    - `active` ↔ `inactive` (bidirectional, no confirmation needed)
    - `active` → `sold` (one-way, requires confirmation modal)
    - `inactive` → `active` (allowed, no confirmation needed)
  - **Active Inquiries:** When deactivating, show notification: "This service has X pending inquiries. They will be notified."
  - **Confirmation:** Require confirmation modal for `active` → `sold` transition (irreversible)
- **Statistics**: Inquiries count (owner only)
- **Quick actions**: Edit, delete, status toggle in action bar (owner only)

**Deletion UI (Owner Only):**
- Delete button in action bar (always enabled, only shown when `isOwner === true`)
- **Deletion Flow with Conditional Modals:**
  1. **User clicks "Delete" button** (always enabled)
  2. **Check for active escrows:**
     - Query escrows for service: `getContracts({ serviceIds: [serviceId] })`
     - Check if any escrow was funded or has pending funding
     - **If active escrows exist:**
       - Show **Error Modal** (not confirmation):
         - Title: "Cannot Delete Service"
         - Message: "There are tasks that are currently in progress, so the service can't be deleted."
         - Buttons:
           - "Cancel" (secondary button) - closes modal
           - "See Tasks" (primary button) - navigates to service's active escrows/contracts page
         - **Navigation:** `goto('/dashboard/contracts?serviceId=${serviceId}')` or similar
       - **Do NOT proceed with deletion**
  3. **If no active escrows, check for active inquiries:**
     - Query inquiries for service: `getServiceInquiries({ serviceId })`
     - Filter for active inquiries: status in `['new', 'responded', 'proposal_sent']`
     - **If active inquiries exist:**
       - Show **Warning Modal**:
         - Title: "Delete Service with Active Inquiries?"
         - Message: "There are {count} active inquiries that will be deleted. All pending inquiries will be automatically declined."
         - Buttons:
           - "Cancel" (secondary button) - closes modal, no action
           - "Decline Inquiries" (primary button) - proceeds with deletion flow
         - **On "Decline Inquiries" click:**
           - Automatically decline all active inquiries (update inquiry status to 'declined')
           - Create decline events for each inquiry (NIP-04/NIP-44 DM with declined status)
           - Notify taskers that their inquiries were declined
           - Then proceed to deletion confirmation
  4. **If no active escrows and no active inquiries:**
     - Show **Confirmation Modal** (standard deletion confirmation):
       - Title: "Delete Service?"
       - Message: "Are you sure you want to delete this service? This action cannot be undone."
       - Buttons:
         - "Cancel" (secondary button) - closes modal
         - "Delete" (primary button, error/danger styling) - proceeds with deletion
       - **On "Delete" click:**
         - Create NIP-09 deletion event (kind 5)
         - Publish deletion event to relays
         - Show success message
         - Navigate to my-services page or refresh service list
- Show loading state during deletion process
- Handle errors gracefully (show error toast/message)

**Decline Inquiries Implementation:**
- `declineAllInquiries(serviceId: string): Promise<void>`
  - Query all active inquiries for service
  - For each inquiry:
    - Update inquiry status to 'declined'
    - Create decline DM to tasker (NIP-04/NIP-44 encrypted)
    - Include structured data: `{ type: 'inquiry_declined', serviceId, inquiryId, reason: 'service_deleted' }`
  - Return when all inquiries are declined
- **DM Structure for Declined Inquiries:**
  - Use `TAG_PATTERNS.inquiry()` with status 'declined'
  - Include `['reason', 'service_deleted']` tag
  - Message content: "Your inquiry for [Service Title] has been declined because the service listing was deleted."

**Navigation to Active Escrows:**
- **Route:** `/dashboard/contracts?serviceId=${serviceId}` or `/dashboard/contracts?filter=service&serviceId=${serviceId}`
- **Filter contracts page** to show only contracts for this service
- **Reuse:** Existing contracts page with service filter applied
- **Display:** Show all active escrows/contracts for this service

**Status Toggle UI (Owner Only):**
- Toggle button/switch for active/inactive status (only shown when `isOwner === true`)
- **Valid Status Transitions:**
  - `active` ↔ `inactive` (bidirectional, no confirmation needed)
  - `active` → `sold` (one-way, requires confirmation modal)
  - `inactive` → `active` (allowed, no confirmation needed)
- **Status Transition Validation:**
  - **To 'sold':** 
    - **Requirement:** Service must have NO active escrows
    - **Validation:** Query escrows for service, check for active status
    - **If active escrows exist:** Disable "Mark as Sold" button, show tooltip: "Cannot mark as sold while active escrows exist"
    - **If no active escrows:** Allow transition, show confirmation modal
  - **To 'inactive':**
    - **Requirement:** Service must have NO active escrows
    - **Validation:** Query escrows for service, check for active status
    - **If active escrows exist:** Disable "Deactivate" button, show tooltip: "Cannot deactivate while active escrows exist"
    - **If no active escrows:** Allow transition, no confirmation needed
    - **Pending Inquiries:** Pending inquiries remain active and can still be responded to when service is inactive
    - **Notification:** When deactivating with pending inquiries, show info message: "This service has X pending inquiries. They will remain active for you to respond to."
- **Confirmation:** Require confirmation modal for `active` → `sold` transition (irreversible)
- Visual status indicator

**Implementation Notes:**
- All owner-specific UI is conditionally rendered in `ServiceDetailsView.svelte` based on `isOwner` derived state
- No separate protected route needed - single public route adapts to ownership
- Edit button uses query parameter approach (`?edit=true`) to trigger edit mode in list-service route
- All links to services use public URL (`/services/[serviceId]`) regardless of ownership

**Testing:**
- Owner detection works correctly
- Edit button only shows for owner
- Delete button only shows for owner
- Status toggle only shows for owner
- Delete functionality (NIP-09 deletion event creation)
- Deletion confirmation modal works
- Status toggle functionality works
- Non-owners don't see owner-specific UI
- **Status Transition Validation Tests:**
  - Active escrow check tests (query escrows, verify active status)
  - "Mark as Sold" validation tests (disabled if active escrows, enabled if none)
  - "Deactivate" validation tests (disabled if active escrows, enabled if none)
  - Pending inquiries notification tests (show count when deactivating)
  - Confirmation modal tests (required for sold transition)
  - Tooltip display tests (show reason when disabled)

**Acceptance Criteria:**
- ✅ Owner detection works correctly
- ✅ Edit button shows only for owner and navigates to edit flow
- ✅ Delete button shows only for owner and creates NIP-09 deletion events correctly
- ✅ Status toggle shows only for owner and works correctly
- ✅ Deleted services are filtered from queries
- ✅ Deletion confirmation modal works
- ✅ Non-owners don't see owner-specific UI

### Phase 5: Service Management

**Objective:** Allow providers to manage their service listings.

#### 4.5.1. Create My Services Page (`src/routes/(protected)/dashboard/my-services/+page.svelte`)

**Reuse from Task System:**
- ✅ Service list/grid view pattern from dashboard tasks panel
- ✅ Quick actions pattern (edit, delete buttons)
- ✅ Delete confirmation modal pattern
- ✅ Status filter pattern

**Features:**
- List of user's services
- Service status indicators
- Quick actions (edit, activate/deactivate toggle, delete)
- List new service button
- Filter by status
- Search own services
- Statistics (total services, active, inactive, sold, inquiries received)

**Service Card Actions:**
- Edit button (navigates to edit form: `/dashboard/list-service?edit=true&serviceId=${serviceId}`)
- **Duplicate Service button** - Quick duplicate/clone service
  - Copies all service data except `uniqueId`, `createdAt`, `id`, `npub`, `status`, and `translations`
  - **Portfolio files are duplicated** (all portfolio Attachment objects with URLs are copied)
  - Pre-populates service creation form with copied data using service store
  - User can modify and publish as new service
  - **Reuse Pattern:** Similar to task duplication pattern (if exists) or form pre-population pattern
  - **Implementation:** 
    1. Load service data by `serviceId` (use `findServiceByNaddr()` or `findServiceByUniqueId()`)
    2. Remove fields: `id`, `uniqueId`, `createdAt`, `updatedAt`, `npub`, `status` (set to 'inactive' draft)
    3. **Portfolio Files:** Copy all portfolio Attachment objects (include all portfolio items with URLs, keys, metadata)
      - **Portfolio Duplication:** All portfolio files are copied as-is (Attachment objects with URLs, keys, metadata)
      - **UI Behavior:** Portfolio step in wizard shows all duplicated portfolio files
      - **File References:** Portfolio files reference the same URLs/keys as original (files are stored in Cloudflare R2, so URLs remain valid)
      - **User Can:** User can remove, add, or modify portfolio items before publishing
    4. **Translations:** Remove `translations` field (translations will be generated when user lists the service)
    5. Navigate to `/dashboard/list-service` with `?duplicate=true&serviceId=${serviceId}` query param
    6. Form route detects `duplicate` param and loads service data into service store
    7. Pre-populate service store with copied data (including portfolio, excluding removed fields)
    8. User edits and publishes as new service (generates new `uniqueId` and translations)
- Activate/Deactivate toggle button (quick status change)
- Delete button (with confirmation modal)
- View button (navigates to public service detail page: `/services/${serviceId}` - same URL for all users)

**Deletion Features:**
- Delete button on each service card (owner only, always enabled)
- **Deletion Flow:** Same conditional modal flow as service detail page
  1. Check for active escrows → Error modal with "See Tasks" button
  2. Check for active inquiries → Warning modal with "Decline Inquiries" button
  3. No active escrows/inquiries → Confirmation modal
- Show loading state during deletion
- Refresh list after deletion

**Bulk Actions:**
- Bulk deactivate (set multiple to 'inactive')
- Bulk activate (set multiple to 'active')
- Note: Bulk delete not recommended (use individual deletion with confirmation)

**Empty State:**
- Message encouraging user to list their first service
- "List Service" CTA button

**Testing:**
- List rendering tests
- Filter tests
- Action tests (edit, delete, status toggle)
- Deletion modal tests (error modal, warning modal, confirmation modal)
- Empty state tests
- Bulk action tests
- **Service Duplicate Tests:**
  - Duplicate button functionality tests
  - Form pre-population tests
  - Data copying tests (verify all fields copied except uniqueId/createdAt/translations)
  - Portfolio duplication tests (verify all portfolio files are copied)
  - Portfolio display tests (verify duplicated portfolio shows in wizard)
  - New service creation from duplicate tests

**Acceptance Criteria:**
- ✅ Services list displays correctly
- ✅ Filters work
- ✅ Edit action works
- ✅ Delete action creates NIP-09 deletion events correctly
- ✅ Deleted services are removed from list
- ✅ Status toggle works
- ✅ Empty state displays
- ✅ Duplicate service copies all data correctly (including portfolio files)
- ✅ Portfolio files are duplicated and displayed in wizard
- ✅ Duplicate pre-populates form correctly
- ✅ New service can be created from duplicate

#### 4.5.2. Create Service Edit Functionality

**Reuse from Task System:**
- ✅ Update pattern from `src/lib/nostr/task.ts` `updateTask()` function
- ✅ Query by `d` tag pattern (parameterized replaceable events)
- ✅ Translation regeneration logic

**Features:**
- Edit existing services
- Use same form as creation
- Pre-populate form with existing data
- Update service via NIP-33 parameterized replaceable events
- Handle update conflicts

**NIP-33 Parameterized Replaceable Events Implementation:**
- **Replacement Rules:** New event replaces old when:
  - Same author (`pubkey`)
  - Same event kind (`30402` for active, `30403` for drafts)
  - Same `d` tag value (`service-${uniqueId}`)
  - Higher `created_at` timestamp
- **Query Original Event:** Query by NIP-19 naddr (decode to get `pubkey`, `kind`, `d` tag) or fallback to `d` tag filter: `#d: ['service-${uniqueId}']`
- **Keep Same uniqueId:** Critical for stable naddr identifiers and replacement mechanism (naddr encodes uniqueId in `d` tag)
- **Event Kind Handling:** Use same kind as original, or update if status changed ('active' ↔ 'inactive')
- **Translation Regeneration:** Regenerate if title/description changed (same as tasks)
- **Cache Invalidation:** Clear/update cache entries when service is updated

**Implementation:**
- Reuse list-service route with `?edit=true` parameter
- Load existing service data (query latest version by `d` tag)
- Pre-populate form with latest service data
- Update instead of create on submit
- **Race Condition Handling:**
  - Store original `created_at` timestamp when form loads
  - Before update, query latest version by `d` tag and compare `created_at` timestamps
  - If newer version exists:
    - Show warning: "Service was updated. Reload latest version?"
    - Option 1: Reload and merge changes (recommended)
    - Option 2: Force update (overwrite newer version - warn user)
    - Option 3: Cancel and show diff
  - Store original `created_at` when form loads, compare on submit

**Testing:**
- Edit form tests
- Data loading tests
- Update functionality tests
- NIP-33 replacement mechanism tests
- Conflict handling tests
- Race condition tests (concurrent updates)

**Acceptance Criteria:**
- ✅ Edit form loads correctly
- ✅ Data pre-populates with latest version
- ✅ Updates create new events that replace old ones correctly
- ✅ Conflicts are handled (detect newer versions)
- ✅ Translations regenerate when content changes

#### 4.5.3. Create Service Status Management

**Reuse from Task System:**
- ✅ Status toggle pattern from task status management
- ✅ Deletion confirmation modal pattern from task deletion
- ✅ NIP-09 deletion event creation from `src/lib/nostr/task.ts` `deleteTask()` function

**Features:**
- Toggle service active/inactive (updates status to 'active'/'inactive')
- Delete service using NIP-09 deletion events (kind 5) - same pattern as task deletion
- Status change notifications

**Deletion Implementation:**
- `deleteService(serviceId: string): Promise<string>` - Creates NIP-09 deletion event (kind 5)
- `declineAllInquiries(serviceId: string): Promise<void>` - Declines all active inquiries before deletion
- **Deletion Flow:**
  1. Check for active escrows → Show error modal, block deletion
  2. Check for active inquiries → Show warning modal, decline inquiries if confirmed
  3. Create NIP-09 deletion event (kind 5)
  4. Deletion event includes `['e', serviceId]` and `['k', '30402']` tags (NIP-09 standard)
  5. Publish deletion event to relays
  6. Clients filter out deleted services when querying (check for deletion events)
- Deletion is permanent (Nostr standard) - no soft delete

**UI Components:**
- Delete button in service detail page (owner only, always enabled)
- **Three Modal Types:**
  1. **Error Modal** (active escrows exist) - "Cannot Delete Service" with "See Tasks" button
  2. **Warning Modal** (active inquiries exist) - "Delete Service with Active Inquiries?" with "Decline Inquiries" button
  3. **Confirmation Modal** (no active escrows/inquiries) - Standard deletion confirmation
- Status toggle button/switch in service management
- Confirmation dialog for status changes

**Testing:**
- Status change tests
- **Deletion Tests:**
  - Delete button always enabled tests
  - Active escrows error modal tests (displays correctly, "See Tasks" navigation works)
  - Active inquiries warning modal tests (displays correctly, "Decline Inquiries" works)
  - Confirmation modal tests (displays when no active escrows/inquiries)
  - Decline all inquiries functionality tests
  - Deletion event creation tests
  - Deletion filtering tests (ensure deleted services don't appear in queries)
  - Navigation to active escrows tests
  - Error handling tests (network errors, relay failures)
- Notification tests

**Acceptance Criteria:**
- ✅ Status changes work
- ✅ Delete button is always enabled (not disabled based on state)
- ✅ Active escrows error modal displays correctly with "See Tasks" button
- ✅ "See Tasks" button navigates to service's active escrows correctly
- ✅ Active inquiries warning modal displays correctly with "Decline Inquiries" button
- ✅ "Decline Inquiries" button declines all active inquiries before deletion
- ✅ Confirmation modal displays when no active escrows/inquiries
- ✅ Deletion creates NIP-09 deletion events correctly
- ✅ Deleted services are filtered from queries
- ✅ Notifications sent

### Phase 6: Integration and Polish

**Objective:** Integrate services with existing features and polish the user experience.

#### 4.6.1. Integrate with Navigation

**Features:**
- Add "Services" to main navigation
- Add "My Services" to dashboard menu
- Add "List Service" to dashboard actions
- Update TopBar with services link

**Testing:**
- Navigation tests
- Link tests
- Menu tests

**Acceptance Criteria:**
- ✅ Navigation links work
- ✅ Menus updated correctly

#### 4.6.2. Integrate with Messaging

**Reuse from Task System:**
- ✅ DM sending pattern from `src/lib/utils/location/sendLocation.ts` `sendLocationToTaskee()` function
- ✅ Structured message pattern with tags (similar to location sharing DMs)
- ✅ Tag patterns from `src/lib/utils/constants/tags.ts` (create `TAG_PATTERNS.inquiry()`)

**Features:**
- "Contact Provider" button links to messaging
- Pre-populate message with service context
- Service inquiry message templates
- **Inquiry Form Integration:**
  - Inquiry form submissions create specialized DMs to service provider
  - DM uses `sendDirectMessage()` with inquiry tags (similar to location DMs)
  - DM includes structured inquiry data:
    - Form field responses (formatted)
    - User's message (if provided)
    - Uploaded photos (as `Attachment[]` with URLs)
    - Service reference link (NIP-19 service URL)
    - Service title and basic info
  - **DM Structure:**
    - Human-readable message text
    - Structured JSON data: `[INQUIRY_DATA:${JSON.stringify(inquiryData)}]`
    - Tags using `TAG_PATTERNS.inquiry()` pattern
  - Provider receives notification of new inquiry
  - Inquiry appears in provider's message inbox with special rendering (similar to location messages)
  - Provider can respond directly via messaging
  - Inquiry DMs create new thread or use existing thread with service provider

**Testing:**
- Messaging integration tests
- Template tests
- Inquiry form to DM conversion tests
- Photo attachment in DM tests
- Structured data parsing tests
- Notification tests
- Inbox rendering tests

**Acceptance Criteria:**
- ✅ Messaging links work
- ✅ Templates work
- ✅ Inquiry forms create DMs correctly with structured data
- ✅ Photos are attached to DMs correctly
- ✅ Providers receive inquiry notifications
- ✅ Inquiry DMs render correctly in inbox

#### 4.6.3. Create Service Inquiry Management (`src/routes/(protected)/dashboard/service/[serviceId]/inquiries/+page.svelte`)

**Reuse from Task System:**
- ✅ Bids panel pattern from `src/lib/components/bidding/BidsPanel.svelte`
- ✅ Bid card pattern from `src/lib/components/bidding/BidCard.svelte`
- ✅ Bid details drawer pattern from `src/lib/components/bidding/BidDetailsDrawer.svelte`
- ✅ Dashboard bids panel pattern from `src/lib/components/bidding/DashboardBidsPanel.svelte`

**Features:**
- List of inquiries received for a service (similar to bids received for a task)
- Inquiry cards displaying:
  - Tasker name and avatar
  - Inquiry submission date
  - Form responses summary
  - Message preview (if provided)
  - Photo thumbnails (if provided)
  - Service reference
- Inquiry details drawer:
  - Full inquiry form responses
  - Complete message
  - All photos in gallery
  - Service context
  - Actions: Respond, Send Proposal, Decline Inquiry
  - Proposal status (if proposal sent): Shows linked proposal with status
- Inquiry status indicators (new, responded, proposal_sent, proposal_accepted, declined)
- Filter inquiries by status
- Search inquiries
- Empty state when no inquiries

**Inquiry Actions:**
- **Respond:** Opens messaging thread with tasker
- **Send Proposal:** Opens proposal form (reuses bid form infrastructure) to send pricing proposal to tasker
- **Decline Inquiry:** Marks inquiry as declined, sends notification

**Proposal Flow (Reuses Bid Infrastructure):**
- **Proposal Creation:** When taskee clicks "Send Proposal" on an inquiry:
  - Opens proposal form (adapted from `BidForm.svelte` → `ServiceProposalForm.svelte`)
  - Form fields: Amount, payment type (FIXED/HOURLY), description, estimated duration, cover letter
  - Pre-populates with service context and inquiry data
  - **Proposal Event Structure:** Reuses `KINDS.BIDS` event kind with `type: 'proposal'` in content
  - **Proposal Tags (Human-Readable, NIP-99 Style):** Uses human-readable tags consistent with services:
    - `['d', proposalId]` - Unique proposal identifier (standard Nostr tag - unchanged)
    - `['service', serviceId]` - Service reference (human-readable, replaces task tag)
    - `['p', taskerPubkey]` - Recipient (tasker who inquired) (standard Nostr tag - unchanged)
    - `['status', 'pending']` - Proposal status (human-readable, replaces single-character status tag)
    - `['message_type', 'proposal']` - Message type: 'proposal' (human-readable, replaces single-character message type tag)
    - `['payment_type', paymentType]` - Payment type: 'FIXED' | 'HOURLY' (human-readable, replaces single-character payment type tag)
    - `['inquiry_id', inquiryId]` - Reference to the original inquiry (human-readable, optional)
  - **Proposal Content:** Same structure as bid content but with `type: 'proposal'` and service context
  - **Proposal Expiration:**
    - **Expiration Fields:** Proposals include `expirationDays` and `expirationHours` fields
    - **Expiration Calculation:** 
      - Expiration timestamp = `created_at + (expirationDays × 24 × 60 × 60) + (expirationHours × 60 × 60)`
      - Stored in proposal content JSON: `{ expirationTimestamp: number, expirationDays: number, expirationHours: number }`
    - **Default Expiration:** If not specified, default to 7 days (168 hours)
    - **Expiration Validation:**
      - Before accepting proposal: Check if `currentTimestamp > expirationTimestamp`
      - If expired: Show error "This proposal has expired. Please request a new proposal."
      - Block escrow creation if proposal expired
      - Show expiration countdown in proposal UI (e.g., "Expires in 3 days, 5 hours")
    - **Expiration Display:**
      - Show expiration date/time in proposal card
      - Show expiration warning if less than 24 hours remaining
      - Show "Expired" badge if past expiration
    - **Expiration Handling:**
      - Expired proposals remain visible but cannot be accepted
      - Taskee can send new proposal if previous one expired
      - Tasker can request new proposal if previous one expired
  - Sends encrypted DM to tasker (same as bid submission)
  - Updates inquiry status to "proposal_sent"

- **Proposal Management (Tasker Side):**
  - Tasker receives proposal in their inbox (similar to bid received)
  - Proposal appears in service detail page (reuses `BidsPanel.svelte` → `ServiceProposalsPanel.svelte`)
  - Proposal card shows: Amount, description, duration, taskee info
  - Proposal drawer shows full details (reuses `BidDetailsDrawer.svelte` → `ServiceProposalDetailsDrawer.svelte`)
  - Actions: Accept Proposal, Decline Proposal, Message Taskee

- **Proposal Acceptance:**
  - Reuses `BidAcceptanceForm.svelte` → `ServiceProposalAcceptanceForm.svelte`
  - Same escrow creation logic as bid acceptance
  - **CRITICAL: Check Latest Service Version Before Escrow**
    - Query latest service event by `d` tag (`service-${uniqueId}`) immediately before creating escrow
    - Compare `created_at` timestamp with service version displayed on page
    - If newer version exists (service was updated):
      - Show error message: "This service has been updated. Please review the latest version before proceeding."
      - Display error modal with single CTA button: "View Latest Version" (no other buttons)
      - Button navigates to latest service detail page (reloads page with latest data)
      - Prevent escrow creation until user views latest version
    - Verify service is still 'active' and not deleted
    - Verify pricing hasn't changed (compare with proposal time pricing)
    - Verify service location/details haven't changed
    - If service was deleted: Show error, prevent escrow creation
    - This prevents race conditions and ensures escrow uses current service data
  - **Delivery Time Calculation for Estimated Completion Date:**
    - Determine delivery time based on selected pricing option:
      - For fixed/hourly pricing: Use `pricing.deliveryTime` (if rush delivery selected, use `pricing.rushDelivery.deliveryTime`)
      - For tiered pricing: Use selected tier's `deliveryTime` (if rush delivery selected for tier, use tier's `rushDelivery.deliveryTime`)
    - **Use maximum (max) value from delivery time range** to calculate estimated completion date
      - Convert max value to hours: hour=1, day=24, week=168, month=720
      - Calculate estimated completion: `currentDate + maxDeliveryTimeHours`
      - Display estimated completion date in escrow summary: "Estimated completion: [date] (based on [max] [unit] delivery time)"
    - Example: If delivery time is "3-5 days", use 5 days (max) for completion date calculation
  - **Per-Distance Charge Calculation:**
    - If service has `tasker_location` type with per-distance charge configured:
      - Get Tasker's current location (from geolocation API or user's global location)
      - Calculate distance from Tasker's location to Taskee's service location (using Haversine formula or Google Maps Distance Matrix API)
      - Calculate travel fee: `distance × perDistanceChargeAmount`
      - Display travel fee breakdown: "Travel fee: $X.XX (Y km × $Z.ZZ/km)"
      - Add travel fee to base service price for total escrow amount
    - If Tasker's location unavailable: Use Tasker's global location with note
    - If Taskee's service location unavailable: Show error, cannot proceed
  - Add per-distance charge to escrow amount when funding escrow
  - Display total amount breakdown: Base price + Travel fee = Total
  - Display estimated completion date using maximum delivery time
  - Updates proposal status to "accepted" (reuses bid status update pattern)
  - Updates inquiry status to "accepted"

**Reuse from Bid System:**
- ✅ `BidForm.svelte` → Adapt to `ServiceProposalForm.svelte` (change labels, context)
- ✅ `BidsPanel.svelte` → Adapt to `ServiceProposalsPanel.svelte` (filter by service instead of task)
- ✅ `BidCard.svelte` → Adapt to `ServiceProposalCard.svelte` (service context)
- ✅ `BidDetailsDrawer.svelte` → Adapt to `ServiceProposalDetailsDrawer.svelte`
- ✅ `BidAcceptanceForm.svelte` → Adapt to `ServiceProposalAcceptanceForm.svelte`
- ✅ `getBidsForTask()` → Adapt to `getProposalsForService()` (filter by `service` tag instead of `task` tag)
- ✅ Bid event structure → Reuse with `type: 'proposal'` and human-readable service tags
- ✅ Bid status updates → Reuse for proposal status updates (using human-readable `status` tag)
- ✅ Escrow creation logic → Reuse completely (same validation, same flow)

**Tag Philosophy for Proposals:**
- **Human-Readable Tags:** Proposals use human-readable tags (e.g., `service`, `status`, `message_type`, `payment_type`) consistent with services and NIP-99 approach
- **Standard Tags:** Keep standard Nostr tags (`d`, `p`, `e`) unchanged for protocol compatibility
- **Consistency:** Aligns with services' use of human-readable extension tags (e.g., `location_types`, `pricing_type`)
- **Benefits:** More maintainable, easier to understand, better for debugging, consistent with services system

**Testing:**
- Inquiry list rendering tests
- Inquiry card tests
- Inquiry details drawer tests
- Inquiry actions tests
- Proposal form tests (reuse bid form test patterns)
- Proposal submission tests (reuse bid submission test patterns)
- Proposal management tests (reuse bid panel test patterns)
- Proposal acceptance tests (reuse bid acceptance test patterns)
- Contract creation from proposal tests
- Per-distance charge calculation tests
- **Race Condition Tests (Before Escrow):**
  - Latest service version check tests
  - Service update detection tests (created_at comparison)
  - Error modal display tests (when service updated)
  - "View Latest Version" button functionality tests
  - Escrow prevention tests (when service updated)
- **Proposal Expiration Tests:**
  - Expiration calculation tests (days + hours)
  - Expiration validation tests (block acceptance if expired)
  - Expiration display tests (countdown, warnings, expired badge)
  - Default expiration tests (7 days if not specified)
  - Expiration timestamp storage tests
  - Expired proposal handling tests (remain visible but not acceptible)

**Acceptance Criteria:**
- ✅ Inquiries list displays correctly
- ✅ Inquiry cards show all relevant information
- ✅ Inquiry details drawer works correctly
- ✅ Respond action opens messaging thread
- ✅ Send Proposal opens proposal form with inquiry context
- ✅ Proposal form reuses bid infrastructure correctly
- ✅ Proposals are sent as bid-like events with correct tags
- ✅ Proposals appear in tasker's inbox and service page
- ✅ Proposal acceptance creates contract correctly
- ✅ Per-distance charge is calculated and added to escrow
- ✅ Proposal status updates work correctly

#### 4.6.4. Implement Saved Services (NIP-51)

**Reuse from Task System:**
- ✅ NIP-51 Lists pattern (kind 10000-19999)
- ✅ Saved search pattern from `src/lib/nostr/savedSearch.ts` (lines 44-94)
- ✅ List management UI pattern from saved searches UI

**Features:**
- **Save Service:** Add "Save Service" button on service detail page
  - Creates NIP-51 list event (kind 10001) with service reference
  - Uses human-readable tags consistent with services
  - **Event Structure:**
    ```typescript
    kind: 10001, // NIP-51 list kind
    tags: [
      ['d', listId], // Unique list identifier
      ['name', 'My Saved Services'], // List name
      ['p', serviceProviderPubkey], // Service provider pubkey
      ['e', serviceEventId], // Service event ID reference
      ['k', '30402'], // Service event kind (30402 for active)
      ['a', '30402:${serviceProviderPubkey}:service-${uniqueId}'], // NIP-33 coordinate
      ['type', 'saved-service'] // List type
    ],
    content: JSON.stringify({
      serviceId: string,
      serviceTitle: string,
      savedAt: number
    })
    ```
- **Get Saved Services:** Query NIP-51 lists by author and type
  - Filter by `#type: ['saved-service']`
  - Extract service references from `e` tags or `a` tags
  - Load full service data from service events
- **Remove Saved Service:** Delete NIP-51 list event (NIP-09 deletion event)
- **My Saved Services Page:** (`src/routes/(protected)/dashboard/saved-services/+page.svelte`)
  - List of saved services
  - Service cards (reuse `ServiceCard.svelte`)
  - Remove from saved button
  - Empty state when no saved services
  - **Reuse Pattern:** Adapt saved searches UI pattern

**Implementation:**
- **Create `saveService()` Function (`src/lib/nostr/service.ts`):**
  - **Reuse Pattern:** Adapt `saveSearch()` from `src/lib/nostr/savedSearch.ts` (lines 44-94)
  - **One List Per User:** Query existing list event with `d` tag: `saved-services-${userPubkey}`
  - If list exists: Add service to existing list (append `e` tag and `a` tag, update content JSON)
  - If list doesn't exist: Create new NIP-51 list event with first service
  - Uses NIP-33 replaceable event pattern (same `d` tag, higher `created_at` for updates)
  - Publishes to relays
  - Returns saved service object
- **Create `getSavedServices()` Function (`src/lib/nostr/service.ts`):**
  - **Reuse Pattern:** Adapt `getSavedSearches()` from `src/lib/nostr/savedSearch.ts` (lines 99-126)
  - Query single list event with `d` tag: `saved-services-${userPubkey}` and `#type: ['saved-service']`
  - Extract service references from `e` tags or `a` tags (multiple services in one list)
  - Filters out deleted services (NIP-09 deletion events)
  - Loads full service data from service events
  - Returns array of saved services
- **Create `removeSavedService()` Function (`src/lib/nostr/service.ts`):**
  - Query existing list event with `d` tag: `saved-services-${userPubkey}`
  - Remove `e` tag and `a` tag for the service
  - Update content JSON to remove service from array
  - Create new list event with same `d` tag but higher `created_at` (NIP-33 replacement)
  - Publish updated list event

**UI Components:**
- **Save Service Button** (`ServiceDetailsView.svelte`):
  - Heart/bookmark icon button
  - Toggle state (saved/unsaved)
  - Shows toast on save/remove
- **My Saved Services Page:**
  - Grid/list layout with service cards
  - Remove from saved action
  - Empty state
  - **Reuse Pattern:** Adapt saved searches page layout

**Testing:**
- Save service tests (NIP-51 event creation)
- Get saved services tests (NIP-51 query and service loading)
- Remove saved service tests (NIP-09 deletion)
- Saved services page tests
- Save button toggle tests
- Deletion filtering tests (verify deleted services don't appear)

**Acceptance Criteria:**
- ✅ Save service creates NIP-51 list event correctly
- ✅ Saved services are retrieved and displayed correctly
- ✅ Remove saved service deletes NIP-51 list event correctly
- ✅ Saved services page displays correctly
- ✅ Save button toggles correctly
- ✅ Deleted services are filtered out

#### 4.6.5. Integrate with Profile

**Features:**
- Display user's services on profile
- Link to services from profile
- Service count on profile

**Testing:**
- Profile integration tests

**Acceptance Criteria:**
- ✅ Services display on profile
- ✅ Links work

#### 4.6.6. Add Translations

**Reuse from Task System:**
- ✅ Translation generation function pattern from `src/lib/nostr/task.ts` `generateTaskTranslations()` (lines 35-131)
- ✅ Translation service instance from `src/lib/services/translation.service.ts` (same instance used)
- ✅ Translation storage pattern (stored in Nostr event content JSON as `translations` property)
- ✅ Translation retrieval service pattern from `src/lib/services/task-translation.service.ts`
- ✅ Translation display component pattern from `TranslatableTask.svelte`

**Implementation:**

**1. Create `generateServiceTranslations()` Function (`src/lib/nostr/service.ts`):**

**Reuse Pattern:** Adapt `generateTaskTranslations()` function (lines 35-131 from `src/lib/nostr/task.ts`)

```typescript
async function generateServiceTranslations(
  serviceData: ServiceBody
): Promise<ServiceTranslations | undefined> {
  // Only generate translations if translation service is available
  if (!translationService.isAvailable()) {
    console.warn('Translation service not available, skipping translations');
    return undefined;
  }

  try {
    // Detect source language from the combined text (title + description)
    const combinedText = `${serviceData.title} ${serviceData.description}`.trim();
    
    if (!combinedText) {
      return undefined;
    }
    
    const detectedLanguage = await translationService.detectLanguage(combinedText);
    
    // Determine source language - if detection fails, default to 'en'
    // but we'll still translate to ensure both languages are available
    const sourceLanguage = (detectedLanguage && SUPPORTED_LANGUAGES.includes(detectedLanguage as any)) 
      ? detectedLanguage 
      : 'en';
    
    // Always translate to the other language to ensure we have translations in both
    const targetLanguages = SUPPORTED_LANGUAGES.filter(lang => lang !== sourceLanguage);

    // Translate all text fields to all target languages in parallel
    const translationPromises = targetLanguages.map(async (targetLang) => {
      // Build array of all translation promises
      const allPromises: Promise<any>[] = [
        translationService.translate(serviceData.title, targetLang, sourceLanguage),
        translationService.translate(serviceData.description, targetLang, sourceLanguage)
      ];

      // Translate tiers (if present) - name, description, features, delivery times
      const tierPromises = serviceData.pricing.tiers?.flatMap(tier => {
        const promises = [
          translationService.translate(tier.name, targetLang, sourceLanguage),
          translationService.translate(tier.description, targetLang, sourceLanguage),
          ...tier.features.map(feature => 
            translationService.translate(feature, targetLang, sourceLanguage)
          )
        ];
        if (tier.deliveryTime?.display) {
          promises.push(translationService.translate(tier.deliveryTime.display, targetLang, sourceLanguage));
        }
        if (tier.rushDelivery?.deliveryTime?.display) {
          promises.push(translationService.translate(tier.rushDelivery.deliveryTime.display, targetLang, sourceLanguage));
        }
        return promises;
      }) || [];

      // Translate add-ons (if present) - name and description
      const addOnPromises = serviceData.pricing.addOns?.flatMap(addOn => [
        translationService.translate(addOn.name, targetLang, sourceLanguage),
        ...(addOn.description ? [translationService.translate(addOn.description, targetLang, sourceLanguage)] : [])
      ]) || [];

      // Translate FAQs (if present) - question and answer
      const faqPromises = serviceData.faqs?.flatMap(faq => [
        translationService.translate(faq.question, targetLang, sourceLanguage),
        translationService.translate(faq.answer, targetLang, sourceLanguage)
      ]) || [];

      // Translate delivery time (if present)
      if (serviceData.pricing.deliveryTime?.display) {
        allPromises.push(translationService.translate(serviceData.pricing.deliveryTime.display, targetLang, sourceLanguage));
      }

      // Translate rush delivery time (if present)
      if (serviceData.pricing.rushDelivery?.deliveryTime?.display) {
        allPromises.push(translationService.translate(serviceData.pricing.rushDelivery.deliveryTime.display, targetLang, sourceLanguage));
      }

      // Execute all translations in parallel
      const allResults = await Promise.all([
        ...allPromises,
        ...tierPromises,
        ...addOnPromises,
        ...faqPromises
      ]);

      // Extract basic translations
      const [titleResult, descResult] = allResults.slice(0, 2);
      let resultIndex = 2;

      // Check if basic translations failed
      if ('code' in titleResult || 'code' in descResult) {
        console.warn(`Translation failed for ${targetLang}:`, 
          'code' in titleResult ? titleResult.message : descResult.message);
        return null;
      }

      // Process tier translations
      const translatedTiers = serviceData.pricing.tiers?.map(tier => {
        const nameResult = allResults[resultIndex++];
        const descResult = allResults[resultIndex++];
        const featureResults = tier.features.map(() => allResults[resultIndex++]);
        const deliveryTimeResult = tier.deliveryTime?.display ? allResults[resultIndex++] : null;
        const rushDeliveryTimeResult = tier.rushDelivery?.deliveryTime?.display ? allResults[resultIndex++] : null;

        return {
          id: tier.id,
          name: 'translatedText' in nameResult ? nameResult.translatedText : tier.name,
          description: 'translatedText' in descResult ? descResult.translatedText : tier.description,
          features: featureResults.map((r, i) => 
            'translatedText' in r ? r.translatedText : tier.features[i]
          ),
          ...(tier.deliveryTime ? {
            deliveryTime: {
              display: deliveryTimeResult && 'translatedText' in deliveryTimeResult 
                ? deliveryTimeResult.translatedText 
                : tier.deliveryTime.display
            }
          } : {}),
          ...(tier.rushDelivery?.deliveryTime ? {
            rushDelivery: {
              deliveryTime: {
                display: rushDeliveryTimeResult && 'translatedText' in rushDeliveryTimeResult
                  ? rushDeliveryTimeResult.translatedText
                  : tier.rushDelivery.deliveryTime.display
              }
            }
          } : {})
        };
      });

      // Process add-on translations
      const translatedAddOns = serviceData.pricing.addOns?.map(addOn => {
        const nameResult = allResults[resultIndex++];
        const descResult = addOn.description ? allResults[resultIndex++] : null;

        return {
          id: addOn.id,
          name: 'translatedText' in nameResult ? nameResult.translatedText : addOn.name,
          ...(addOn.description ? {
            description: descResult && 'translatedText' in descResult 
              ? descResult.translatedText 
              : addOn.description
          } : {})
        };
      });

      // Process FAQ translations
      const translatedFaqs = serviceData.faqs?.map(faq => {
        const questionResult = allResults[resultIndex++];
        const answerResult = allResults[resultIndex++];

        return {
          id: faq.id,
          question: 'translatedText' in questionResult ? questionResult.translatedText : faq.question,
          answer: 'translatedText' in answerResult ? answerResult.translatedText : faq.answer
        };
      });

      // Extract delivery time translations
      const deliveryTimeResult = serviceData.pricing.deliveryTime?.display 
        ? allResults[resultIndex++] 
        : null;
      const rushDeliveryTimeResult = serviceData.pricing.rushDelivery?.deliveryTime?.display
        ? allResults[resultIndex++]
        : null;

      return {
        language: targetLang,
        title: titleResult.translatedText,
        description: descResult.translatedText,
        ...(translatedTiers && translatedTiers.length > 0 ? { tiers: translatedTiers } : {}),
        ...(translatedAddOns && translatedAddOns.length > 0 ? { addOns: translatedAddOns } : {}),
        ...(translatedFaqs && translatedFaqs.length > 0 ? { faqs: translatedFaqs } : {}),
        ...(deliveryTimeResult && 'translatedText' in deliveryTimeResult ? {
          deliveryTime: {
            display: deliveryTimeResult.translatedText
          }
        } : {}),
        ...(rushDeliveryTimeResult && 'translatedText' in rushDeliveryTimeResult ? {
          rushDelivery: {
            deliveryTime: {
              display: rushDeliveryTimeResult.translatedText
            }
          }
        } : {})
      };
    });

    const results = await Promise.all(translationPromises);
    
    // Build translations object, filtering out failed translations
    const translations: ServiceTranslations['translations'] = {};
    results.forEach(result => {
      if (result) {
        translations[result.language] = {
          title: result.title,
          description: result.description,
          ...(result.tiers ? { tiers: result.tiers } : {}),
          ...(result.addOns ? { addOns: result.addOns } : {}),
          ...(result.faqs ? { faqs: result.faqs } : {}),
          ...(result.deliveryTime ? { deliveryTime: result.deliveryTime } : {}),
          ...(result.rushDelivery ? { rushDelivery: result.rushDelivery } : {})
        };
      }
    });

    // If we couldn't detect the language or translation failed, try the reverse
    // This ensures we always have translations available in both languages
    if ((!detectedLanguage || !SUPPORTED_LANGUAGES.includes(detectedLanguage as any)) && 
      Object.keys(translations).length === 0) {
      // Try translating assuming the text is in Spanish
      const reverseSource = sourceLanguage === 'en' ? 'es' : 'en';
      const reverseTarget = reverseSource === 'en' ? 'es' : 'en';
      
      // For reverse translation, use the same comprehensive translation logic
      // Recursively call the translation logic for reverse language pair
      // (In practice, this would reuse the same translation logic above)
      // For brevity in this example, we show the pattern - full implementation would
      // translate all fields (tiers, addOns, faqs, delivery times) same as above
      const [reverseTitleResult, reverseDescResult] = await Promise.all([
        translationService.translate(serviceData.title, reverseTarget, reverseSource),
        translationService.translate(serviceData.description, reverseTarget, reverseSource)
      ]);
      
      if (!('code' in reverseTitleResult) && !('code' in reverseDescResult)) {
        // Build full translation object with all fields
        // Note: Full implementation should translate tiers, addOns, faqs, delivery times
        // using the same comprehensive logic as the main translation above
        translations[reverseTarget] = {
          title: reverseTitleResult.translatedText,
          description: reverseDescResult.translatedText
          // Additional fields (tiers, addOns, faqs, delivery times) would be
          // translated here using the same pattern as the main translation logic
        };
        // Update source language to match the successful translation
        return {
          sourceLanguage: reverseSource,
          translations
        };
      }
    }

    return {
      sourceLanguage,
      translations
    };
  } catch (error) {
    console.error('Error generating service translations:', error);
    return undefined;
  }
}
```

**Key Points:**
- **Comprehensive translation:** Translates all user-provided text fields:
  - `title` and `description`
  - `tiers` (name, description, features array)
  - `addOns` (name, description)
  - `faqs` (question, answer)
  - `deliveryTime.display` (human-readable delivery time string)
  - `rushDelivery.deliveryTime.display` (human-readable rush delivery time string)
- **Translation timing:** Called BEFORE creating/updating service event (same as tasks)
- **Language detection:** Uses combined title + description text
- **Fallback handling:** Tries reverse translation if detection fails
- **Error handling:** Returns `undefined` if translation service unavailable or errors occur
- **Batch translation:** Translates all fields in parallel for efficiency

**2. Integration in `listService()` Function:**

**Reuse Pattern:** Same as `createTask()` (lines 228-239 from `src/lib/nostr/task.ts`)

```typescript
// Generate translations for all supported languages (BEFORE creating event)
const translations = await generateServiceTranslations(serviceData);

// Add translations to service data (if available)
const serviceDataWithMeta = {
  ...serviceData,
  creator,
  createdAt: Math.floor(Date.now() / 1000),
  uniqueId,
  ...(translations && { translations }) // Only include if translations were generated
}; 
```

**3. Integration in `updateService()` Function:**

**Reuse Pattern:** Same as `updateTask()` (lines 381-388 from `src/lib/nostr/task.ts`)

```typescript
// Check if title or description changed (needs retranslation)
const needsRetranslation = 
  updates.title !== undefined || 
  updates.description !== undefined;

// Generate new translations if content changed
let translations = originalServiceData.translations;
if (needsRetranslation) {
  const serviceDataForTranslation = {
    ...originalServiceData,
    ...updates
  };
  const newTranslations = await generateServiceTranslations(serviceDataForTranslation);
  if (newTranslations) {
    translations = newTranslations;
  }
}

// Merge updates with original service data
const updatedServiceData = {
  ...originalServiceData,
  ...updates,
  uniqueId, // Keep the same uniqueId
  updatedAt: Math.floor(Date.now() / 1000),
  ...(translations && { translations }) // Include updated translations
};
```

**4. Translation Storage Structure:**

**Reuse Pattern:** Same structure as `TaskTranslations` (from `src/lib/types/task.d.ts` lines 266-274)

```typescript
// Translations stored in service event content JSON
export interface ServiceTranslations {
  sourceLanguage: string; // Language of the original content ('en' | 'es')
  translations: {
    [language: string]: { // 'en' | 'es'
      title: string;
      description: string;
      tiers?: Array<{
        id: string;
        name: string;
        description: string;
        features: string[]; // Translated feature list
        deliveryTime?: {
          display: string; // Translated delivery time display string
        };
        rushDelivery?: {
          deliveryTime: {
            display: string; // Translated rush delivery time display string
          };
        };
      }>;
      addOns?: Array<{
        id: string;
        name: string;
        description: string;
      }>;
      faqs?: Array<{
        id: string;
        question: string;
        answer: string;
      }>;
      deliveryTime?: {
        display: string; // Translated delivery time display string
      };
      rushDelivery?: {
        deliveryTime: {
          display: string; // Translated rush delivery time display string
        };
      };
    };
  };
}
```

**Note:** All user-provided text fields are translated, including:
- `title` and `description`
- `tiers` (name, description, features array)
- `addOns` (name, description)
- `faqs` (question, answer)
- `deliveryTime.display` (human-readable delivery time string)
- `rushDelivery.deliveryTime.display` (human-readable rush delivery time string)

Non-translatable fields: `portfolio` (images/files), `skills` (tags), `categories` (IDs), `locationDetails` (coordinates/addresses), pricing amounts (numbers).

**5. Define `ServiceTranslation` Interface (`src/lib/types/service.d.ts`):**

```typescript
// ServiceTranslation interface (returned by ServiceTranslationService)
export interface ServiceTranslation {
  serviceId: string;
  originalTitle: string;
  translatedTitle: string;
  originalDescription: string;
  translatedDescription: string;
  translatedTiers?: Array<{
    id: string;
    name: string;
    description: string;
    features: string[];
    deliveryTime?: { display: string };
    rushDelivery?: { deliveryTime: { display: string } };
  }>;
  translatedAddOns?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  translatedFaqs?: Array<{
    id: string;
    question: string;
    answer: string;
  }>;
  translatedDeliveryTime?: { display: string };
  translatedRushDelivery?: { deliveryTime: { display: string } };
  targetLanguage: string;
  sourceLanguage: string | undefined;
  timestamp: number;
}
```

**6. Create `ServiceTranslationService` (`src/lib/services/service-translation.service.ts`):**

**Reuse Pattern:** Adapt from `TaskTranslationService` (`src/lib/services/task-translation.service.ts`)

```typescript
import type { Service, ServiceTranslation } from '$lib/types/service';

/**
 * ServiceTranslationService - Only reads translations stored in Nostr events
 * NO on-demand translations - all translations are done when listing the service
 */
export class ServiceTranslationService {
  /**
   * Get stored translation of a service (no API calls)
   * Only returns translations that are already saved in the Nostr event
   * Returns all translated fields: title, description, tiers, addOns, faqs, delivery times
   */
  getStoredTranslation(service: Service, targetLanguage: string): ServiceTranslation | null {
    if (!service?.id || !service?.title || !service?.description) {
      return null;
    }

    // Only use translations stored in the Nostr event
    if (service.translations?.translations && service.translations.translations[targetLanguage]) {
      const storedTranslation = service.translations.translations[targetLanguage];
      const sourceLanguage = service.translations.sourceLanguage;
      
      // Return translation from Nostr event - no API calls
      // Includes all translated fields: title, description, tiers, addOns, faqs, delivery times
      return {
        serviceId: service.id,
        originalTitle: service.title,
        translatedTitle: storedTranslation.title,
        originalDescription: service.description,
        translatedDescription: storedTranslation.description,
        translatedTiers: storedTranslation.tiers,
        translatedAddOns: storedTranslation.addOns,
        translatedFaqs: storedTranslation.faqs,
        translatedDeliveryTime: storedTranslation.deliveryTime,
        translatedRushDelivery: storedTranslation.rushDelivery,
        targetLanguage,
        sourceLanguage,
        timestamp: Date.now()
      };
    }

    // If no stored translation, return null
    // (old services without translations will show original)
    return null;
  }
}

export const serviceTranslationService = new ServiceTranslationService();
```

**6. Create `TranslatableService.svelte` Component:**

**Reuse Pattern:** Adapt from `TranslatableTask.svelte` (`src/lib/components/task/TranslatableTask.svelte`)

- **Props:** `service: Service`, `showOriginal?: boolean`
- **Logic:** 
  - Get user's language preference from store
  - Use `serviceTranslationService.getStoredTranslation()` to get translation
  - Display translated content if available, otherwise show original
  - Optional toggle to show original content
- **Display:** Shows all translated fields (`title`, `description`, `tiers`, `addOns`, `faqs`, `deliveryTime`, `rushDelivery`) based on user's language preference

**7. UI Translation Files (i18n):**

**Reuse Pattern:** Same structure as task translation files

Create translation files for all service-related UI text:
- `locales/en/dashboard/services/create.json` - Service creation form labels
- `locales/en/dashboard/services/browse.json` - Service browse/search page
- `locales/en/dashboard/services/detail.json` - Service detail page
- `locales/en/dashboard/services/my-services.json` - My services page
- `locales/es/dashboard/services/create.json` - Spanish translations
- `locales/es/dashboard/services/browse.json` - Spanish translations
- `locales/es/dashboard/services/detail.json` - Spanish translations
- `locales/es/dashboard/services/my-services.json` - Spanish translations

**Translation Loading:** Load route-specific translations (same pattern as tasks)

**Testing:**
- Translation generation tests (same as task translation tests)
- Translation storage tests (verify translations stored in event content)
- Translation retrieval tests (verify ServiceTranslationService reads correctly)
- Translation display tests (verify TranslatableService component works)
- Translation loading tests (verify UI translations load)
- Language switching tests (verify translations switch correctly)
- Update retranslation tests (verify translations regenerate on any translatable field change)
- Tier translation tests (verify tier names, descriptions, features are translated)
- Add-on translation tests (verify add-on names and descriptions are translated)
- FAQ translation tests (verify FAQ questions and answers are translated)
- Delivery time translation tests (verify delivery time display strings are translated)

**Acceptance Criteria:**
- ✅ Service content is auto-translated at listing time (title and description only)
- ✅ Translations are stored in Nostr event content JSON correctly
- ✅ Translations are retrieved from stored events (no API calls)
- ✅ Translations are displayed correctly based on user language preference
- ✅ All UI text is translated via i18n files
- ✅ Translations regenerate on update if title/description changed
- ✅ Language switching works correctly
- ✅ Falls back to original content if translation not available

#### 4.6.7. Add SEO Optimization

**Features:**
- Service detail page SEO
- Service browse page SEO
- Open Graph tags
- Twitter Card tags
- Structured data (JSON-LD)

**Testing:**
- SEO tag tests
- Structured data tests

**Acceptance Criteria:**
- ✅ SEO tags are correct
- ✅ Structured data valid
- ✅ Sitemap includes services

### Phase 7: Testing and Quality Assurance

**Objective:** Comprehensive testing to ensure quality and reliability.

#### 4.7.1. Unit Tests

**Coverage Areas:**
- Service type definitions
- Service enum values
- Service store functions
- Service listing/update logic
- Service search/filter logic
- Tag generation (NIP-99 compatible and BitTasker extensions, including delivery time tags)
- Delivery time range conversion and validation (min/max validation, using max value for filtering and escrow calculation)
- FAQ management logic
- Translation generation
- NIP-99 tag compatibility validation

**Test Files:**
- `src/lib/tests/nostr/service.test.ts`
- `src/lib/tests/nostr/findServices.test.ts`
- `src/lib/tests/stores/service.store.test.ts`
- `src/lib/tests/utils/serviceHelpers.test.ts`

**Testing Tools:**
- Vitest for unit tests
- Mock Nostr relays
- Mock file uploads
- Mock translations

**Acceptance Criteria:**
- ✅ Unit test coverage > 80%
- ✅ All critical functions tested
- ✅ Edge cases covered

#### 4.7.2. Component Tests

**Coverage Areas:**
- Service form components (including ServiceTiers, ServiceFAQs, ServicePricing with delivery time)
- Service card component (including delivery time badge display)
- Service detail view (including FAQ section, delivery time display)
- Service search filters (including delivery time filter)
- Service list components

**Test Files:**
- `src/lib/tests/components/service/*.test.ts`

**Testing Tools:**
- @testing-library/svelte
- Component rendering tests
- User interaction tests
- Accessibility tests

**Acceptance Criteria:**
- ✅ Components render correctly
- ✅ User interactions work
- ✅ Accessibility standards met

#### 4.7.3. Integration Tests

**Coverage Areas:**
- Service listing flow
- Service search flow
- Service detail page load
- Service edit flow
- Service status changes

**Test Files:**
- `src/lib/tests/integration/services.test.ts`

**Testing Tools:**
- Playwright or Cypress
- End-to-end flow tests
- Cross-browser tests

**Acceptance Criteria:**
- ✅ All flows work end-to-end
- ✅ Cross-browser compatibility
- ✅ Error scenarios handled

#### 4.7.4. Visual Regression Tests

**Coverage Areas:**
- Service listing form
- Service browse page
- Service detail page
- Service cards
- Mobile responsive layouts

**Testing Tools:**
- Storybook visual tests
- Screenshot comparison
- Browser testing in Cursor

**Acceptance Criteria:**
- ✅ Visual consistency maintained
- ✅ Responsive design works
- ✅ Dark/light mode works

#### 4.7.5. Performance Tests

**Coverage Areas:**
- Service search performance
- Service list rendering
- Image loading
- Form submission
- Page load times

**Testing Tools:**
- Performance monitoring
- Lighthouse audits
- Load testing

**Acceptance Criteria:**
- ✅ Page load < 5 seconds
- ✅ Search results < 5 seconds
- ✅ Smooth scrolling
- ✅ Optimized images

#### 4.7.6. Accessibility Tests

**Coverage Areas:**
- Keyboard navigation
- Screen reader compatibility
- ARIA labels
- Color contrast
- Focus management

**Testing Tools:**
- axe-core
- Lighthouse accessibility audit
- Manual testing

**Acceptance Criteria:**
- ✅ WCAG 2.1 AA compliance
- ✅ Keyboard navigation works
- ✅ Screen readers work
- ✅ Color contrast meets standards

### Phase 8: Documentation and Deployment

**Objective:** Document the feature and prepare for deployment.

#### 4.8.1. Code Documentation

**Features:**
- JSDoc comments for all functions
- Component prop documentation
- Type documentation
- Architecture documentation

**Acceptance Criteria:**
- ✅ All functions documented
- ✅ Components documented
- ✅ Types documented

#### 4.8.2. User Documentation

**Features:**
- How to list a service
- How to set up location types and per-distance charges
- How to set up service tiers
- How to set delivery times for services and tiers
- How to add simple add-ons/extras
- How to add FAQs to service listings
- How to build inquiry forms
- How to edit a service
- How to search for services (including delivery time filtering)
- How to contact service providers
- How to submit service inquiries
- FAQ section

**Acceptance Criteria:**
- ✅ Documentation complete
- ✅ Examples provided
- ✅ FAQ answers common questions

#### 4.8.3. Deployment Checklist

**Pre-Deployment:**
- [ ] All tests passing
- [ ] TypeScript compilation successful
- [ ] Linting passes
- [ ] Visual regression tests pass
- [ ] Performance benchmarks met
- [ ] Accessibility audit passes
- [ ] Translations complete
- [ ] SEO tags verified
- [ ] Error handling tested
- [ ] Browser compatibility verified

**Deployment:**
- [ ] Deploy to staging
- [ ] Smoke tests on staging
- [ ] User acceptance testing
- [ ] Deploy to production
- [ ] Monitor error rates
- [ ] Monitor performance metrics

**Post-Deployment:**
- [ ] Monitor user feedback
- [ ] Track service listing metrics
- [ ] Monitor search performance
- [ ] Collect bug reports
- [ ] Plan improvements

## 5. Testing Strategy Integration

### 5.1. Test-Driven Development Approach

**For Each Phase:**
1. Write tests first (when possible)
2. Implement functionality
3. Run tests
4. Refactor if needed
5. Verify tests pass

### 5.2. Testing at Each Phase

**Phase 1 (Foundation):**
- Unit tests for types and enums
- Store tests
- Type validation tests

**Phase 2 (Service Creation):**
- Component tests for form steps
- Integration tests for creation flow
- Visual regression tests for forms
- Browser testing for UX

**Phase 3 (Service Discovery):**
- Unit tests for search logic
- Integration tests for search flow
- Performance tests for search
- Browser testing for search UI

**Phase 4 (Service Detail Pages):**
- Component tests for detail views
- Integration tests for page loads
- SEO tests
- Browser testing for detail pages

**Phase 5 (Service Management):**
- Integration tests for management flows
- Permission tests
- State management tests

**Phase 6 (Integration):**
- End-to-end tests
- Integration tests with other features
- Cross-feature compatibility tests

**Phase 7 (Testing):**
- Comprehensive test suite
- Coverage reports
- Performance benchmarks
- Accessibility audits

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
- `location_display_name`: Human-readable location display name for display purposes (BitTasker extension)
- `service_radius`: Service radius in km/miles (if tasker_location) - distance from Taskee's service location that they're willing to travel (BitTasker extension)
- `per_distance_charge`: Per-distance charge array `[amount, currency, unit]` (BitTasker extension)
- `pricing_type`: Pricing type - `'fixed' | 'hourly' | 'tiered' | 'inquiry_required'` (BitTasker extension)
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
- **Service Analytics**: Provider dashboard with inquiry metrics (inquiries received, inquiries responded to)
- **Featured Services**: Paid promotion for services
- **Service Recommendations**: AI-powered service matching
- **Service Templates**: Pre-built service templates
- **Service Scheduling**: Integrated calendar booking

### 8.2. Integration Opportunities

- **Task Integration**: Link services to task categories
- **Bidding Integration**: Allow service providers to bid on tasks
- **Wallet Integration**: Direct payment for services
- **Escrow Integration**: Secure service payments
- **Notification Integration**: Service-related notifications

## 9. NIP-99 Integration Summary

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
- ✅ Multiple location types with per-distance charges
- ✅ Service tiers and simple add-ons
- ✅ Inquiry form system
- ✅ Extended tag set for BitTasker-specific features

**Additional NIP Integrations:**
- ✅ **NIP-19:** Bech32-encoded service URLs (`nservice1...`) for sharing
- ✅ **NIP-50:** Full-text search for service discovery
- ✅ **NIP-51:** Saved services/favorites functionality
- ✅ **File Upload Service:** Direct file uploads for portfolio items and inquiry photos (same as task attachments)

### 9.2. Interoperability Benefits

**For NIP-99 Clients:**
- ✅ **Full Discovery:** Can discover services through standard `kinds: [30402]` queries
- ✅ **Complete Basic Info:** Can read all standard NIP-99 tags (title, summary, location, price, status, published_at)
- ✅ **Standard Filtering:** Can filter by standard NIP-99 tags (location, price range, status)
- ✅ **Tiered Pricing:** NIP-99 `price` tag uses lowest tier price for discovery, `min_price`/`max_price` tags for range filtering
- ✅ **Interoperability:** Services appear in standard NIP-99 classified listing queries
- ⚠️ **Advanced Features:** Extension tags and advanced features in content JSON are ignored (gracefully)

**For BitTasker Clients:**
- ✅ **Full Discovery:** Can discover services through standard NIP-99 queries or extended filters
- ✅ **Complete Basic Info:** Can read all standard NIP-99 tags
- ✅ **Advanced Features:** Full access to tiers, add-ons, inquiry forms via content JSON
- ✅ **Extended Filtering:** Can filter by extension tags (categories, skills, location_types, pricing_type)
- ✅ **Complete Functionality:** Multiple location types, per-distance charges, service management

**For Developers:**
- Clear separation between NIP-99 compatible and extended features
- Human-readable tags make code self-documenting and easier to maintain
- Easy to add NIP-99 client support
- Human-readable tags align with NIP-99's philosophy, making this a potential extension candidate
- Maintains consistency with existing task system (though task system uses single-char tags)
- Extensible architecture for future enhancements
- Easier debugging and troubleshooting with descriptive tag names


