# Profile Management Implementation

## Overview

The profile management system in BitTasker is built using SvelteKit for the frontend and NestJS for the backend, with Nostr integration for decentralized identity management. This document outlines the technical implementation details for the comprehensive profile system.

## Frontend Implementation

### Component Structure
```typescript
src/routes/profile/
├── +page.svelte           // Main profile page
├── edit/
│   ├── +page.svelte      // Edit profile page
├── components/
│   ├── PersonalInfo.svelte
│   ├── ServiceSkills.svelte
│   ├── Portfolio.svelte
│   ├── Availability.svelte
│   ├── PricingCard.svelte
│   ├── LocationMap.svelte
│   └── AIAssistant.svelte
```

## Nostr Implementation

### Profile Sections

#### 1. Personal Information

- **Event Kind**: 0 (Metadata)
- **Content**: JSON object containing basic profile information
- **Implementation**: Uses replaceable events to store and update user metadata
- **Fields**:
  - name
  - displayName
  - about
  - pictures (array of profile images)
  - banner
  - website
  - nip05
  - lud16
  - professionalTitle
- **Image Handling**:
  ```typescript
  tags: [
    ["url", imageUrl],
    ["m", "image/jpeg"],
    ["alt", "Profile picture"],
    ["blurhash", imageHash],
    ["thumb", thumbnailUrl]
  ]
  ```

#### 2. Skills & Certifications

- **Event Kind**: 30000 (Replaceable)
- **Content**: JSON array of skills with proficiency levels
- **Tags**: 
  - `t`: ['skill']
- **Related Events**:
  - **Certifications**: Kind 1063 with `t`: ['certification']
  - Links certifications to skills using the `skill` tag
- **Implementation**:
  - Skills are stored as a replaceable event
  - Certifications are stored as separate media events
  - Real-time subscription for updates
  - Verification system for certifications
- **Data Structure**:
  ```typescript
  interface Skill {
    name: string;
    level: number;
    verificationStatus: 'pending' | 'verified' | 'unverified';
    endorsements: number;
    certifications: SkillCertification[];
  }
  ```

#### 3. Portfolio

- **Event Kind**: 30001 (Replaceable)
- **Content**: JSON object containing portfolio item details
- **Tags**:
  - `d`: ['portfolio-{id}'] (for unique identification)
  - `t`: ['portfolio']
  - `e`: ['{imageEventId}', 'image'] (references to image events)
  - `t`: ['{skillName}'] (skills used in the project)
- **Related Events**:
  - **Images**: Kind 1063 with `t`: ['portfolio']
- **Implementation**:
  - Each portfolio item is a replaceable event
  - Images are stored as separate media events
  - Real-time subscription for updates
  - Primary image selection
  - Deletion using Kind 5 events

#### 4. Availability

- **Event Kind**: 31000 (Replaceable)
- **Content**: JSON object containing availability schedule
- **Tags**:
  - `d`: ['availability']
  - `t`: ['schedule']
- **Implementation**:
  - Weekly recurring schedule
  - Time zone handling
  - Buffer time settings
  - Break time settings
- **Data Structure**:
  ```typescript
  interface Availability {
    timezone: string;
    weeklySchedule: {
      [day: string]: {
        available: boolean;
        slots: Array<{
          start: string;
          end: string;
        }>;
      };
    };
    bufferTime: number;
    breakTime: number;
  }
  ```

#### 5. Pricing

- **Event Kind**: 32000 (Replaceable)
- **Content**: JSON object containing service pricing
- **Tags**:
  - `d`: ['pricing']
  - `t`: ['service-rate']
  - `currency`: ['USD', 'EUR', etc.]
- **Implementation**:
  - Hourly rates
  - Package pricing
  - Currency preferences
  - Payment method preferences
- **Data Structure**:
  ```typescript
  interface Pricing {
    hourlyRate: number;
    currency: string;
    packages: Array<{
      name: string;
      description: string;
      hours: number;
      price: number;
      features: string[];
    }>;
    paymentMethods: string[];
  }
  ```

#### 6. Location

- **Event Kind**: 33000 (Replaceable)
- **Content**: JSON object containing location preferences
- **Tags**:
  - `d`: ['location']
  - `t`: ['work-location']
- **Implementation**:
  - Work location preferences
  - Remote work settings
  - Time zone information
  - Travel preferences
- **Data Structure**:
  ```typescript
  interface Location {
    preferredLocations: string[];
    remoteWork: boolean;
    travelPreferences: {
      willing: boolean;
      radius: number;
      unit: 'km' | 'mi';
    };
  }
  ```

### Common Features

#### Image Handling
- Uses Kind 1063 events for media metadata
- Images are uploaded to a media server
- Event tags include:
  - `url`: Direct link to the image
  - `m`: MIME type
  - `alt`: Alternative text
  - `t`: Context tag (e.g., 'portfolio', 'certification')

#### Real-time Updates
- Uses SimplePool for efficient relay connections
- Implements subscription system for live updates
- Handles both initial data load and real-time changes

#### Data Management
- Uses replaceable events for updateable content
- Maintains references between related events using tags
- Implements proper cleanup on component unmount

#### Error Handling
- Implements retry logic for failed operations
- Provides user feedback for success/failure
- Maintains data consistency across operations

### Migration Strategy

1. **Phase 1: Dual Read**
   - Read from both GraphQL and Nostr
   - Display merged data
   - Prioritize Nostr data when available

2. **Phase 2: Nostr Write**
   - Write only to Nostr
   - Maintain GraphQL read capability
   - Validate all Nostr writes

3. **Phase 3: Full Nostr**
   - Complete migration to Nostr
   - GraphQL endpoints deprecated
   - Full Nostr event handling

## Security Considerations

1. **Data Protection**
   - Implement end-to-end encryption for sensitive data
   - Use secure storage for KYC documents
   - Implement rate limiting for API endpoints

2. **Access Control**
   - Role-based access control for profile management
   - Granular permissions for profile data access
   - Audit logging for profile changes

3. **Media Security**
   - Virus scanning for uploaded files
   - Content moderation for images and videos
   - Secure media storage with expiring URLs

## Integration Points

1. **Nostr Integration**
   - Profile data synchronization
   - Identity verification
   - Event-based updates

2. **Payment System**
   - Service pricing integration
   - Payment history
   - Subscription management

3. **Calendar System**
   - Availability management
   - Booking integration
   - Schedule synchronization

## Best Practices

1. **Event Organization**
   - Use appropriate event kinds for different data types
   - Maintain clear relationships using tags
   - Use replaceable events for updateable content

2. **Data Consistency**
   - Validate data before publishing
   - Handle race conditions in real-time updates
   - Implement proper cleanup

3. **User Experience**
   - Provide immediate feedback for actions
   - Handle loading states appropriately
   - Implement proper error handling

4. **Performance**
   - Optimize image uploads
   - Use efficient data structures
   - Implement proper caching strategies

## Future Improvements

1. **Verification System**
   - Implement NIP-05 verification
   - Add certification verification
   - Support third-party verifications

2. **Data Backup**
   - Implement local caching
   - Add export/import functionality
   - Support multiple relay redundancy

3. **Enhanced Features**
   - Add portfolio analytics
   - Implement social sharing
   - Add collaborative features
   - AI-powered profile optimization
   - Enhanced skill recommendations
   - Automated content moderation 