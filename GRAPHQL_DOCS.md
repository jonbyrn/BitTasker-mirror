# BitTasker GraphQL Integration Guide - Houdini Approach

## Introduction

This guide outlines the approach for integrating GraphQL with BitTasker's SvelteKit 5 frontend using **Houdini GraphQL**. It replaces the previous Apollo Client-based strategy and aligns with the project's structure and Svelte 5/SvelteKit 2 adoption.

## Table of Contents

1. [Dependency Considerations](#dependency-considerations)
2. [Integration with Existing Architecture](#integration-with-existing-architecture)
3. [Folder Structure](#folder-structure)
4. [Architectural Approach](#architectural-approach)
5. [Authentication Strategy](#authentication-strategy)
6. [Migration Strategy](#migration-strategy)
7. [Performance Considerations](#performance-considerations)
8. [Testing Strategy](#testing-strategy)

## Dependency Considerations

### Core Dependencies

- `houdini`: Core Houdini library.
- `houdini-svelte`: Svelte integration for Houdini.
- `graphql`: ^16.10.0 - GraphQL language implementation (often a peer dependency).

### Development Dependencies

- Houdini relies on its own CLI and configuration (`houdini.config.js`) for code generation, replacing the need for `@graphql-codegen/*` packages for client-side operations.

### Deprecated/Removed Dependencies

- ❌ `@apollo/client`
- ❌ `svelte-apollo`
- ❌ `@graphql-codegen/cli` (for client generation)
- ❌ `@graphql-codegen/typescript` (for client generation)
- ❌ `@graphql-codegen/typescript-operations` (for client generation)
- ❌ `@graphql-codegen/client-preset`
- ❌ `@graphql-codegen/typescript-document-nodes`

## Integration with Existing Architecture

### Houdini Implementation

Houdini integrates deeply with SvelteKit and Svelte 5:

1.  **Client Configuration**: The Houdini client is configured in `src/client.ts`, specifying the GraphQL endpoint URL and any necessary plugins (e.g., for authentication).
2.  **Code Generation**: Houdini automatically generates types, stores, and runtime code into the `.houdini` directory based on `.gql` files found in the project or inline `graphql()` tags.
3.  **Operations**: GraphQL queries, mutations, fragments, and subscriptions are defined either in `.gql` files or directly within Svelte components using the `graphql()` tag function.
4.  **Data Fetching**:
    - **Load Functions**: Houdini automatically fetches data defined in queries within `+page.svelte` or `+layout.svelte` during server-side rendering or client-side navigation via SvelteKit's load functions.
    - **Manual Fetching**: Queries and mutations can be triggered manually using the methods provided by the generated Houdini stores (e.g., `MyQueryStore.fetch()`, `MyMutationStore.mutate()`).
    - **Reactivity**: Data is exposed through reactive Svelte stores (often using `$derived` with Svelte 5 runes).
5.  **Services**: Existing services in `src/lib/api/services` can be adapted to interact with Houdini stores or trigger mutations instead of making direct REST/Apollo calls.

## Folder Structure

```
.houdini/                # Houdini generated runtime, types, artifacts
├── artifacts/
├── graphql/
├── runtime/
└── ...
src/
├── client.ts            # Houdini Client configuration
└── lib/
    └── utils/
        └── houdini/     # Houdini specific utilities
            └── plugins/ # Custom Houdini client plugins (e.g., auth)
                └── customAuthPlugin.ts
# Other project files...
houdini.config.js        # Houdini configuration file
schema.graphql           # GraphQL schema file
```

_Note: The previous `src/lib/api/gql` and `src/lib/graphql/generated` directories are largely replaced by Houdini's structure and the `.houdini` directory._

## Architectural Approach

### Houdini's Store-Based & SvelteKit Integration

Houdini promotes a highly integrated approach:

✅ **Leverage Houdini Stores & SvelteKit**:

- Define operations using the `graphql` tag or `.gql` files.
- Utilize auto-generated, type-safe Svelte stores for reactivity.
- Rely on Houdini's SvelteKit integration for automatic data loading in routes.
- Keep components focused on presentation, using data from Houdini stores.
- Maintain functional patterns within services and utility functions where applicable.

### Implementation Strategy

1. **Client Configuration**: Configure `src/client.ts` with the correct endpoint and authentication plugin.
2. **Schema**: Ensure `schema.graphql` is up-to-date.
3. **Operations**: Define GraphQL operations inline using `graphql()` or in dedicated `.gql` files.
4. **Integration**: Use Houdini stores and fetch/mutate methods within Svelte components and potentially adapt existing services.
5. **Gradual Migration**: Continue migrating REST endpoints to GraphQL using Houdini patterns.

## Authentication Strategy

### JWT Authentication via Houdini Plugin

The existing JWT approach is integrated using a custom Houdini client plugin:

1.  **Client Configuration**: `src/client.ts` includes a custom plugin (`$lib/utils/houdini/plugins/customAuthPlugin.ts`) and potentially uses `fetchParams` to add the Authorization header.
    - **Caution**: The direct use of `localStorage` in `fetchParams` within `src/client.ts` is problematic for SSR. Authentication logic should ideally be handled robustly within the custom plugin or using SvelteKit's server-side capabilities (`event.locals`, `cookies`) to pass the token appropriately, ensuring it's available server-side without relying on browser-only APIs.
2.  **Plugin Logic**: The `customAuthPlugin.ts` likely handles fetching the token (potentially from cookies server-side or localStorage client-side) and adding it to the outgoing request headers. It might also handle token refresh logic.
3.  **Token Management**: Continue using the existing token storage (`localStorage` via `CapacitorStorage` on the client, potentially secure cookies for SSR) and session invalidation mechanisms. The Houdini plugin acts as the bridge.

## Migration Strategy

### Phased Approach (Remains Similar)

The phased approach is still valid, but implementation details change:

1.  **Phase 1: Setup and Infrastructure**
    - Configure Houdini (`houdini.config.js`, `src/client.ts`).
    - Ensure schema generation/fetching works.
    - Establish patterns for using Houdini stores/queries.
2.  **Phase 2: Non-Critical Features First**
    - Convert low-risk REST endpoints to Houdini queries/mutations.
3.  **Phase 3: Core Features Migration**
    - Migrate critical features using Houdini.
4.  **Phase 4: Complete Migration**
    - Remove redundant REST code.
    - Finalize Houdini implementations.

### Priority Order Suggestion (Remains Similar)

The priority remains the same, focusing on migrating data fetching and state updates to Houdini.

## Performance Considerations

### Caching Strategy

- Houdini provides automatic **normalized caching** out-of-the-box. Data fetched via queries is stored, and subsequent requests for the same data can often be served from the cache.
- Configure cache policies in `houdini.config.js` if needed (e.g., partial updates, optimistic responses).
- Use Houdini's cache manipulation methods (`cache.write`, `cache.invalidate`) for fine-grained control when necessary (e.g., after mutations).

### Query Optimization

- Use GraphQL **fragments** (defined in `.gql` files or inline) to reuse parts of queries and ensure consistency. Houdini processes these efficiently.
- Implement **pagination** using Houdini's built-in directives (`@paginate`) or manual fetching with page variables.
- Houdini automatically handles **batching** if configured and supported by the server.

### Mobile Considerations

- Houdini's cache provides some level of offline support, but for robust offline capabilities, consider integrating dedicated offline-first solutions if required.
- Implement retry logic within fetch wrappers or potentially via Houdini plugins.
- Houdini helps reduce payload size by fetching only necessary data, but ensure queries remain optimized.

## Testing Strategy

### Unit Testing

- Test utility functions and custom Houdini plugins in isolation.
- Services interacting with Houdini can be tested by mocking the Houdini store methods (`.fetch`, `.mutate`).

### Integration Testing

- Use tools like Vitest or Playwright to test Svelte components.
- Mock the network layer using tools like `msw` (Mock Service Worker) to provide controlled GraphQL responses to Houdini during tests.
- Verify component behavior based on mocked Houdini store states (loading, data, error).

### End-to-End Testing

- Implement full flow tests (e.g., using Playwright) that interact with the actual backend via the Houdini client.
- Test authentication flows integrated with Houdini.

## Conclusion

Migrating to **Houdini GraphQL** provides a modern, type-safe, and highly integrated data-fetching layer for BitTasker's SvelteKit 5 application. It simplifies state management, leverages SvelteKit's features effectively, and aligns well with the project's functional principles and Svelte 5 adoption. By following this guide, the integration can be performed smoothly, enhancing developer experience and application performance.
