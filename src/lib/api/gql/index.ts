/**
 * GraphQL index file for BitTasker
 * 
 * Exports all GraphQL functionality for easy imports throughout the app.
 */

// Client
export { client } from './client';

// Utility hooks
export { executeQuery, createQueryStore, refetchQuery } from './hooks/query';
export { executeMutation, executeMutationWithOptimisticUI, resetGraphQLCache } from './hooks/mutation';

// Fragment exports
export * from './fragments/task';
export * from './fragments/bid';
export * from './fragments/user';

// Operation exports
export * from './operations/auth';
export * from './operations/tasks';
export * from './operations/bids';
