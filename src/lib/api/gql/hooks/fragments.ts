/**
 * GraphQL fragment registry to ensure all fragments are properly processed by Apollo Client
 * This is a pure helper module aligned with BitTasker's functional programming principles
 */

import type { DocumentNode } from 'graphql';
import { gql } from '@apollo/client/core';

// A map to store processed fragments
type FragmentMap = Map<string, DocumentNode>;

// Private fragment registry store
const fragmentRegistry: FragmentMap = new Map();

/**
 * Register a fragment for later use
 * @param fragmentDoc The fragment document
 * @returns The same fragment document (for chaining)
 */
export function registerFragment(fragmentDoc: DocumentNode): DocumentNode {
  // Extract fragment name from the document
  if (
    fragmentDoc.definitions[0] && 
    fragmentDoc.definitions[0].kind === 'FragmentDefinition'
  ) {
    const name = fragmentDoc.definitions[0].name.value;
    fragmentRegistry.set(name, fragmentDoc);
  }
  return fragmentDoc;
}

/**
 * Combine fragments with a GraphQL operation
 * Use this to ensure fragment definitions are included in operations
 * @param operation The GraphQL operation (query/mutation)
 * @param fragments Array of fragment documents to include
 * @returns A new operation document with fragments embedded
 */
export function withFragments(operation: DocumentNode, ...fragments: DocumentNode[]): DocumentNode {
  // Create a new operation with embedded fragments
  const opString = operation.loc?.source.body ?? '';
  const fragmentStrings = fragments.map(f => f.loc?.source.body ?? '').filter(Boolean);
  
  // Combine all into a single GraphQL document
  return gql`${opString}\n${fragmentStrings.join('\n')}`;
}

/**
 * Get a registered fragment by name
 * @param name The fragment name
 * @returns The fragment document or undefined if not found
 */
export function getFragment(name: string): DocumentNode | undefined {
  return fragmentRegistry.get(name);
}

/**
 * Preload fragments from modules for use in operations
 * This should be called early in your application initialization
 */
export function preloadFragments() {
  // This will be called by the application to ensure all fragments are loaded
  // The import statements ensure fragments are processed and registered
  // No explicit action needed here since imports handle registration
}
