# BitTasker Task Discovery Enhancement Specification

## Overview

This document outlines the specifications for enhancing the task discovery system within the BitTasker application, focusing on improved filtering, personalization, and user experience.

## Current Implementation

The current task discovery system in BitTasker includes the following filters:
- Search term
- Category
- Task type
- Minimum budget
- Maximum budget
- Sort by
- Sort order

## Enhancement Goals

Based on the BitTasker specification from `.windsurfrules`, we will implement a comprehensive task discovery system with the following capabilities:

1. **Advanced Search Functionality**
2. **Personalized Recommendation Engine**
3. **Improved Filter Interface**
4. **Saved Searches with Notifications**

## Detailed Feature Requirements

### 1. Filter Drawer Implementation

- Add a drawer component accessible through a box SVG icon
- Group all filter options in a well-organized drawer interface
- Implement responsive design for all device sizes
- Include clear/reset filters functionality
- Add apply filters button with counter showing active filters

### 2. Enhanced Filtering Options

#### A. Current Filters (to be included in drawer)
- Search term (keyword search)
- Category selection
- Task type (REMOTE/IN_PERSON)
- Budget range (min/max)
- Sort options (field and order)

#### B. New Filters to Implement

**Location-Based Task Discovery**
- Location search input with autocomplete
- Radius selection (km)
- Current location detection option
- Map visualization option for in-person tasks

**Availability Matching**
- Date range selection
- Time preference filters (morning, midday, afternoon, evening)
- Deadline-based filtering

**Task Status Filtering**
- Filter by multiple status options (OPEN, IN_PROGRESS, etc.)
- Interface for selecting multiple options

**Advanced Budget Filtering**
- Budget type selection (FIXED, HOURLY, RANGE)
- Currency type preferences
- Improved price range UI with slider and input fields
- Visual price distribution indicators

**Skill-Based Filtering**
- Multi-select skill requirements
- Skill categorization
- Skill level indicators

### 3. Sponsored & Featured Results

- Visual indicators for sponsored/boosted tasks
- Priority placement for sponsored content
- Toggle option to include/exclude sponsored content
- Implementation of the `onlyBoostedTasks` parameter

### 4. Personalized Recommendations

- Dedicated section for recommended tasks
- Implementation using the recommendations API endpoints
- Advanced history-based recommendation engine:
  - Analysis of previously viewed, bid on, and completed tasks
  - Pattern recognition for preferred task types and categories
  - Detection of skill utilization frequency and success rate
  - Temporal analysis of task engagement patterns
  - Identification of budget range preferences over time
  - Geographic task selection patterns and preferences
- Algorithms based on:
  - User history and previously completed tasks with detailed analytics
  - Skill profile matching with performance weighting
  - Rating and success metrics across similar task categories
  - Location and availability preferences with seasonal adjustments
  - Client relationship history and repeat hiring patterns
- Feedback mechanisms to improve recommendations
- Visual explanation of why specific tasks are recommended

### 5. Saved Searches & Notifications

- Save current search criteria functionality
- Name and manage saved searches
- Option to enable notifications for new matching tasks
- Notification management interface
- Capacitor-based notifications implementation:
  - Cross-platform notification delivery (iOS, Android, Web)
  - Local notification scheduling and management
  - Push notification integration using Capacitor Push Notifications plugin
  - Periodic background checking for new matching tasks
  - Deep linking to specific tasks from notifications
  - Notification permissions handling and user preferences
  - Background notification processing
  - Notification grouping and categorization
  - Interactive notification actions (bid, save, dismiss)
  - Silent vs. alert notification options
- Email and in-app notification options
- Mark notifications as read functionality
- Notification frequency controls and quiet hours

## API Integration

### Task Filtering Endpoints
- Primary endpoint: `GET /api/v1/tasks`
- Support for all filtering parameters:
  - searchTerm, status, taskType, budgetType, categoryIds, skillIds
  - minBudget, maxBudget, location, radius, latitude, longitude
  - page, limit, sortBy, sortOrder
  - onlyBoostedTasks

### Saved Searches Endpoints
- Create saved search: `POST /api/v1/saved-searches`
- Get saved searches: `GET /api/v1/saved-searches`
- Get specific saved search: `GET /api/v1/saved-searches/{id}`
- Update saved search: `PUT /api/v1/saved-searches/{id}`
- Delete saved search: `DELETE /api/v1/saved-searches/{id}`
- Get notifications: `GET /api/v1/saved-searches/{id}/notifications`
- Mark notifications as read: `PUT /api/v1/saved-searches/{id}/mark-as-read`

### Recommendations Endpoints
- Get recommendations: `GET /api/v1/recommendations`
- Generate fresh recommendations: `POST /api/v1/recommendations/generate`
- Mark recommendations as viewed: `POST /api/v1/recommendations/mark-viewed`

## UI/UX Design Guidelines

### Filter Drawer Design
- Clean, organized grouping of filter options
- Collapsible sections for different filter categories
- Mobile-friendly touch targets
- Visual feedback for active filters
- Smooth animations for drawer open/close

### Price Range Redesign
- Dual-handle slider component for price range
- Input fields for direct value entry
- Visual price distribution graph when data is available
- Preset common ranges for quick selection
- Clear indication of currency and unit

### Search Results Display
- Card-based layout with essential information
- Visual indicators for sponsored/featured content
- Task type and location badges
- Clear visualization of budget information
- Preview of key details without expansion
- Infinite scroll with pagination controls
- Loading states and empty states design

### Recommendations Section
- Visually distinct from regular search results
- Explanation of why items are recommended
- Option to provide feedback on recommendations
- Carousel interface for browsing recommendations

## Implementation Plan

1. Create new services for recommendations and saved searches
2. Implement filter drawer component
3. Enhance existing filter components
4. Design and implement new filter options
5. Add saved searches functionality
6. Integrate recommendations engine
7. Implement notification system
8. Design and develop improved price range component
9. Add location-based search features
10. Implement sponsored content handling
11. Test and optimize for performance

## Technical Components

### New Service Files
- `src/lib/api/services/saved-searches.service.ts`
- `src/lib/api/services/recommendations.service.ts`
- `src/lib/api/services/location.service.ts`
- `src/lib/api/services/user-history.service.ts`

### New Components
- `src/lib/components/filters/FilterDrawer.svelte`
- `src/lib/components/filters/LocationFilter.svelte`
- `src/lib/components/filters/PriceRangeSlider.svelte`
- `src/lib/components/filters/AvailabilityFilter.svelte`
- `src/lib/components/recommendations/RecommendedTasks.svelte`
- `src/lib/components/recommendations/RecommendationReason.svelte`
- `src/lib/components/recommendations/HistoryBasedSuggestions.svelte`
- `src/lib/components/saved-searches/SavedSearchList.svelte`
- `src/lib/components/saved-searches/SaveSearchButton.svelte`
- `src/lib/components/notifications/SearchNotifications.svelte`
- `src/lib/components/notifications/NotificationSettings.svelte`

## Conclusion

The enhanced task discovery system will significantly improve the user experience in BitTasker by providing powerful filtering, personalization, and notification capabilities. It aligns with the platform's goal of efficiently connecting task hirers with skilled professionals through an intuitive and feature-rich interface.
