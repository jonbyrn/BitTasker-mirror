# GraphQL Migration Plan

This document outlines the steps for removing legacy code and migrating from REST API to a fully typed GraphQL integration in the BitTasker app.

---

## 1. Cleanup: Remove Unused GraphQL Code

- Delete the legacy generated file:
  ```
  src/lib/api/gql/generated.ts
  ```
- Remove `graphql-tag` dependency if no longer used.
- Remove any stub or unused fallback code related to `src/lib/graphql/generated/gql.ts` if operations are now TypeScript-based.

## 2. Cleanup: Remove Legacy REST API Code

- **Note:** Do not delete the existing REST API services; simply refrain from using them for now. This will facilitate future references if needed.
- Unuse Axios setup and service layer:
  ```
  src/lib/api/axios.ts
  src/lib/api/apiService.ts
  ```
- Remove or refactor components that import or use Axios:
  - `AuthProviders/X.svelte`
  - `components/bidding/BidCreationForm.svelte`
  - Any other `.svelte` or `.ts` files with direct REST calls

## 3. Verify GraphQL Codegen Configuration

- Ensure `src/codegen.ts` documents glob patterns point to operations and fragments:
  ```ts
  documents: [
    'src/lib/api/gql/operations/**/*.ts',
    'src/lib/api/gql/fragments/**/*.ts'
  ],
  ```
- Confirm `presetConfig` uses `gqlImport` from `@apollo/client/core`.
- Set `ignoreNoDocuments: false` to catch missing operations early.
- Make sure `.env` (or `.env.local`) contains:
  ```env
  VITE_GRAPHQL_SERVER_ENTRYPOINT="https://devbackend.production.bittasker.hedgehackers.finance/graph"
  ```
- Run:
  ```bash
  npm run codegen
  ```
  to regenerate all typed `DocumentNode` files under `src/lib/graphql/generated/`.

## 4. Update GraphQL Client

- In `src/lib/api/gql/client.ts`, ensure the endpoint uses the environment variable:
  ```ts
  const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_SERVER_ENTRYPOINT;
  ```
- Confirm that `executeQuery` and `executeMutation` hooks accept `TypedDocumentNode<TData, TVariables>`.

## 5. Migrate the Service Layer

- For each REST-based service (e.g. TaskService, AuthService, BidService):

  1. Create or update a GraphQL operations file in `src/lib/api/gql/operations/`.
  2. Define the corresponding TypeScript service class in `src/lib/api/gql/services/`.
  3. Use the codegen-generated types for inputs and outputs, e.g.:

     ```ts
     import type { TasksQuery, TasksQueryVariables } from '$lib/graphql/generated';
     import { GET_TASKS } from '../operations/tasks';

     async function fetchTasks(vars: TasksQueryVariables): Promise<TasksQuery['tasks']> {
     	const { data } = await executeQuery<TasksQuery, TasksQueryVariables>(GET_TASKS, vars);
     	return data?.tasks;
     }
     ```

## 6. Migrate UI Components

- Identify Svelte components currently using REST calls.
- Replace REST calls with GraphQL hooks:
  - Use `createQueryStore` for reactive queries.
  - Use `executeMutation` or `executeMutationWithOptimisticUI` for mutations.
- Pass in the `TypedDocumentNode` (e.g. `GET_TASKS`) and leverage generated types for props.

## 7. Testing & Validation

- Add or update unit/integration tests to mock GraphQL responses:
  - Use `@apollo/client/testing` utilities, or mock `executeQuery`.
- Verify data flows correctly in stories and Vitest specs.

## 8. Deprecation & Cleanup

- Once GraphQL is fully adopted, disable or remove REST endpoints on the backend.
- Remove Axios and related dependencies from `package.json`.

## 9. Next Steps

- Consider adding real-time subscriptions if needed.
- Implement caching strategies or persisted queries.
- Document GraphQL schema changes and versioning strategy.