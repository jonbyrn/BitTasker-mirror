# Service Creation & Display - Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to implement service creation and display functionality in BitTasker. Services allow Taskees (service providers) to create, manage, and showcase their offerings with pricing, descriptions, media, and other elements. The implementation follows existing project patterns, uses Nostr for decentralized storage, and maintains consistency with the task creation flow.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Model Specification](#data-model-specification)
3. [Nostr Integration Strategy](#nostr-integration-strategy)
4. [Component Architecture](#component-architecture)
5. [State Management](#state-management)
6. [Implementation Phases](#implementation-phases)
7. [Technical Decisions](#technical-decisions)
8. [Testing Strategy](#testing-strategy)
9. [Rollout Plan](#rollout-plan)

---

## Architecture Overview

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Service Creation Flow                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Basics     │───▶│   Pricing    │───▶│    Media     │  │
│  │   Step       │    │    Step      │    │    Step      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │            │
│         └───────────────────┴───────────────────┘            │
│                            │                                 │
│                   ┌──────────────┐                          │
│                   │   Details    │                          │
│                   │    Step      │                          │
│                   └──────────────┘                          │
│                            │                                 │
│                   ┌──────────────┐                          │
│                   │   Review     │                          │
│                   │    Step      │                          │
│                   └──────────────┘                          │
│                            │                                 │
│                   ┌──────────────┐                          │
│                   │   Publish    │                          │
│                   │  to Nostr    │                          │
│                   └──────────────┘                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Service Display Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Profile    │───▶│   Service    │───▶│   Service    │  │
│  │   Page       │    │    Cards     │    │    Detail    │  │
│  │  (/npub/...) │    │   (List)     │    │    Page      │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Service Creation**
   - User fills multi-step form
   - Data stored in `service.store.ts` (localStorage draft)
   - On publish: Create Nostr event → Publish to relays → Update local state

2. **Service Retrieval**
   - Query Nostr relays for service events
   - Filter by author (npub) or search criteria
   - Parse and display services

3. **Service Updates**
   - Create new Nostr event with updated data
   - Link to original via event tags
   - Clients show latest version

4. **Service Deletion**
   - Create kind 5 (deletion) event
   - Clients filter out deleted services

---

## Data Model Specification

### Extended Service Interface

**File**: `src/lib/types/service.d.ts`

```typescript
import type { Attachment } from './task';
import type { Location } from './task';
import type { Category } from './task';

/**
 * Service pricing model
 */
export enum ServicePricingType {
  FIXED = 'FIXED',
  HOURLY = 'HOURLY',
  PACKAGE = 'PACKAGE', // Multiple tiers (basic/standard/premium)
  CUSTOM = 'CUSTOM' // Custom quote required
}

/**
 * Service pricing structure
 */
export interface ServicePricing {
  type: ServicePricingType;
  currency: string; // USD or Sats
  
  // For FIXED pricing
  amount?: number;
  
  // For HOURLY pricing
  hourlyRate?: number;
  minimumHours?: number;
  
  // For PACKAGE pricing
  packages?: ServicePackage[];
  
  // For CUSTOM pricing
  priceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  
  // Discount/promotion support
  discount?: {
    percentage: number;
    validUntil?: string; // ISO date
    description?: string;
  };
}

/**
 * Service package tier
 */
export interface ServicePackage {
  id: string;
  name: string; // e.g., "Basic", "Standard", "Premium"
  description: string;
  price: number;
  currency: string;
  features: string[]; // List of included features
  duration?: number; // Estimated duration in minutes
  popular?: boolean; // Mark as popular/recommended
}

/**
 * Service availability settings
 */
export interface ServiceAvailability {
  // Location type
  locationType: 'physical' | 'remote' | 'both';
  
  // Physical location (if applicable)
  serviceArea?: {
    address?: string;
    coordinates?: [number, number]; // [longitude, latitude]
    radius?: number; // Service radius in km
  };
  
  // Remote availability
  remoteAvailable?: boolean;
  remoteDetails?: string; // Description of remote service delivery
  
  // Booking settings
  requiresBooking?: boolean;
  bookingAdvanceNotice?: number; // Hours of advance notice required
  maxBookingsPerDay?: number;
  availableDays?: number[]; // 0-6 (Sunday-Saturday)
  availableHours?: {
    start: string; // HH:mm format
    end: string; // HH:mm format
  };
}

/**
 * Service status
 */
export enum ServiceStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED'
}

/**
 * Comprehensive Service interface
 */
export interface Service {
  // Identity
  id: string; // Unique service ID (generated)
  eventId?: string; // Nostr event ID
  npub: string; // Service provider's npub
  
  // Basic information
  title: string;
  description: string;
  shortDescription?: string; // For cards/previews
  
  // Categorization
  category: Category;
  subcategory?: string;
  skills: string[]; // Required or related skills
  tags: string[]; // Searchable keywords
  
  // Pricing
  pricing: ServicePricing;
  
  // Duration
  estimatedDuration?: number; // Minutes
  estimatedDurationRange?: {
    min: number;
    max: number;
  };
  
  // Media
  media: {
    thumbnail?: Attachment; // Primary image/video for cards
    images: Attachment[]; // Photo gallery
    videos: Attachment[]; // Video demonstrations
  };
  
  // Location & Availability
  availability: ServiceAvailability;
  
  // Additional details
  customizationOptions?: string[]; // What can be customized
  termsAndConditions?: string;
  requirements?: string[]; // What client needs to provide
  
  // Metadata
  status: ServiceStatus;
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
  publishedAt?: number; // When service was first published
  
  // Note: Analytics (inquiryCount, bookingCount) are computed from Nostr events
  // using getServiceAnalytics() helper function, not stored as fields
  
  // Translations
  translations?: ServiceTranslations;
  
  // Version tracking
  version?: number; // Increment on updates
  previousEventId?: string; // Link to previous version
}

/**
 * Service translations structure
 */
export interface ServiceTranslations {
  sourceLanguage: string;
  translations: {
    [language: string]: {
      title: string;
      description: string;
      shortDescription?: string;
    };
  };
}

/**
 * Service creation/update body
 */
export interface ServiceBody {
  title: string;
  description: string;
  shortDescription?: string;
  category: Category;
  subcategory?: string;
  skills: string[];
  tags: string[];
  pricing: ServicePricing;
  estimatedDuration?: number;
  estimatedDurationRange?: {
    min: number;
    max: number;
  };
  media: {
    thumbnail?: Attachment;
    images: Attachment[];
    videos: Attachment[];
  };
  availability: ServiceAvailability;
  customizationOptions?: string[];
  termsAndConditions?: string;
  requirements?: string[];
  status?: ServiceStatus;
}

/**
 * Service search/filter parameters
 */
export interface SearchServicesParams {
  search?: string; // Text search
  category?: string;
  skills?: string[];
  locationType?: 'physical' | 'remote' | 'both';
  coordinates?: [number, number]; // For location-based search
  radius?: number; // Search radius in km
  priceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  pricingType?: ServicePricingType;
  npub?: string; // Filter by service provider
  tags?: string[];
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'price' | 'newest' | 'popular';
}
```

### Zod Validation Schemas

**File**: `src/lib/types/service.d.ts` (continued)

```typescript
import { z } from 'zod';

export const servicePricingSchema = z.object({
  type: z.nativeEnum(ServicePricingType),
  currency: z.string().min(1),
  amount: z.number().min(0).optional(),
  hourlyRate: z.number().min(0).optional(),
  minimumHours: z.number().min(0).optional(),
  packages: z.array(z.object({
    id: z.string(),
    name: z.string().min(1),
    description: z.string(),
    price: z.number().min(0),
    currency: z.string(),
    features: z.array(z.string()),
    duration: z.number().min(0).optional(),
    popular: z.boolean().optional()
  })).optional(),
  priceRange: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
    currency: z.string()
  }).optional(),
  discount: z.object({
    percentage: z.number().min(0).max(100),
    validUntil: z.string().optional(),
    description: z.string().optional()
  }).optional()
}).refine((data) => {
  // Validate that required fields are present based on type
  if (data.type === ServicePricingType.FIXED && !data.amount) {
    return false;
  }
  if (data.type === ServicePricingType.HOURLY && !data.hourlyRate) {
    return false;
  }
  if (data.type === ServicePricingType.PACKAGE && (!data.packages || data.packages.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Pricing type requires corresponding price fields"
});

export const serviceBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(10).max(5000),
  shortDescription: z.string().max(300).optional(),
  category: z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string().optional()
  }),
  subcategory: z.string().optional(),
  skills: z.array(z.string()).min(1),
  tags: z.array(z.string()).max(20),
  pricing: servicePricingSchema,
  estimatedDuration: z.number().min(0).optional(),
  estimatedDurationRange: z.object({
    min: z.number().min(0),
    max: z.number().min(0)
  }).optional(),
  media: z.object({
    thumbnail: z.any().optional(), // Attachment type
    images: z.array(z.any()).max(20), // Max 20 images
    videos: z.array(z.any()).max(5) // Max 5 videos
  }),
  availability: z.object({
    locationType: z.enum(['physical', 'remote', 'both']),
    serviceArea: z.object({
      address: z.string().optional(),
      coordinates: z.tuple([z.number(), z.number()]).optional(),
      radius: z.number().min(0).optional()
    }).optional(),
    remoteAvailable: z.boolean().optional(),
    remoteDetails: z.string().optional(),
    requiresBooking: z.boolean().optional(),
    bookingAdvanceNotice: z.number().min(0).optional(),
    maxBookingsPerDay: z.number().min(1).optional(),
    availableDays: z.array(z.number().min(0).max(6)).optional(),
    availableHours: z.object({
      start: z.string(),
      end: z.string()
    }).optional()
  }),
  customizationOptions: z.array(z.string()).optional(),
  termsAndConditions: z.string().max(2000).optional(),
  cancellationPolicy: z.string().max(1000).optional(),
  requirements: z.array(z.string()).optional(),
  status: z.nativeEnum(ServiceStatus).optional()
});
```

---

## Nostr Integration Strategy

### Event Kind Selection

**Decision**: Use a new event kind `SERVICE_CREATION: 31010` (following task pattern)

**Rationale**:
- Services are individual, immutable records (like tasks)
- Need version history for updates
- Should be searchable and filterable
- Different from `PROFILE_STANDARD_SERVICES` (30003) which is a replaceable list

**File**: `src/lib/utils/constants/kinds.ts`

```typescript
const KINDS = {
    // ... existing kinds
    SERVICE_CREATION: 31010, // Individual service creation/update
    SERVICE_INQUIRY: 31012, // Service inquiry/interest event
    SERVICE_BOOKING: 31013, // Service booking event
}
```

### Event Structure

**File**: `src/lib/nostr/service.ts`

```typescript
import type { ServiceBody, Service } from '$lib/types/service';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { getSignedEvent } from '$lib/utils/nostr';
import { getNpub } from '$lib/utils/nostrKeys';
import KINDS from '$lib/utils/constants/kinds';
import { calculatePOW } from '$lib/nostr';
import nostrEventsService from '$lib/api/services/nostr/events';
import { TranslationService } from '$lib/services/translation.service';
import { SUPPORTED_LANGUAGES } from '$lib/i18n/i18n';

const RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean);
const pool = new SimplePool();

/**
 * Generate service event tags
 */
async function generateServiceTags(
  serviceData: ServiceBody,
  uniqueId: string,
  previousEventId?: string
): Promise<string[][]> {
  const tags: string[][] = [];
  
  // Unique identifier for this service
  tags.push(['d', uniqueId]);
  
  // Category and skills
  tags.push(['category', serviceData.category.id]);
  if (serviceData.subcategory) {
    tags.push(['subcategory', serviceData.subcategory]);
  }
  
  serviceData.skills.forEach(skill => {
    tags.push(['skill', skill]);
  });
  
  serviceData.tags.forEach(tag => {
    tags.push(['t', tag]);
  });
  
  // Pricing type
  tags.push(['pricing_type', serviceData.pricing.type]);
  tags.push(['currency', serviceData.pricing.currency]);
  
  // Location type
  tags.push(['location_type', serviceData.availability.locationType]);
  
  // If physical location
  if (serviceData.availability.serviceArea?.coordinates) {
    const [lon, lat] = serviceData.availability.serviceArea.coordinates;
    tags.push(['location', `${lat},${lon}`]);
    if (serviceData.availability.serviceArea.radius) {
      tags.push(['radius', serviceData.availability.serviceArea.radius.toString()]);
    }
  }
  
  // Link to previous version if updating
  if (previousEventId) {
    tags.push(['e', previousEventId, '', 'previous']);
  }
  
  // Media references
  if (serviceData.media.thumbnail) {
    tags.push(['media_thumbnail', serviceData.media.thumbnail.url]);
  }
  
  // Status
  const status = serviceData.status || 'ACTIVE';
  tags.push(['status', status]);
  
  return tags;
}

/**
 * Generate translations for service
 */
async function generateServiceTranslations(
  serviceData: ServiceBody
): Promise<ServiceTranslations | undefined> {
  // Similar to task translations
  // ... implementation
}

/**
 * Create a new service
 */
export async function createService(serviceData: ServiceBody): Promise<string> {
  try {
    // Validation
    if (!serviceData.title?.trim()) {
      throw new Error('Service title is required');
    }
    if (!serviceData.description?.trim()) {
      throw new Error('Service description is required');
    }
    if (!serviceData.pricing) {
      throw new Error('Service pricing is required');
    }
    
    const npub = await getNpub();
    if (!npub) {
      throw new Error('User not authenticated');
    }
    
    // Generate unique ID
    const uniqueId = crypto.randomUUID();
    
    // Generate translations
    const translations = await generateServiceTranslations(serviceData);
    
    // Add metadata
    const serviceDataWithMeta = {
      ...serviceData,
      createdAt: Math.floor(Date.now() / 1000),
      uniqueId,
      status: serviceData.status || 'ACTIVE',
      ...(translations && { translations })
    };
    
    // Calculate POW
    const pow = await calculatePOW(
      serviceData.pricing.type === 'FIXED' 
        ? serviceData.pricing.amount || 0 
        : serviceData.pricing.hourlyRate || 0,
      uniqueId
    );
    
    // Generate tags
    const tags = await generateServiceTags(serviceData, uniqueId);
    
    // Create event
    const event = {
      kind: KINDS.SERVICE_CREATION,
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify(serviceDataWithMeta),
      tags
    };
    
    // Sign and publish
    const signedEvent = await getSignedEvent(event);
    await nostrEventsService.publishEvent(signedEvent);
    
    return signedEvent.id;
  } catch (error) {
    console.error('❌ Failed to create service:', error);
    throw error;
  }
}

/**
 * Update an existing service
 */
export async function updateService(
  serviceId: string,
  previousEventId: string,
  serviceData: ServiceBody
): Promise<string> {
  // Similar to createService but includes previousEventId in tags
  // ... implementation
}

/**
 * Delete a service
 */
export async function deleteService(serviceId: string, eventId: string): Promise<void> {
  try {
    const event = {
      kind: 5, // Deletion event
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', eventId],
        ['k', KINDS.SERVICE_CREATION.toString()],
        ['d', serviceId]
      ],
      content: 'Service deleted'
    };
    
    const signedEvent = await getSignedEvent(event);
    await nostrEventsService.publishEvent(signedEvent);
  } catch (error) {
    console.error('❌ Failed to delete service:', error);
    throw error;
  }
}

/**
 * Find services by filter
 */
export async function findServices(
  filter: SearchServicesParams = {}
): Promise<Service[]> {
  // Query Nostr relays for service events
  // ... implementation similar to findTasks
}

/**
 * Find services by npub (service provider)
 */
export async function findServicesByNpub(npub: string): Promise<Service[]> {
  // ... implementation
}

/**
 * Get inquiry count for a service (computed from Nostr events)
 * Counts messages and inquiry events that reference the service
 */
export async function getServiceInquiryCount(serviceId: string): Promise<number> {
  try {
    // Query for service inquiry events (kind 31012)
    const inquiryEvents = await pool.querySync(RELAYS, {
      kinds: [KINDS.SERVICE_INQUIRY],
      '#service': [serviceId]
    });
    
    // Query for messages (kind 4) that reference the service
    // Messages would have a tag like ['service', serviceId]
    const messageEvents = await pool.querySync(RELAYS, {
      kinds: [4],
      '#service': [serviceId]
    });
    
    // Count unique inquirers (by pubkey) to avoid duplicates
    const uniqueInquirers = new Set<string>();
    
    inquiryEvents.forEach(event => {
      uniqueInquirers.add(event.pubkey);
    });
    
    messageEvents.forEach(event => {
      uniqueInquirers.add(event.pubkey);
    });
    
    return uniqueInquirers.size;
  } catch (error) {
    console.error('Failed to get service inquiry count:', error);
    return 0;
  }
}

/**
 * Get booking count for a service (computed from Nostr events)
 * Counts contract events and booking events that reference the service
 */
export async function getServiceBookingCount(serviceId: string): Promise<number> {
  try {
    // Query for service booking events (kind 31013)
    const bookingEvents = await pool.querySync(RELAYS, {
      kinds: [KINDS.SERVICE_BOOKING],
      '#service': [serviceId]
    });
    
    // Query for contract events that reference the service
    // Contracts would have a tag like ['service', serviceId]
    const contractEvents = await pool.querySync(RELAYS, {
      kinds: [KINDS.CONTRACT],
      '#service': [serviceId]
    });
    
    // Count unique bookings (by event, not by user, since one user can have multiple bookings)
    return bookingEvents.length + contractEvents.length;
  } catch (error) {
    console.error('Failed to get service booking count:', error);
    return 0;
  }
}

/**
 * Get service analytics (inquiry and booking counts)
 * Returns computed metrics from Nostr events
 */
export async function getServiceAnalytics(serviceId: string): Promise<{
  inquiryCount: number;
  bookingCount: number;
}> {
  const [inquiryCount, bookingCount] = await Promise.all([
    getServiceInquiryCount(serviceId),
    getServiceBookingCount(serviceId)
  ]);
  
  return {
    inquiryCount,
    bookingCount
  };
}
```

---

## Component Architecture

### Service Creation Components

#### 1. ServiceBasics.svelte
**Location**: `src/lib/components/service/steps/ServiceBasics.svelte`

**Props**:
```typescript
{
  service: ServiceBody;
  onUpdate: (updates: Partial<ServiceBody>) => void;
  errors: Record<string, string>;
}
```

**Features**:
- Title input
- Description textarea (with character counter)
- Short description (optional, for previews)
- Category selection (reuse task categories)
- Subcategory selection (if applicable)
- Skills selection (multi-select)
- Tags input (comma-separated or chip-based)

#### 2. ServicePricing.svelte
**Location**: `src/lib/components/service/steps/ServicePricing.svelte`

**Props**:
```typescript
{
  service: ServiceBody;
  onUpdate: (updates: Partial<ServiceBody>) => void;
  errors: Record<string, string>;
}
```

**Features**:
- Pricing type selector (Fixed, Hourly, Package, Custom)
- Currency selector
- Real-time BTC/USD conversion
- Package builder (for package pricing)
- Price range input (for custom pricing)
- Discount/promotion fields
- Duration estimation

#### 3. ServiceMedia.svelte
**Location**: `src/lib/components/service/steps/ServiceMedia.svelte`

**Props**:
```typescript
{
  service: ServiceBody;
  onUpdate: (updates: Partial<ServiceBody>) => void;
  errors: Record<string, string>;
}
```

**Features**:
- Thumbnail upload (primary image/video)
- Image gallery (multiple images)
- Video uploads (demo videos)
- Media ordering (drag & drop)
- Alt text and descriptions
- Media preview
- Upload progress

#### 4. ServiceDetails.svelte
**Location**: `src/lib/components/service/steps/ServiceDetails.svelte`

**Props**:
```typescript
{
  service: ServiceBody;
  onUpdate: (updates: Partial<ServiceBody>) => void;
  errors: Record<string, string>;
}
```

**Features**:
- Location type selector
- Service area map picker (for physical)
- Remote service details
- Availability settings
- Booking requirements
- Customization options
- Terms & conditions
- Cancellation policy
- Client requirements

#### 5. ServiceReview.svelte
**Location**: `src/lib/components/service/steps/ServiceReview.svelte`

**Props**:
```typescript
{
  service: ServiceBody;
  onPublish: () => Promise<void>;
  isPublishing: boolean;
}
```

**Features**:
- Complete service preview
- Summary of all steps
- Validation check
- Publish button
- Save as draft option

### Service Display Components

#### 6. ServiceCard.svelte
**Location**: `src/lib/components/service/ServiceCard.svelte`

**Props**:
```typescript
{
  service: Service;
  showProvider?: boolean;
  onClick?: () => void;
  compact?: boolean;
}
```

**Features**:
- Thumbnail image
- Title and short description
- Pricing display
- Category and skills badges
- Provider info (optional)
- Click to view details

#### 7. ServiceDetail.svelte
**Location**: `src/lib/components/service/ServiceDetail.svelte`

**Props**:
```typescript
{
  service: Service;
  isOwner?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onInquire?: () => void;
}
```

**Features**:
- Full service information
- Media gallery/carousel
- Pricing details
- Availability information
- Provider profile link
- Action buttons (inquire, message, etc.)
- Owner actions (edit, delete)

#### 8. ServiceList.svelte
**Location**: `src/lib/components/service/ServiceList.svelte`

**Props**:
```typescript
{
  services: Service[];
  loading?: boolean;
  emptyMessage?: string;
  onServiceClick?: (service: Service) => void;
}
```

**Features**:
- Grid/list view toggle
- Service cards
- Loading skeleton
- Empty state
- Pagination (if needed)

### Service Management Components

#### 9. ServiceManagement.svelte
**Location**: `src/lib/components/service/ServiceManagement.svelte`

**Features**:
- List of user's services
- Create new service button
- Edit/delete actions
- Enable/disable toggle
- Service statistics
- Filter and search

---

## State Management

### Service Store

**File**: `src/lib/stores/service.store.ts`

Following the `task.store.ts` pattern:

```typescript
import type { ServiceBody, Service } from '$lib/types/service';
import { writable, get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { ServiceStatus } from '$lib/types/service';

const CREATE_STORAGE_KEY = StorageKeys.DRAFT_SERVICE;
const EDIT_STORAGE_KEY = StorageKeys.DRAFT_SERVICE_EDIT;

export enum ServiceStepEnum {
  BASICS = 'basics',
  PRICING = 'pricing',
  MEDIA = 'media',
  DETAILS = 'details',
  REVIEW = 'review'
}

export const STEPS = writable([
  ServiceStepEnum.BASICS,
  ServiceStepEnum.PRICING,
  ServiceStepEnum.MEDIA,
  ServiceStepEnum.DETAILS,
  ServiceStepEnum.REVIEW
]);

const getInitialState = () => ({
  service: {
    title: '',
    description: '',
    shortDescription: '',
    category: null,
    subcategory: '',
    skills: [],
    tags: [],
    pricing: {
      type: ServicePricingType.FIXED,
      currency: 'USD',
      amount: 0
    },
    estimatedDuration: 60,
    media: {
      images: [],
      videos: [],
      thumbnail: null
    },
    availability: {
      locationType: 'both',
      remoteAvailable: true
    },
    customizationOptions: [],
    termsAndConditions: '',
    cancellationPolicy: '',
    requirements: [],
    status: ServiceStatus.DRAFT
  } as ServiceBody,
  id: '',
  uniqueId: '',
  currentStep: ServiceStepEnum.BASICS,
  isEditing: false,
  pendingFiles: [] as File[]
});

function createServiceStore() {
  const store = writable(getInitialState());
  
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const AUTO_SAVE_DELAY = 1000;
  
  const getStorageKey = (isEditing: boolean = false): string => {
    return isEditing ? EDIT_STORAGE_KEY : CREATE_STORAGE_KEY;
  };
  
  const loadDraft = async (isEditing: boolean = false) => {
    const storageKey = getStorageKey(isEditing);
    const stored = await Preferences.get({ key: storageKey });
    if (stored.value) {
      const parsedData = JSON.parse(stored.value);
      store.update((state) => ({
        ...state,
        id: parsedData.id,
        uniqueId: parsedData.uniqueId,
        service: { ...parsedData.service },
        currentStep: parsedData.currentStep || ServiceStepEnum.BASICS,
        isEditing: parsedData.isEditing || isEditing
      }));
    }
  };
  
  const saveDraft = async (isEditing: boolean | null = null, immediate: boolean = false) => {
    if (autoSaveTimer && !immediate) {
      clearTimeout(autoSaveTimer);
    }
    
    const save = async () => {
      const storeData = get(store);
      if (storeData) {
        const editingMode = isEditing !== null ? isEditing : storeData.isEditing;
        const storageKey = getStorageKey(editingMode);
        
        await Preferences.set({
          key: storageKey,
          value: JSON.stringify({
            id: storeData.id,
            uniqueId: storeData.uniqueId,
            currentStep: storeData.currentStep,
            service: storeData.service,
            isEditing: editingMode
          })
        });
      }
    };
    
    if (immediate) {
      await save();
    } else {
      autoSaveTimer = setTimeout(save, AUTO_SAVE_DELAY);
    }
  };
  
  const clearDraft = async (isEditing: boolean = false) => {
    const storageKey = getStorageKey(isEditing);
    await Preferences.remove({ key: storageKey });
    store.set(getInitialState());
  };
  
  const nextStep = () => {
    store.update((state) => {
      const steps = get(STEPS);
      const currentIndex = steps.indexOf(state.currentStep);
      if (currentIndex < steps.length - 1) {
        return { ...state, currentStep: steps[currentIndex + 1] };
      }
      return state;
    });
    const storeData = get(store);
    saveDraft(storeData.isEditing, true);
  };
  
  const previousStep = () => {
    store.update((state) => {
      const steps = get(STEPS);
      const currentIndex = steps.indexOf(state.currentStep);
      if (currentIndex > 0) {
        return { ...state, currentStep: steps[currentIndex - 1] };
      }
      return state;
    });
  };
  
  const setStep = (step: ServiceStepEnum) => {
    store.update((state) => ({ ...state, currentStep: step }));
  };
  
  const updateService = (updates: Partial<ServiceBody>, immediate: boolean = false) => {
    store.update((state) => ({
      ...state,
      service: { ...state.service, ...updates }
    }));
    const storeData = get(store);
    saveDraft(storeData.isEditing, immediate);
  };
  
  const updateStore = (updates: Partial<typeof getInitialState>, immediate: boolean = false) => {
    store.update((state) => ({
      ...state,
      ...updates
    }));
    const storeData = get(store);
    saveDraft(storeData.isEditing, immediate);
  };
  
  return {
    set: store.set,
    subscribe: store.subscribe,
    update: store.update,
    STEPS,
    loadDraft,
    saveDraft,
    clearDraft,
    nextStep,
    previousStep,
    setStep,
    updateService,
    updateStore
  };
}

export const serviceStore = createServiceStore();
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goals**: Establish core infrastructure

**Tasks**:
1. ✅ Create `src/lib/types/service.d.ts` with all interfaces
2. ✅ Add `SERVICE_CREATION` to `kinds.ts`
3. ✅ Create `src/lib/stores/service.store.ts`
4. ✅ Create `src/lib/nostr/service.ts` with basic CRUD
5. ✅ Create translation files (`static/locales/en/services.json`, `es/services.json`)
6. ✅ Add storage keys to `StorageKeys` constant

**Deliverables**:
- Type definitions complete
- Store functional with draft saving
- Basic Nostr publishing working
- Translation structure in place

### Phase 2: Service Creation UI (Week 3-4)

**Goals**: Build multi-step creation form

**Tasks**:
1. Create route `/dashboard/services/create`
2. Create `ServiceBasics.svelte` component
3. Create `ServicePricing.svelte` component
4. Create `ServiceMedia.svelte` component
5. Create `ServiceDetails.svelte` component
6. Create `ServiceReview.svelte` component
7. Create main creation page with step navigation
8. Integrate media upload
9. Add validation at each step
10. Test complete creation flow

**Deliverables**:
- Full service creation flow functional
- All steps validated
- Media uploads working
- Draft auto-save working

### Phase 3: Service Management (Week 5)

**Goals**: Allow users to manage their services

**Tasks**:
1. Create route `/dashboard/services`
2. Create `ServiceManagement.svelte` component
3. Implement service listing (fetch user's services)
4. Add edit functionality (reuse creation flow)
5. Add delete functionality
6. Add enable/disable toggle
7. Add duplicate service feature

**Deliverables**:
- Service management page functional
- Edit/delete working
- Service status management

### Phase 4: Service Display (Week 6)

**Goals**: Show services on profiles and detail pages

**Tasks**:
1. Create `ServiceCard.svelte` component
2. Create `ServiceDetail.svelte` component
3. Create `ServiceList.svelte` component
4. Enhance `/npub/[npub]` page to show services
5. Create route `/services/[id]` for service detail (optional)
6. Add service search/filter functionality
7. Integrate with existing profile page

**Deliverables**:
- Services visible on public profiles
- Service detail view functional
- Service cards displaying correctly

### Phase 5: Advanced Features (Week 7-8)

**Goals**: Add polish and advanced functionality

**Tasks**:
1. Service search and filtering
2. Service recommendations
3. Service analytics (views, inquiries)
4. Service packages/tiers UI
5. Service availability calendar integration
6. Service reviews integration (future)
7. Performance optimization
8. Mobile responsiveness testing
9. Accessibility audit
10. Browser testing

**Deliverables**:
- All advanced features working
- Performance optimized
- Fully accessible
- Mobile-friendly

---

## Technical Decisions

### 1. Nostr Event Structure

**Decision**: Use `SERVICE_CREATION: 31010` as regular event (not replaceable)

**Rationale**:
- Services are individual items (like tasks)
- Need version history
- Updates create new events linked via tags
- Easier to search and filter

### 2. Service vs. Task Relationship

**Decision**: Services are separate from tasks, but can be converted

**Implementation**:
- Services are standalone offerings
- Tasks are specific job requests
- Future: "Create Task from Service" feature
- Services can appear in search results separately

### 3. Pricing Complexity

**Decision**: Support all pricing types from start

**Implementation**:
- Fixed, Hourly, Package, Custom all supported
- Package pricing uses array of tiers
- Custom pricing shows price range
- Real-time currency conversion

### 4. Media Strategy

**Decision**: 
- Max 20 images per service
- Max 5 videos per service
- Thumbnail required for cards
- Videos max 5 minutes duration
- Images compressed before upload

### 5. Service Categories

**Decision**: Reuse existing task categories

**Implementation**:
- Use same category system as tasks
- Add subcategory support for services
- Categories can be extended later

### 6. Availability & Booking

**Decision**: Basic availability in Phase 1, full booking in Phase 5

**Implementation**:
- Phase 1: Location type, service area, basic availability
- Phase 5: Full calendar integration, booking system

### 7. Service Discovery

**Decision**: Simple search in Phase 4, advanced in Phase 5

**Implementation**:
- Phase 4: Basic search by text, category, skills
- Phase 5: Advanced filters, recommendations, featured services

### 8. Analytics & Metrics

**Decision**: Derived from Nostr events, not stored as fields

**Implementation**:
- **View Count**: Not tracked (not feasible in decentralized system without central aggregation)
- **Inquiry Count**: Computed by querying Nostr for:
  - Messages (kind 4) that reference the service ID in tags (e.g., `['service', serviceId]`)
  - Service inquiry events (kind 31012) that reference the service
- **Booking Count**: Computed by querying Nostr for:
  - Contract events that reference the service ID
  - Service booking events (kind 31013) that reference the service
- Metrics computed on-demand when displaying service details
- Cached client-side for performance (with TTL)

---

## Testing Strategy

### Unit Tests

**Files to Test**:
- `src/lib/nostr/service.ts` - Service CRUD operations
- `src/lib/stores/service.store.ts` - State management
- `src/lib/types/service.d.ts` - Validation schemas

**Test Cases**:
- Service creation with valid data
- Service creation with invalid data
- Service update
- Service deletion
- Draft saving/loading
- Validation errors

### Integration Tests

**Test Cases**:
- Complete service creation flow
- Service edit flow
- Service deletion flow
- Media upload integration
- Nostr publishing integration

### E2E Tests (Browser Testing)

**Test Cases**:
1. Create service end-to-end
2. Edit service
3. Delete service
4. View service on profile
5. Search for services
6. Mobile responsiveness
7. Dark/light theme
8. Accessibility (keyboard navigation, screen readers)

### Performance Tests

**Metrics**:
- Service creation form load time < 2s
- Media upload completion time
- Service list load time
- Search response time

---

## Rollout Plan

### Pre-Launch Checklist

- [ ] All Phase 1-4 features complete
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Browser testing complete
- [ ] Mobile testing complete
- [ ] Accessibility audit passed
- [ ] Performance benchmarks met
- [ ] Translation coverage 100%
- [ ] Documentation complete

### Launch Strategy

1. **Soft Launch** (Internal testing)
   - Test with team members
   - Fix critical bugs
   - Gather feedback

2. **Beta Launch** (Limited users)
   - Invite select Taskees
   - Monitor performance
   - Collect usage data

3. **Full Launch** (Public)
   - Announce feature
   - Provide documentation
   - Monitor support requests

### Post-Launch

- Monitor error rates
- Collect user feedback
- Plan Phase 5 features
- Iterate based on usage

---

## Success Criteria

### Functional
- ✅ Users can create services with all required fields
- ✅ Services published to Nostr and visible
- ✅ Services can be edited and deleted
- ✅ Media uploads work correctly
- ✅ Pricing displays in multiple currencies

### Performance
- ✅ Service creation form loads < 2 seconds
- ✅ Media uploads complete in reasonable time
- ✅ Service listings load efficiently
- ✅ No memory leaks

### User Experience
- ✅ Intuitive form flow
- ✅ Clear error messages
- ✅ Helpful validation
- ✅ Smooth mobile experience

### Code Quality
- ✅ Type-safe implementation
- ✅ Follows project patterns
- ✅ Comprehensive error handling
- ✅ Accessible and responsive
- ✅ Well-documented

---

## Appendix

### File Structure

```
src/
├── lib/
│   ├── components/
│   │   └── service/
│   │       ├── steps/
│   │       │   ├── ServiceBasics.svelte
│   │       │   ├── ServicePricing.svelte
│   │       │   ├── ServiceMedia.svelte
│   │       │   ├── ServiceDetails.svelte
│   │       │   └── ServiceReview.svelte
│   │       ├── ServiceCard.svelte
│   │       ├── ServiceDetail.svelte
│   │       ├── ServiceList.svelte
│   │       └── ServiceManagement.svelte
│   ├── nostr/
│   │   └── service.ts
│   ├── stores/
│   │   └── service.store.ts
│   └── types/
│       └── service.d.ts
├── routes/
│   ├── (protected)/
│   │   └── dashboard/
│   │       └── services/
│   │           ├── create/
│   │           │   └── +page.svelte
│   │           ├── [id]/
│   │           │   └── edit/
│   │           │       └── +page.svelte
│   │           └── +page.svelte
│   └── services/
│       └── [id]/
│           └── +page.svelte (optional)
static/
└── locales/
    ├── en/
    │   └── services.json
    └── es/
        └── services.json
```

### Translation Keys Structure

```json
{
  "services": {
    "create": {
      "title": "Create Service",
      "basics": { ... },
      "pricing": { ... },
      "media": { ... },
      "details": { ... },
      "review": { ... }
    },
    "management": { ... },
    "display": { ... },
    "errors": { ... }
  }
}
```

---

**End of Implementation Plan**


