/**
 * GraphQL mutation utilities for BitTasker
 * 
 * Provides type-safe, functional utilities for executing GraphQL mutations
 * and working with their results in a SvelteKit 5 context.
 */

import type { DocumentNode } from 'graphql';
import type { TypedDocumentNode, OperationVariables, MutationOptions } from '@apollo/client/core';
import { client } from '../client';

/**
 * Execute a GraphQL mutation and return the result
 */
export async function executeMutation<TData = any, TVariables extends OperationVariables = OperationVariables>(
  mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
  variables?: TVariables,
  options: Omit<MutationOptions<TData, TVariables>, 'mutation' | 'variables'> = {}
): Promise<{ data: TData | null; loading: boolean; error: unknown | null }> {
  try {
    const result = await client.mutate({
      mutation,
      variables,
      ...options,
    });
    
    return {
      data: result.data || null,
      loading: false,
      error: null,
    };
  } catch (error) {
    console.error('GraphQL Mutation Error:', error);
    return {
      data: null,
      loading: false,
      error,
    };
  }
}

/**
 * Execute a GraphQL mutation with optimistic UI updates
 * This is useful for mutations that modify data in the cache
 */
export async function executeMutationWithOptimisticUI<TData = any, TVariables extends OperationVariables = OperationVariables>(
  mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
  variables?: TVariables,
  optimisticResponse?: any,
  updateQueries?: Record<string, (cache: any, data: any) => void>,
): Promise<{ data: TData | null; loading: boolean; error: unknown | null }> {
  try {
    const result = await client.mutate({
      mutation,
      variables,
      optimisticResponse,
      update: (cache, { data }) => {
        // Apply custom update function for each affected query
        if (updateQueries && data) {
          Object.entries(updateQueries).forEach(([queryName, updateFn]) => {
            updateFn(cache, data);
          });
        }
      },
    });
    
    return {
      data: result.data || null,
      loading: false,
      error: null,
    };
  } catch (error) {
    console.error('GraphQL Mutation Error:', error);
    return {
      data: null,
      loading: false,
      error,
    };
  }
}

/**
 * Reset the Apollo Client cache
 * This is useful after logout or when data needs to be refreshed completely
 */
export async function resetGraphQLCache(): Promise<boolean> {
  try {
    await client.resetStore();
    return true;
  } catch (error) {
    console.error('Error resetting GraphQL cache:', error);
    return false;
  }
}
