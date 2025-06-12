# Nostr Relays with Search Capabilities

This document outlines various Nostr relays that support search functionality, including both self-hosted options and live public relays. It also provides details about fetching events and specific limitations of each relay.

## Self-Hosted Relay Options

### 1. Searchnos
**Description**: A NIP-50 relay that provides full-text search capability using Elasticsearch as a backend.

**Setup**:
```bash
# Clone the repository
git clone https://github.com/darashi/searchnos
cd searchnos

# Configure environment
cp .env.example .env
# Edit .env to configure source and destination relays

# Start the relay
docker compose up
```

**Features**:
- Full-text search using Elasticsearch
- N-gram indexing with normalization
- Supports NIP-50 search protocol

**Limitations**:
- No spam filtering
- Limited indexing configurations
- Requires administrative API key for EVENT messages

### 2. Nostpy-relay
**Description**: A Python-based Nostr relay with PostgreSQL backend and search capabilities.

**Features**:
- NIP-50 search support
- PostgreSQL full-text search
- Web of Trust filtering
- Support for both clearnet and Tor traffic
- Redis caching for frequently queried events

**Setup**:
```bash
git clone https://github.com/UTXOnly/nostpy-relay
cd nostpy-relay

# Update environment variables
cp docker/env.example docker/.env
# Edit docker/.env with your configuration

# Run setup script
python3 menu.py
# Select "Execute server setup script"
```

**Requirements**:
- Ubuntu 22.04 server (tested on both arm64 and amd64)
- 2GB RAM minimum (4GB recommended for heavy load)
- Domain name for TLS certificate

## Live Public Relays

### 1. nostr.band
**URL**: `wss://relay.nostr.band/`

**Features**:
- Full index of events from all known relays
- Spam filtering with trust rank metric
- NIP-50 search support
- NIP-45 COUNT verb support
- Used by major clients (Snort, Iris, Amethyst)

**Limitations**:
- Cannot combine search with other parameters in filtered relay
- Spam filter can be aggressive
- Rate limits may apply
- Search results are limited to recent events

**Alternative Endpoint**:
- `wss://relay.nostr.band/all` - Unfiltered version without spam filtering
- Useful for getting accurate follower counts
- Contains more noise but provides complete data

### 2. nos.lol
**URL**: `wss://nos.lol`

**Features**:
- Basic search functionality
- Good uptime and reliability
- Moderate spam filtering

**Limitations**:
- Limited search capabilities compared to nostr.band
- May have slower response times during high load

## Fetching Events from Relays

### Basic Search Query
```javascript
// NIP-50 search request
["REQ", "SEARCH_TEST", {
  "search": "your search term",
  "kinds": [1], // Optional: limit to specific event kinds
  "limit": 10   // Optional: limit number of results
}]
```

### Advanced Search with Filters
```javascript
// Search with additional filters
["REQ", "SEARCH_TEST", {
  "search": "your search term",
  "authors": ["pubkey1", "pubkey2"], // Filter by authors
  "since": 1234567890,               // Filter by timestamp
  "#t": ["hashtag1", "hashtag2"],    // Filter by tags
  "kinds": [1, 6],                   // Multiple event kinds
  "limit": 20
}]
```

### NIP-50 Extensions
Some relays support additional search extensions:
- `include:spam` - Include spam events in results
- `domain:example.com` - Filter by NIP-05 domain
- `language:en` - Filter by language (ISO 639-1 code)
- `sentiment:positive` - Filter by sentiment
- `nsfw:false` - Exclude NSFW content

### Best Practices

1. **Multiple Relay Strategy**:
   - Connect to multiple search-capable relays
   - Deduplicate results client-side
   - Implement fallback mechanisms

2. **Error Handling**:
   - Check relay capabilities before search
   - Handle timeouts and connection issues
   - Implement retry logic with backoff

3. **Performance Optimization**:
   - Use appropriate limits
   - Cache frequent searches
   - Implement pagination

4. **Rate Limiting**:
   - Respect relay-specific rate limits
   - Implement client-side throttling
   - Monitor response headers for limit information

## Common Issues and Solutions

1. **Search Limitations**:
   - Problem: nostr.band's filtered relay doesn't support combining search with other parameters
   - Solution: Use the unfiltered endpoint (`wss://relay.nostr.band/all`) for complex queries

2. **Result Consistency**:
   - Problem: Different relays may return different results
   - Solution: Implement result merging and scoring system

3. **Performance**:
   - Problem: Search queries can be slow on large datasets
   - Solution: Use pagination and implement local caching

4. **Spam**:
   - Problem: Search results may include spam
   - Solution: Implement client-side filtering or use relays with spam protection

## Future Considerations

1. **Relay Federation**:
   - Upcoming protocols for relay coordination
   - Improved search result consistency

2. **Payment Integration**:
   - Lightning Network integration for paid relays
   - Incentivized search capabilities

3. **Advanced Search Features**:
   - Semantic search capabilities
   - Better content categorization
   - Improved spam filtering

## Hybrid Relay Architecture

This section describes a hybrid approach using both nostr-relay-nestjs and searchnos to provide comprehensive task search and filtering capabilities.

### Architecture Overview

```mermaid
graph TD
    Client[Client Application]
    NR[nostr-relay-nestjs]
    SR[searchnos]
    DB[(PostgreSQL)]
    ES[(Elasticsearch)]
    
    Client -->|Task Metadata & Filtering| NR
    Client -->|Full-text Search| SR
    NR -->|Store/Query| DB
    SR -->|Index/Search| ES
    NR -->|Event Sync| SR
```

### Component Responsibilities

#### Main Relay (nostr-relay-nestjs)
- **Primary Functions**:
  - Task metadata storage and retrieval
  - User authentication and authorization
  - Web of Trust (WoT) management
  - Basic event filtering
  - Event validation and persistence

- **Filtering Capabilities**:
  - Categories (using tags)
  - Skills (using tags)
  - Budget ranges
  - Deadlines
  - Location-based filtering
  - Status filtering
  - Author-based filtering

- **Configuration**:
```env
# nostr-relay-nestjs configuration
DATABASE_URL=postgresql://username:password@host:port/database
WOT_TRUST_ANCHOR_PUBKEY=<pubkey>
WOT_TRUST_DEPTH=2
```

#### Search Relay (searchnos)
- **Primary Functions**:
  - Full-text search across task descriptions
  - Advanced relevance scoring
  - Partial matching support
  - N-gram indexing

- **Search Features**:
  - Fuzzy matching
  - Phrase matching
  - Field-specific boosting
  - Result highlighting
  - Faceted search

- **Configuration**:
```env
# searchnos configuration
ELASTICSEARCH_URL=http://elasticsearch:9200
SOURCE_RELAYS=wss://your-main-relay/,wss://backup-relay/
ADMIN_API_KEY=your-api-key
```

### Implementation Strategy

1. **Event Flow**:
```javascript
// Client-side event publishing
["EVENT", {
  "kind": 30023,  // Task event
  "content": "Looking for a developer...",  // Full description
  "tags": [
    ["c", "development"],  // Category
    ["skill", "typescript"],  // Required skills
    ["budget", "100-500"],  // Budget range
    ["deadline", "2024-04-01"],  // Task deadline
    ["location", "remote"]  // Task location
  ]
}]
```

2. **Search Implementation**:
```javascript
// Full-text search via searchnos
["REQ", "SEARCH_1", {
  "search": "typescript developer",
  "kinds": [30023],
  "limit": 20
}]

// Metadata filtering via nostr-relay-nestjs
["REQ", "FILTER_1", {
  "kinds": [30023],
  "#c": ["development"],
  "#skill": ["typescript"],
  "#budget": ["100-500"],
  "since": 1234567890
}]
```

3. **Result Aggregation**:
```javascript
// Client-side result merging
function mergeResults(searchResults, filterResults) {
  const searchIds = new Set(searchResults.map(e => e.id));
  const filterIds = new Set(filterResults.map(e => e.id));
  
  // Find intersection of results
  const commonIds = new Set(
    [...searchIds].filter(id => filterIds.has(id))
  );
  
  // Merge and sort by relevance score
  return searchResults
    .filter(e => commonIds.has(e.id))
    .sort((a, b) => b.score - a.score);
}
```

### Best Practices

1. **Event Synchronization**:
   - Configure searchnos to subscribe to your nostr-relay-nestjs instance
   - Implement retry mechanisms for failed event synchronization
   - Monitor sync status and lag

2. **Performance Optimization**:
   - Cache common search queries
   - Implement pagination on both relays
   - Use appropriate batch sizes for event synchronization

3. **Fault Tolerance**:
   - Implement fallback to basic search if searchnos is unavailable
   - Monitor relay health and performance
   - Set up alerts for synchronization issues

4. **Query Optimization**:
   - Use appropriate search fields and boosts in Elasticsearch
   - Optimize PostgreSQL indexes for metadata filtering
   - Monitor and tune query performance

### Limitations and Considerations

1. **Consistency**:
   - There may be a slight delay between event publication and search indexing
   - Search results might not immediately reflect metadata updates
   - Plan for eventual consistency in your application design

2. **Resource Requirements**:
   - Running both relays requires more server resources
   - Elasticsearch needs adequate memory for good performance
   - Consider hosting costs and maintenance overhead

3. **Complexity**:
   - More complex deployment and monitoring setup
   - Need to maintain two different systems
   - Requires careful coordination of updates and maintenance

4. **Scaling**:
   - Both systems need to be scaled independently
   - Consider load balancing and clustering options
   - Plan for data volume growth

### Monitoring and Maintenance

1. **Key Metrics to Monitor**:
   - Event synchronization lag
   - Search response times
   - Index size and growth
   - Error rates and types
   - Resource utilization

2. **Maintenance Tasks**:
   - Regular index optimization
   - Database vacuum and maintenance
   - Log rotation and cleanup
   - Backup and recovery testing

3. **Security Considerations**:
   - Regular security updates
   - Access control review
   - API key rotation
   - Network security monitoring

### Event Flow and Data Synchronization

1. **Single Source of Truth**:
   - Events are published only to nostr-relay-nestjs
   - No manual event duplication needed
   - Searchnos automatically syncs from main relay

```javascript
// Configuration in searchnos
{
  "SOURCE_RELAYS": ["wss://your-main-relay"],
  "SYNC_INTERVAL": 1000,  // milliseconds
  "EVENT_KINDS": [30023]  // task events
}
```

2. **Automatic Synchronization**:
   - Searchnos subscribes to main relay
   - Indexes new events automatically
   - Handles updates and deletions
   - No additional publisher code needed

### Web of Trust (WoT) Implementation

1. **Trust Model**:
   - Trust Anchor: Root pubkey that starts the trust chain
   - Level 1: Direct follows of trust anchor
   - Level 2: Follows of Level 1 users

2. **Trust Propagation**:
```javascript
// Example trust calculation
function isInWebOfTrust(pubkey, trustAnchor, depth) {
  if (depth === 0) return pubkey === trustAnchor;
  if (depth === 1) return isDirectlyFollowed(pubkey, trustAnchor);
  if (depth === 2) {
    const level1Users = getDirectFollows(trustAnchor);
    return level1Users.some(user => isDirectlyFollowed(pubkey, user));
  }
}
```

3. **Benefits**:
   - Spam reduction
   - Quality control for task marketplace
   - Trust-based task visibility
   - Community-driven moderation

### Combining Search and Filters

1. **Two-Step Query Process**:
```javascript
// Step 1: Search Query (searchnos)
["REQ", "SEARCH_1", {
  "search": "typescript developer",
  "kinds": [30023],
  "limit": 50
}]

// Step 2: Metadata Filter (nostr-relay-nestjs)
["REQ", "FILTER_1", {
  "ids": searchResults.map(e => e.id),  // Use search result IDs
  "#c": ["development"],
  "#skill": ["typescript"],
  "#budget": ["100-500"]
}]
```

2. **Efficient Result Merging**:
```javascript
function mergeResults(searchResults, filterResults) {
  // Create maps for O(1) lookup
  const filterMap = new Map(
    filterResults.map(e => [e.id, e])
  );
  
  // Preserve search order while applying filters
  return searchResults
    .filter(e => filterMap.has(e.id))
    .map(e => ({
      ...e,
      metadata: filterMap.get(e.id)
    }));
}
```

3. **Benefits of This Approach**:
   - Maintains search relevance scoring
   - Applies all metadata filters
   - No data duplication
   - Efficient filtering using event IDs
   - Scalable with result size

4. **Performance Optimization**:
   - Cache common search results
   - Batch filter requests
   - Use appropriate page sizes
   - Monitor query performance

### Implementation Example

```javascript
async function searchTasks(query, filters) {
  // Step 1: Get search results
  const searchResults = await searchRelay.request({
    search: query,
    kinds: [30023],
    limit: 50
  });

  // Step 2: Apply filters using result IDs
  const filterResults = await mainRelay.request({
    ids: searchResults.map(e => e.id),
    ...filters
  });

  // Step 3: Merge while preserving search relevance
  return mergeResults(searchResults, filterResults);
}

// Usage example
const tasks = await searchTasks(
  "typescript developer",  // search query
  {
    "#c": ["development"],
    "#skill": ["typescript"],
    "#budget": ["100-500"]
  }
);
```

## Revised Recommendations

After careful analysis of relay capabilities, here are the recommended approaches:

### Single Relay Approach Option (nostr-relay-nestjs)

Use nostr-relay-nestjs as your primary relay, leveraging its PostgreSQL backend for both search and filtering.

**Advantages**:
- Single source of truth
- No synchronization issues
- Complete control over infrastructure
- Task-specific optimizations
- Web of Trust integration

**Implementation**:
```javascript
["REQ", "SEARCH_1", {
  "search": "typescript developer",  // Basic text search
  "#c": ["development"],            // Category filter
  "#skill": ["typescript"],         // Skill filter
  "#budget": ["100-500"],          // Budget filter
  "#location": ["remote"]          // Location filter
}]
```

**PostgreSQL Optimizations**:
```sql
-- Example index for task search
CREATE INDEX task_search_idx ON events 
USING gin(to_tsvector('english', content));

-- Example index for tag combinations
CREATE INDEX task_tags_idx ON event_tags 
USING btree (tag, value) 
WHERE event_kind = 30023;
```

### The Hybrid Approach Limitations (nostr-relay-nestjs & searchnos)

The previously suggested hybrid approach with searchnos has several limitations:

1. **Limited Tag Support**:
   - Searchnos focuses only on full-text search
   - No built-in support for tag filtering
   - Would require complex client-side merging

2. **Synchronization Complexity**:
   - Need to maintain event consistency
   - Potential for race conditions
   - Added operational complexity

3. **Resource Overhead**:
   - Running multiple relay types
   - Managing Elasticsearch cluster
   - Additional monitoring needs

### Recommended Path Forward

1. **Start with nostr-relay-nestjs**:
   - Implement basic search and filtering
   - Optimize PostgreSQL for task-specific queries
   - Implement WoT for quality control

2. **Monitor and Evaluate**:
   - Track search performance metrics
   - Gather user feedback on search quality
   - Measure query response times

3. **Future Optimization Options**:
   - Add PostgreSQL full-text search extensions
   - Implement caching for common searches
   - Consider specialized search services if needed

4. **Task-Specific Features**:
   - Custom task validation rules
   - Task status workflows
   - User reputation system
   - Geographic search optimization

## Indexing in Nostr Relays

### Event Structure and Indexing Challenges

Nostr events have a specific structure that influences how we index them:
```javascript
{
  "id": "...",          // SHA256 hash of the serialized event data
  "pubkey": "...",      // Publisher's public key
  "created_at": 1234,   // Unix timestamp
  "kind": 30023,        // Event kind (30023 for tasks)
  "tags": [             // Array of tags
    ["c", "development"],
    ["skill", "typescript"],
    ["budget", "100-500"]
  ],
  "content": "Looking for a TypeScript developer...",
  "sig": "..."          // Cryptographic signature
}
```

### PostgreSQL Indexing Strategies

1. **Basic Event Indexes**:
```sql
-- Primary key index (automatically created)
CREATE UNIQUE INDEX events_pkey ON events(id);

-- Timestamp index for time-based queries
CREATE INDEX idx_events_created_at ON events(created_at);

-- Kind-specific index
CREATE INDEX idx_events_kind ON events(kind);

-- Combined index for common queries
CREATE INDEX idx_events_kind_created_at ON events(kind, created_at);
```

2. **Full-Text Search Indexing**:
```sql
-- Create a generated column for full-text search
ALTER TABLE events ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(tags::text, '')), 'B')
) STORED;

-- Create GIN index for full-text search
CREATE INDEX idx_events_search ON events USING gin(search_vector);

-- Example search query
SELECT * FROM events 
WHERE search_vector @@ websearch_to_tsquery('english', 'typescript developer')
ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', 'typescript developer')) DESC;
```

3. **Tag Indexing**:
```sql
-- Separate tags table for efficient tag queries
CREATE TABLE event_tags (
  event_id TEXT REFERENCES events(id),
  tag_name TEXT,
  tag_value TEXT,
  position INTEGER
);

-- Indexes for tag queries
CREATE INDEX idx_event_tags_name_value ON event_tags(tag_name, tag_value);
CREATE INDEX idx_event_tags_event_id ON event_tags(event_id);

-- Combined index for task-specific tags
CREATE INDEX idx_task_tags ON event_tags(tag_name, tag_value) 
WHERE tag_name IN ('c', 'skill', 'budget', 'location');
```

### Specialized Task Search Indexing

1. **Task-Specific Composite Indexes**:
```sql
-- Index for task status and creation time
CREATE INDEX idx_task_status ON events(
  kind,
  (tags->>'status'),
  created_at DESC
) WHERE kind = 30023;

-- Index for budget range queries
CREATE INDEX idx_task_budget ON events(
  kind,
  (tags->>'budget'),
  created_at DESC
) WHERE kind = 30023;
```

2. **Geographic Search Index**:
```sql
-- Add PostGIS extension for geographic queries
CREATE EXTENSION postgis;

-- Add location point column
ALTER TABLE events ADD COLUMN location_point geometry(Point, 4326);

-- Create spatial index
CREATE INDEX idx_events_location ON events USING gist(location_point);
```

### Index Maintenance and Optimization

1. **Regular Maintenance**:
```sql
-- Analyze table statistics
ANALYZE events;
ANALYZE event_tags;

-- Rebuild indexes to remove bloat
REINDEX TABLE events;
REINDEX TABLE event_tags;

-- Monitor index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes;
```

2. **Index Size Management**:
```sql
-- Check index sizes
SELECT pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
       indexname
FROM pg_indexes
WHERE tablename = 'events';
```

### Query Optimization Examples

1. **Combined Tag and Text Search**:
```sql
-- Using both tag and full-text indexes
SELECT e.* FROM events e
JOIN event_tags t1 ON e.id = t1.event_id AND t1.tag_name = 'c' AND t1.tag_value = 'development'
JOIN event_tags t2 ON e.id = t2.event_id AND t2.tag_name = 'skill' AND t2.tag_value = 'typescript'
WHERE e.kind = 30023 
AND e.search_vector @@ websearch_to_tsquery('english', 'senior developer')
ORDER BY ts_rank(e.search_vector, websearch_to_tsquery('english', 'senior developer')) DESC;
```

2. **Budget Range Search**:
```sql
-- Using budget range index
SELECT e.* FROM events e
WHERE e.kind = 30023
AND (tags->>'budget')::numeric BETWEEN 100 AND 500
ORDER BY created_at DESC;
```

### Impact on Nostr Protocol

1. **Event Retrieval Efficiency**:
- Indexes speed up REQ queries with filters
- Enables efficient implementation of NIP-50 search
- Supports complex tag combinations

2. **Write Performance**:
- Indexes add overhead to EVENT message processing
- Need to balance between read and write performance
- Consider selective indexing based on query patterns

3. **Storage Considerations**:
- Indexes increase storage requirements
- Full-text search indexes can be large
- Need to monitor and manage index growth

### Best Practices

1. **Index Selection**:
- Create indexes based on actual query patterns
- Monitor index usage statistics
- Drop unused indexes
- Consider partial indexes for specific conditions

2. **Performance Tuning**:
- Regular VACUUM and ANALYZE
- Monitor index hit rates
- Use EXPLAIN ANALYZE to verify index usage
- Consider index-only scans where possible

3. **Maintenance Schedule**:
- Regular index rebuilds
- Statistics updates
- Size monitoring
- Performance tracking
