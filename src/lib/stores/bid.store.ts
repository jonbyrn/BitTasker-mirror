import type { Bid, CounterOffer, BidStatus } from '$lib/types/bid';
import { get, writable } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = StorageKeys.BIDS;
const COUNTER_OFFERS_KEY = StorageKeys.COUNTER_OFFERS;

function createBidStore() {
  // Initial state
  const initialState = {
    bids: [] as Bid[],
    counterOffers: [] as CounterOffer[],
    loadedTaskIds: [] as string[],
    isLoading: false,
    error: null as string | null
  };

  // Create the store
  const store = writable(initialState);

  // Load persisted data
  const loadPersistedData = async () => {
    try {
      // Load bids
      const bidsResult = await Preferences.get({ key: STORAGE_KEY });
      if (bidsResult?.value) {
        const bids = JSON.parse(bidsResult.value);
        store.update(state => ({ ...state, bids }));
      }
      
      // Load counter offers
      const offersResult = await Preferences.get({ key: COUNTER_OFFERS_KEY });
      if (offersResult?.value) {
        const counterOffers = JSON.parse(offersResult.value);
        store.update(state => ({ ...state, counterOffers }));
      }
    } catch (err) {
      console.error('Failed to load persisted data:', err);
      store.update(state => ({ ...state, error: 'Failed to load data' }));
    }
  };

  // Persist bids to storage
  const persistBids = async () => {
    try {
      await Preferences.set({
        key: STORAGE_KEY,
        value: JSON.stringify(get(store))
      });
    } catch (err) {
      console.error('Failed to persist bids:', err);
      store.update(state => ({ ...state, error: 'Failed to save data' }));
    }
  };

  // Persist counter offers to storage
  const persistCounterOffers = async () => {
    try {
      await Preferences.set({
        key: COUNTER_OFFERS_KEY,
        value: JSON.stringify(get(store))
      });
    } catch (err) {
      console.error('Failed to persist counter offers:', err);
    }
  };

  // Add a new bid
  const addBid = (bid: Bid) => {
    const enhancedBid: Bid = {
      ...bid,
      status: bid.status || 'pending',
      createdAt: bid.createdAt || new Date().toISOString(),
      updatedAt: bid.updatedAt || new Date().toISOString()
    };
    
    store.update(state => ({
      ...state,
      bids: [...state.bids, enhancedBid]
    }));
    
    persistBids();
  };

  // Update an existing bid
  const updateBid = (updatedBid: Bid) => {
    store.update(state => ({
      ...state,
      bids: state.bids.map(bid => 
        bid.id === updatedBid.id ? 
          { ...updatedBid, updatedAt: new Date().toISOString() } : 
          bid
      )
    }));
    
    persistBids();
  };

  // Update a bid's status
  const updateBidStatus = (bidId: string, status: BidStatus) => {
    store.update(state => ({
      ...state,
      bids: state.bids.map(bid => 
        bid.id === bidId ? 
          { ...bid, status, updatedAt: new Date().toISOString() } : 
          bid
      )
    }));
    
    persistBids();
  };

  // Reject all other bids for a task when one is accepted
  const rejectOtherBids = (acceptedBidId: string, taskId: string) => {
    store.update(state => ({
      ...state,
      bids: state.bids.map(bid => 
        (bid.taskId === taskId && bid.id !== acceptedBidId) ? 
          { ...bid, status: 'rejected' as BidStatus, updatedAt: new Date().toISOString() } : 
          bid
      )
    }));
    
    persistBids();
  };

  // Add a counter offer to a bid
  const addCounterOffer = (bidId: string, counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>) => {
    const newCounterOffer: CounterOffer = {
      id: crypto.randomUUID(),
      bidId,
      ...counterOffer,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    
    store.update(state => ({
      ...state,
      counterOffers: [...state.counterOffers, newCounterOffer],
      bids: state.bids.map(bid => 
        bid.id === bidId ? 
          { ...bid, status: 'countered' as BidStatus, updatedAt: new Date().toISOString() } : 
          bid
      )
    }));
    
    persistCounterOffers();
    persistBids();
  };

  // Query methods
  const getBidById = (bidId: string) => {
    let found: Bid | undefined;
    store.subscribe(state => {
      found = state.bids.find(bid => bid.id === bidId);
    })();
    return found;
  };

  const getBidsByTaskId = (taskId: string) => {
    let filtered: Bid[] = [];
    store.subscribe(state => {
      filtered = state.bids.filter(bid => bid.taskId === taskId);
    })();
    return filtered;
  };

  const getUserBids = (userId: string) => {
    let filtered: Bid[] = [];
    store.subscribe(state => {
      filtered = state.bids.filter(bid => bid.bidderId === userId);
    })();
    return filtered;
  };

  const getCounterOffersForBid = (bidId: string) => {
    let filtered: CounterOffer[] = [];
    store.subscribe(state => {
      filtered = state.counterOffers.filter(offer => offer.bidId === bidId);
    })();
    return filtered;
  };

  const markTaskLoaded = (taskId: string) => {
    store.update(state => {
      if (!state.loadedTaskIds.includes(taskId)) {
        return {
          ...state,
          loadedTaskIds: [...state.loadedTaskIds, taskId]
        };
      }
      return state;
    });
  };

  // Return store methods
  return {
    subscribe: store.subscribe,
    set: store.set,
    update: store.update,
    loadPersistedData,
    persistBids,
    persistCounterOffers,
    addBid,
    updateBid,
    updateBidStatus,
    rejectOtherBids,
    addCounterOffer,
    getBidById,
    getBidsByTaskId,
    getUserBids,
    getCounterOffersForBid,
    markTaskLoaded
  };
}

// Create singleton instance
export const bidStore = createBidStore();
