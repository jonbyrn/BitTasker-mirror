# Search and Filtering

This document outlines the requirements for implementing the search and filtering system in BitTasker.

## Description

The search and filtering system enables users to efficiently find tasks, workers, and other content on the platform. It provides robust search capabilities with various filters to narrow down results based on specific criteria.

## 1. Screens

### Task Search Screen

- **Search Bar Component**:
  - Text input with auto-suggestions
  - Voice search option
  - Recent searches display
  - Search button
- **Filter Panel**:
  - Category selection with icons
  - Location filter (distance radius)
  - Budget range slider
  - Task status filter
  - Date posted/deadline filters
  - Special requirements filters (skills, equipment)
  - Sort options (newest, highest paying, closest)
- **Search Results Display**:
  - List/grid toggle view
  - Task cards with key information
  - Pagination or infinite scroll
  - "No results" state with suggestions
  - Save search option

### Worker Search Screen

- **Worker Filter Panel**:
  - Skills/expertise filter
  - Rating filter
  - Availability filter
  - Verification status filter
  - Experience level filter
  - Location radius
- **Worker Results Display**:
  - Worker profile cards
  - Quick stats display
  - Contact/view profile actions
  - Sort by various metrics (rating, experience)

## 2. Schema

### SearchIndex Type

```typescript
interface SearchIndex {
	taskIndex: {
		id: string;
		title: string;
		description: string;
		category: string;
		subCategory: string;
		location: {
			latitude: number;
			longitude: number;
			address: string;
		};
		budget: {
			min: number;
			max: number;
		};
		status: string;
		createdAt: Date;
		deadline?: Date;
		tags: string[];
		poster: {
			id: string;
			name: string;
			rating: number;
		};
	}[];

	userIndex: {
		id: string;
		name: string;
		skills: string[];
		categories: string[];
		rating: number;
		completedTasks: number;
		location?: {
			latitude: number;
			longitude: number;
			address: string;
		};
		availability: string[];
		verificationLevel: number;
		joinedDate: Date;
		lastActive: Date;
	}[];
}
```

### SavedSearch Type

```typescript
interface SavedSearch {
	id: string;
	userId: string;
	name: string;
	type: 'task' | 'worker';
	query: string;
	filters: {
		[key: string]: any; // Stores all applied filters
	};
	notificationsEnabled: boolean;
	createdAt: Date;
	updatedAt: Date;
}
```

## 3. APIs

### Search APIs

- `GET /api/search/tasks` - Search for tasks

  - Query params: `q` (query text), various filters
  - Returns: Paginated task results

- `GET /api/search/users` - Search for workers

  - Query params: `q` (query text), various filters
  - Returns: Paginated user results

- `GET /api/search/suggestions` - Get search suggestions
  - Query params: `q` (partial query text), `type`
  - Returns: Array of suggestion strings

### Saved Searches

- `GET /api/saved-searches` - Get user's saved searches

  - Query params: Optional type filter
  - Returns: Array of SavedSearch objects

- `POST /api/saved-searches` - Create a saved search

  - Body: SavedSearch details
  - Returns: Created SavedSearch object

- `PUT /api/saved-searches/{searchId}` - Update a saved search

  - Body: Fields to update
  - Returns: Updated SavedSearch object

- `DELETE /api/saved-searches/{searchId}` - Delete a saved search
  - Returns: Success message

## 4. Dependencies

- Search engine library (e.g., Elasticsearch, MeiliSearch, or Algolia)
- Geospatial search capabilities
- Autocomplete/suggestion library

## 5. Services

### Frontend Services

- `SearchService`:
  - Methods for executing searches
  - Handling filters and sort options
  - Managing search history
- `AutocompleteService`:
  - Provide search suggestions
  - Handle partial text matching

### Backend Services

- `SearchIndexService`:
  - Build and maintain search indices
  - Update indices when entities change
  - Optimize search performance
- `GeoSearchService`:
  - Handle location-based searches
  - Calculate distances
  - Support radius filters
- `SearchAnalyticsService`:
  - Track popular searches
  - Analyze search patterns
  - Improve search relevance

## 6. Edge Cases

- **No Results Handling**: Provide helpful suggestions when searches return no results
- **Misspellings**: Implement fuzzy search to handle typos and misspellings

- **Multilingual Support**: Consider how to handle searches in different languages

- **Relevance Scoring**: Develop an algorithm to rank search results by relevance

- **Search Performance**: Optimize for speed with large datasets

- **Filter Combinations**: Handle complex combinations of multiple filters efficiently

- **Location Accuracy**: Account for imprecise or outdated location data

- **Category Hierarchy**: Support searching within nested category structures

- **Time-Sensitivity**: Adjust result ranking based on time-sensitive factors (e.g., task deadlines)

- **Privacy Concerns**: Ensure search results respect user privacy settings

## 7. Test Plan

### Unit Tests

#### SearchService Tests

- Test query parsing and validation
- Test filter application logic
- Test sort option handling
- Test search result formatting
- Test pagination handling

#### AutocompleteService Tests

- Test suggestion generation with partial queries
- Test caching of frequent suggestions
- Test relevance sorting of suggestions
- Test handling of minimum character thresholds

#### SearchIndexService Tests

- Test index creation and updates
- Test document transformation for indexing
- Test handling of different field types (text, numbers, dates, geo)
- Test index optimization methods

#### GeoSearchService Tests

- Test distance calculations
- Test radius filtering
- Test location normalization
- Test handling of missing location data

### Component Tests

#### Search Bar Component Tests

- Test input handling and validation
- Test suggestion display and selection
- Test search submission
- Test voice input functionality
- Test recent searches display and interaction

#### Filter Panel Tests

- Test filter selection UI
- Test range slider interactions
- Test category selection interactions
- Test filter combination logic
- Test filter clear/reset functionality

#### Search Results Display Tests

- Test list/grid view toggle
- Test result item rendering
- Test pagination controls
- Test infinite scroll behavior
- Test empty state handling
- Test loading state display

### Integration Tests

- Test complete search flow with filters
- Test saved search creation and retrieval
- Test search analytics data collection
- Test search index updates when data changes
- Test real-time search suggestions

### API Tests

- Test all search endpoints with various parameters
- Test error handling for invalid search parameters
- Test response format and pagination headers
- Test search API performance with complex queries

### Performance Tests

- Test search response time with large indices
- Test suggestion response time with high query volume
- Test index update performance for bulk changes
- Test concurrent search request handling

### Relevance Tests

- Test search result quality for common queries
- Test fuzzy matching for misspelled terms
- Test keyword highlighting in results
- Test relevance scoring with various factors

### Edge Case Tests

- Test handling of searches with no results
- Test handling of extremely broad queries
- Test behavior with complex filter combinations
- Test multilingual search functionality
- Test searches with special characters/symbols
