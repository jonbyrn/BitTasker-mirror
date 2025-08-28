// Nostr Search Relay Service for BitTasker
// This service implements NIP-50 search functionality for advanced task search

// Cloudflare Workers entry point
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request, env);
    }
    
    // Handle HTTP requests
    if (url.pathname === '/') {
      return new Response('BitTasker Search Relay', { status: 200 });
    }
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'healthy', 
        relay_name: env.RELAY_NAME || 'BitTasker Search Relay',
        relay_description: env.RELAY_DESCRIPTION || 'NIP-50 search relay for BitTasker platform'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/search') {
      const query = url.searchParams.get('q');
      if (!query) {
        return new Response('Query parameter "q" is required', { status: 400 });
      }
      
      const results = await performSearch(query, env);
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/info') {
      return new Response(JSON.stringify({
        name: env.RELAY_NAME || 'BitTasker Search Relay',
        description: env.RELAY_DESCRIPTION || 'NIP-50 search relay for BitTasker platform',
        pubkey: env.RELAY_PUBKEY || 'your-search-relay-pubkey-here',
        contact: env.RELAY_CONTACT || 'contact@bittasker.com',
        supported_nips: [1, 2, 9, 11, 12, 15, 16, 20, 22, 23, 25, 26, 28, 33, 40, 42, 50],
        software: 'BitTasker Search Relay',
        version: '1.0.0'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

// Handle WebSocket connections
async function handleWebSocket(request, env) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  // Handle WebSocket messages
  server.addEventListener('message', async (event) => {
    try {
      const message = JSON.parse(event.data);
      await handleSearchMessage(server, message, env);
    } catch (error) {
      console.error('Error processing search message:', error);
      server.send(JSON.stringify(['ERROR', 'Failed to process search message']));
    }
  });

  // Handle WebSocket close
  server.addEventListener('close', (event) => {
    console.log('Search WebSocket connection closed');
  });

  // Handle WebSocket errors
  server.addEventListener('error', (event) => {
    console.error('Search WebSocket error:', event);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

// Handle search-related Nostr messages
async function handleSearchMessage(ws, message, env) {
  if (!Array.isArray(message) || message.length === 0) {
    return;
  }
  
  const [type, ...params] = message;
  
  switch (type) {
    case 'EVENT':
      await handleSearchEvent(ws, params[0], env);
      break;
    case 'REQ':
      await handleSearchRequest(ws, params[0], params.slice(1), env);
      break;
    case 'CLOSE':
      await handleSearchClose(ws, params[0]);
      break;
    default:
      console.log('Unknown search message type:', type);
  }
}

// Handle events for search indexing
async function handleSearchEvent(ws, event, env) {
  try {
    // Only index task-related events
    if (event.kind === 30023) { // Task events
      await indexEvent(event, env);
    }
    
    // Send OK response
    ws.send(JSON.stringify(['OK', event.id, true, '']));
    
  } catch (error) {
    console.error('Error handling search event:', error);
    ws.send(JSON.stringify(['OK', event?.id || 'unknown', false, 'Search indexing error']));
  }
}

// Index event for search
async function indexEvent(event, env) {
  try {
    // Parse task content
    const taskData = JSON.parse(event.content);
    
    // Create search tokens
    const tokens = createSearchTokens(taskData);
    
    // For now, just log the indexed tokens since we don't have persistent storage
    console.log('Indexed event:', event.id, 'tokens:', tokens);
    
  } catch (error) {
    console.error('Error indexing event:', error);
  }
}

// Create search tokens from task data
function createSearchTokens(taskData) {
  const tokens = new Set();
  
  // Title tokens
  if (taskData.title) {
    const titleTokens = tokenize(taskData.title);
    titleTokens.forEach(token => tokens.add(token));
  }
  
  // Description tokens
  if (taskData.description) {
    const descTokens = tokenize(taskData.description);
    descTokens.forEach(token => tokens.add(token));
  }
  
  // Skills tokens
  if (taskData.skills) {
    taskData.skills.forEach(skill => {
      tokens.add(`skill:${skill.toLowerCase()}`);
    });
  }
  
  // Category tokens
  if (taskData.category) {
    tokens.add(`category:${taskData.category.toLowerCase()}`);
  }
  
  // Budget tokens
  if (taskData.budget) {
    tokens.add(`budget:${taskData.budget}`);
  }
  
  return Array.from(tokens);
}

// Tokenize text for search
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.replace(/[^\w]/g, ''))
    .filter(token => token.length > 2)
    .slice(0, 10); // Limit tokens per field
}

// Handle search requests
async function handleSearchRequest(ws, subscriptionId, filters, env) {
  try {
    // Extract search query from filters
    const searchFilter = filters.find(f => f.search);
    if (!searchFilter || !searchFilter.search) {
      ws.send(JSON.stringify(['ERROR', subscriptionId, 'Search query required']));
      return;
    }
    
    // Perform search
    const searchResults = await performSearch(searchFilter.search, env);
    
    // Apply additional filters
    const filteredResults = applyFilters(searchResults, filters);
    
    // Send results
    for (const event of filteredResults) {
      ws.send(JSON.stringify(['EVENT', subscriptionId, event]));
    }
    
    // Send EOSE
    ws.send(JSON.stringify(['EOSE', subscriptionId]));
    
  } catch (error) {
    console.error('Error handling search request:', error);
    ws.send(JSON.stringify(['ERROR', subscriptionId, 'Search failed']));
  }
}

// Perform full-text search
async function performSearch(query, env) {
  // For now, return empty results since we don't have persistent storage
  // In a full implementation, you'd query a database for matching events
  console.log('Search query:', query);
  return [];
}

// Apply additional filters to search results
function applyFilters(events, filters) {
  return events.filter(event => {
    for (const filter of filters) {
      if (filter.search) continue; // Skip search filter
      
      if (!matchesFilter(event, filter)) {
        return false;
      }
    }
    return true;
  });
}

// Check if event matches a filter
function matchesFilter(event, filter) {
  // Kind filter
  if (filter.kinds && !filter.kinds.includes(event.kind)) {
    return false;
  }
  
  // Author filter
  if (filter.authors && !filter.authors.includes(event.pubkey)) {
    return false;
  }
  
  // Since filter
  if (filter.since && event.created_at < filter.since) {
    return false;
  }
  
  // Until filter
  if (filter.until && event.created_at > filter.until) {
    return false;
  }
  
  // Tag filters
  for (const [tag, values] of Object.entries(filter)) {
    if (tag.startsWith('#') && values) {
      const tagName = tag.slice(1);
      const eventTags = event.tags.filter(t => t[0] === tagName);
      const eventValues = eventTags.map(t => t[1]);
      
      if (!values.some(v => eventValues.includes(v))) {
        return false;
      }
    }
  }
  
  return true;
}

// Handle subscription close
async function handleSearchClose(ws, subscriptionId) {
  // Clean up if needed
  console.log(`Search subscription ${subscriptionId} closed`);
}

// Export for testing
export { 
  handleSearchMessage, 
  handleSearchEvent, 
  handleSearchRequest, 
  performSearch, 
  indexEvent, 
  createSearchTokens 
};
