import { SimplePool } from 'nostr-tools/pool';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { finalizeEvent } from 'nostr-tools/pure';

// Custom error types for better error handling
export class NostrConnectionError extends Error {
    constructor(message: string, public relay: string) {
        super(message);
        this.name = 'NostrConnectionError';
    }
}

export class NostrTimeoutError extends Error {
    constructor(message: string, public relay: string) {
        super(message);
        this.name = 'NostrTimeoutError';
    }
}

// Connection states
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Fallback relays in case the primary relay fails
const FALLBACK_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol'
];

class NostrPoolManager {
    private pool: SimplePool;
    private connectionStates: Map<string, ConnectionState>;
    private connectionAttempts: Map<string, number>;
    private heartbeatIntervals: Map<string, NodeJS.Timeout>;
    private eventBuffer: Map<string, NostrEvent[]>;
    private maxRetries: number = 3;
    private baseRetryDelay: number = 1000; // 1 second
    private maxRetryDelay: number = 30000; // 30 seconds
    private heartbeatInterval: number = 30000; // 30 seconds
    private connectionTimeout: number = 5000; // 5 seconds

    constructor() {
        this.pool = new SimplePool();
        this.connectionStates = new Map();
        this.connectionAttempts = new Map();
        this.heartbeatIntervals = new Map();
        this.eventBuffer = new Map();
    }

    private getRetryDelay(attempts: number): number {
        // Exponential backoff with jitter
        const delay = Math.min(
            this.maxRetryDelay,
            this.baseRetryDelay * Math.pow(2, attempts) * (0.5 + Math.random())
        );
        return Math.floor(delay);
    }

    private startHeartbeat(relay: string) {
        // Clear any existing heartbeat
        this.stopHeartbeat(relay);

        // Start new heartbeat
        const interval = setInterval(async () => {
            try {
                await this.testRelay(relay);
            } catch (error) {
                console.warn(`Heartbeat failed for ${relay}:`, error);
                this.handleConnectionFailure(relay);
            }
        }, this.heartbeatInterval);

        this.heartbeatIntervals.set(relay, interval);
    }

    private stopHeartbeat(relay: string) {
        const interval = this.heartbeatIntervals.get(relay);
        if (interval) {
            clearInterval(interval);
            this.heartbeatIntervals.delete(relay);
        }
    }

    private async handleConnectionFailure(relay: string) {
        const attempts = this.connectionAttempts.get(relay) || 0;
        this.connectionStates.set(relay, 'error');
        this.stopHeartbeat(relay);

        if (attempts < this.maxRetries) {
            const delay = this.getRetryDelay(attempts);
            this.connectionAttempts.set(relay, attempts + 1);
            
            console.warn(`Retrying connection to ${relay} in ${delay}ms (attempt ${attempts + 1}/${this.maxRetries})`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            await this.connect(relay);
        } else {
            console.error(`Max retries reached for ${relay}, switching to fallback relay`);
            throw new NostrConnectionError(`Max retries reached for ${relay}`, relay);
        }
    }

    private async testRelay(relay: string): Promise<boolean> {
        try {
            const dummyEvent: NostrEvent = {
                kind: 0,
                created_at: Math.floor(Date.now() / 1000),
                tags: [],
                content: '',
                pubkey: '',
                id: '',
                sig: ''
            };
            
            await Promise.race([
                this.pool.publish([relay], dummyEvent),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new NostrTimeoutError('Connection timeout', relay)), 
                    this.connectionTimeout)
                )
            ]);

            return true;
        } catch (error) {
            if (error instanceof NostrTimeoutError) {
                throw error;
            }
            return false;
        }
    }

    private async connect(relay: string): Promise<void> {
        if (this.connectionStates.get(relay) === 'connecting') {
            return;
        }

        this.connectionStates.set(relay, 'connecting');

        try {
            const isConnected = await this.testRelay(relay);
            if (isConnected) {
                this.connectionStates.set(relay, 'connected');
                this.connectionAttempts.set(relay, 0);
                this.startHeartbeat(relay);

                // Process buffered events
                const bufferedEvents = this.eventBuffer.get(relay) || [];
                for (const event of bufferedEvents) {
                    await this.publish(event, relay);
                }
                this.eventBuffer.delete(relay);
            } else {
                throw new NostrConnectionError('Failed to connect to relay', relay);
            }
        } catch (error) {
            await this.handleConnectionFailure(relay);
        }
    }

    private async getWorkingRelay(): Promise<string> {
        const relays = [PUBLIC_NOSTR_RELAY_URL, ...FALLBACK_RELAYS];
        
        for (const relay of relays) {
            try {
                await this.connect(relay);
                return relay;
            } catch (error) {
                console.warn(`Failed to connect to relay ${relay}:`, error);
                continue;
            }
        }

        throw new NostrConnectionError('No working relays found', 'all');
    }

    async publish(event: NostrEvent, relayUrl: string = PUBLIC_NOSTR_RELAY_URL): Promise<void> {
        try {
            // Ensure we're connected
            if (this.connectionStates.get(relayUrl) !== 'connected') {
                // Buffer the event if we're not connected
                const buffered = this.eventBuffer.get(relayUrl) || [];
                buffered.push(event);
                this.eventBuffer.set(relayUrl, buffered);
                
                await this.connect(relayUrl);
                return;
            }

            await Promise.race([
                this.pool.publish([relayUrl], event),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new NostrTimeoutError('Publish timeout', relayUrl)),
                    this.connectionTimeout)
                )
            ]);
        } catch (error) {
            if (error instanceof NostrTimeoutError || error instanceof NostrConnectionError) {
                // Try to find another working relay
                const newRelay = await this.getWorkingRelay();
                if (newRelay !== relayUrl) {
                    return this.publish(event, newRelay);
                }
            }
            throw error;
        }
    }

    subscribe(relayUrl: string, filters: Filter, callbacks: {
        onevent?: (event: NostrEvent) => void;
        oneose?: () => void;
        onclose?: () => void;
    }): { close: () => void } {
        const wrappedCallbacks = {
            onevent: (event: NostrEvent) => {
                if (this.connectionStates.get(relayUrl) === 'connected') {
                    callbacks.onevent?.(event);
                }
            },
            oneose: () => {
                callbacks.oneose?.();
            },
            onclose: () => {
                this.connectionStates.set(relayUrl, 'disconnected');
                this.stopHeartbeat(relayUrl);
                callbacks.onclose?.();
            }
        };

        // Ensure connection before subscribing
        this.connect(relayUrl).catch(console.error);

        const sub = this.pool.subscribe([relayUrl], filters, wrappedCallbacks);

        return {
            close: () => {
                this.stopHeartbeat(relayUrl);
                sub.close();
            }
        };
    }

    async querySync(relayUrl: string, filter: Filter): Promise<NostrEvent[]> {
        try {
            // Ensure connection before querying
            if (this.connectionStates.get(relayUrl) !== 'connected') {
                await this.connect(relayUrl);
            }

            return await Promise.race([
                this.pool.querySync([relayUrl], filter),
                new Promise<NostrEvent[]>((_, reject) => 
                    setTimeout(() => reject(new NostrTimeoutError('Query timeout', relayUrl)),
                    this.connectionTimeout)
                )
            ]);
        } catch (error) {
            if (error instanceof NostrTimeoutError || error instanceof NostrConnectionError) {
                // Try fallback relays
                for (const fallbackRelay of FALLBACK_RELAYS) {
                    try {
                        if (fallbackRelay !== relayUrl) {
                            return await this.querySync(fallbackRelay, filter);
                        }
                    } catch (fallbackError) {
                        console.warn(`Fallback relay ${fallbackRelay} failed:`, fallbackError);
                    }
                }
            }
            throw error;
        }
    }

    close(relays: string[] = [PUBLIC_NOSTR_RELAY_URL]) {
        for (const relay of relays) {
            this.stopHeartbeat(relay);
            this.connectionStates.set(relay, 'disconnected');
        }
        this.pool.close(relays);
    }
}

// Export a singleton instance
export const nostrPool = new NostrPoolManager(); 