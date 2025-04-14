/**
 * GraphQL client configuration for BitTasker
 *
 * Configures Apollo Client to work with the BitTasker backend GraphQL API.
 * Handles authentication, error handling, and caching.
 */

import { StorageKeys } from '$lib/utils/constants/storage';
import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client/core';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { Preferences } from '@capacitor/preferences';

// GraphQL API endpoint
const GRAPHQL_ENDPOINT = 'http://127.0.0.1:8000/graph';

// HTTP connection to the API
const httpLink = createHttpLink({
  uri: GRAPHQL_ENDPOINT,
  credentials: 'include', // Include cookies for session-based auth if needed
});

// Error handling link
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) => {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      );
    });
  }
  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
  }
});

// Authentication link
const authLink = setContext(async (_, { headers }) => {
  // Get the auth token from localStorage if it exists
  const token = (await Preferences.get({ key: StorageKeys.ACCESS_TOKEN })).value;

  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    }
  };
});

// Configure cache for optimized data storage
const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        tasks: {
          // Merge function for paginated tasks
          merge(existing, incoming, { args }) {
            if (!args?.page || args.page <= 1) {
              return incoming;
            }

            return {
              ...incoming,
              items: [...(existing?.items || []), ...(incoming?.items || [])],
            };
          }
        }
      }
    }
  }
});

// Create the Apollo Client instance
export const client = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
    mutate: {
      errorPolicy: 'all',
    },
  },
});
