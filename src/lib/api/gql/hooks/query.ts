/**
 * GraphQL query utilities for BitTasker
 * 
 * Provides type-safe, functional utilities for executing GraphQL queries
 * and working with their results in a SvelteKit 5 context.
 */

import type { DocumentNode } from 'graphql';
import type { TypedDocumentNode, OperationVariables, WatchQueryOptions, QueryOptions } from '@apollo/client/core';
import { client } from '../client';
import { readable } from 'svelte/store';

/**
 * Execute a GraphQL query once and return the result
 */
export async function executeQuery<TData = any, TVariables extends OperationVariables = OperationVariables>(
  query: DocumentNode | TypedDocumentNode<TData, TVariables>,
  variables?: TVariables,
  options: Omit<QueryOptions<TVariables, TData>, 'query' | 'variables'> = {}
): Promise<{ data: TData | null; loading: boolean; error: unknown | null }> {
  try {
    const result = await client.query({
      query,
      variables,
      ...options,
    });

    return {
      data: result.data,
      loading: false,
      error: null,
    };
  } catch (error) {
    console.error('GraphQL Query Error:', error);
    return {
      data: null,
      loading: false,
      error,
    };
  }
}

/**
 * Create a readable store from a GraphQL query
 * This is useful for queries that need to update reactively
 */
export function createQueryStore<TData = any, TVariables extends OperationVariables = OperationVariables>(
  query: DocumentNode | TypedDocumentNode<TData, TVariables>,
  variables?: TVariables,
  options: Omit<WatchQueryOptions<TVariables, TData>, 'query' | 'variables'> = {}
) {
  // Create a readable store to track query results
  return readable<{ data: TData | null; loading: boolean; error: any | null }>({ data: null, loading: true, error: null }, (set) => {
    // Execute the initial query
    const observable = client.watchQuery({
      query,
      variables,
      ...options,
    });

    // Subscribe to query updates
    const subscription = observable.subscribe(
      (result) => {
        set({ data: result.data, loading: result.loading, error: null });
      },
      (error) => {
        console.error('GraphQL Query Error:', error);
        set({ data: null, loading: false, error });
      }
    );

    // Return cleanup function
    return () => {
      subscription.unsubscribe();
    };
  });
}

/**
 * Refetch a query with new variables
 */
export async function refetchQuery<TData = any, TVariables extends OperationVariables = OperationVariables>(
  query: DocumentNode | TypedDocumentNode<TData, TVariables>,
  variables?: TVariables
): Promise<boolean> {
  try {
    await client.refetchQueries({
      include: [query],
      updateCache(cache) {
        // If specific variables are provided, we can use them to refetch
        if (variables) {
          const definition = query.definitions[0];
          if (definition && 'name' in definition && definition.name) {
            cache.modify({
              fields: {
                [definition.name.value]: (_, { INVALIDATE }) => INVALIDATE
              }
            });
          }
        }
      }
    });
    return true;
  } catch (error) {
    console.error('Error refetching query:', error);
    return false;
  }
}
