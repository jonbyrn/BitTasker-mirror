/**
 * GraphQL fragment registry to ensure all fragments are properly processed by Apollo Client
 * This is a pure helper module aligned with BitTasker's functional programming principles
 */

import { client } from '../client';

/**
 * Register fragments with Apollo Client
 * This ensures fragment references in queries are properly resolved
 */
export function registerFragments() {
  // Nothing to do; Apollo Client 3.x+ handles fragments automatically
  // This function is provided as a hook point in case more complex
  // fragment registration is needed in the future
}
