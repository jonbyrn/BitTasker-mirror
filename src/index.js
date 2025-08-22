// Nostr Relay Service for Cloudflare Workers
// This service implements basic Nostr relay functionality for BitTasker

// Nostr event kinds
const KINDS = {
  METADATA: 0,
  TEXT_NOTE: 1,
  RECOMMEND_RELAY: 2,
  CONTACTS: 3,
  DM: 4,
  DELETION: 5,
  REPOST: 6,
  REACTION: 7,
  TASK: 30023,
  PROFILE: 30001,
  PORTFOLIO: 30002,
  PORTFOLIO_IMAGES: 1063,
  PROFILE_LOCATION: 30003
};

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
      return new Response('BitTasker Nostr Relay', { status: 200 });
    }
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        status: 'healthy', 
        relay_name: env.RELAY_NAME || 'BitTasker Relay',
        relay_description: env.RELAY_DESCRIPTION || 'Nostr relay service for BitTasker platform'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/info') {
      return new Response(JSON.stringify({
        name: env.RELAY_NAME || 'BitTasker Relay',
        description: env.RELAY_DESCRIPTION || 'Nostr relay service for BitTasker platform',
        pubkey: env.RELAY_PUBKEY || 'your-relay-pubkey-here',
        contact: env.RELAY_CONTACT || 'contact@bittasker.com',
        supported_nips: [1, 2, 9, 11, 12, 15, 16, 20, 22, 23, 25, 26, 28, 33, 40, 42, 50],
        software: 'BitTasker Relay',
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
      await handleNostrMessage(server, message, env);
    } catch (error) {
      console.error('Error processing message:', error);
      server.send(JSON.stringify(['ERROR', 'Failed to process message']));
    }
  });

  // Handle WebSocket close
  server.addEventListener('close', (event) => {
    console.log('WebSocket connection closed');
  });

  // Handle WebSocket errors
  server.addEventListener('error', (event) => {
    console.error('WebSocket error:', event);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

// Handle Nostr protocol messages
async function handleNostrMessage(ws, message, env) {
  if (!Array.isArray(message) || message.length === 0) {
    return;
  }
  
  const [type, ...params] = message;
  
  switch (type) {
    case 'EVENT':
      await handleEvent(ws, params[0], env);
      break;
    case 'REQ':
      await handleRequest(ws, params[0], params.slice(1), env);
      break;
    case 'CLOSE':
      await handleClose(ws, params[0]);
      break;
    case 'PING':
      ws.send(JSON.stringify(['PONG', params[0] || '']));
      break;
    default:
      console.log('Unknown message type:', type);
  }
}

// Handle incoming events
async function handleEvent(ws, event, env) {
  try {
    // Validate event structure
    if (!event || !event.id || !event.sig || !event.kind || !event.created_at) {
      ws.send(JSON.stringify(['OK', event?.id || 'unknown', false, 'Invalid event structure']));
      return;
    }
    
    // Validate signature (basic check)
    if (!isValidSignature(event)) {
      ws.send(JSON.stringify(['OK', event.id, false, 'Invalid signature']));
      return;
    }
    
    // For now, just log the event since we don't have persistent storage
    console.log('Event received:', event.id, 'kind:', event.kind, 'from:', event.pubkey);
    
    // Send OK response
    ws.send(JSON.stringify(['OK', event.id, true, '']));
    
  } catch (error) {
    console.error('Error handling event:', error);
    ws.send(JSON.stringify(['OK', event?.id || 'unknown', false, 'Internal error']));
  }
}

// Handle subscription requests
async function handleRequest(ws, subscriptionId, filters, env) {
  try {
    // For now, just send EOSE since we don't have persistent storage
    // In a full implementation, you'd query a database for matching events
    ws.send(JSON.stringify(['EOSE', subscriptionId]));
    
  } catch (error) {
    console.error('Error handling request:', error);
    ws.send(JSON.stringify(['ERROR', subscriptionId, 'Failed to process request']));
  }
}

// Handle subscription close
async function handleClose(ws, subscriptionId) {
  // Clean up if needed
  console.log(`Subscription ${subscriptionId} closed`);
}

// Basic signature validation (simplified)
function isValidSignature(event) {
  // In production, implement proper signature verification
  // For now, just check if signature exists and has correct format
  return event.sig && event.sig.length === 128 && /^[0-9a-f]+$/i.test(event.sig);
}

// Export for testing
export { handleNostrMessage, handleEvent, handleRequest, handleClose, isValidSignature };
