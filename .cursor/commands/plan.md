# plan

Build a plan to implement functionality, follow these rules:

## Clarify first

- If the request is ambiguous or underspecified, output 2–3 clarifying questions; do not assume. Plan only after clarification (or state assumptions explicitly in the plan).

## Gather (MCPs) — do not skip

- **Codebase:** Narsil (get_export_map, get_symbol_definition, call graph), code-index (get_file_summary, get_symbol_body), or ts-introspect (introspect-project, introspect-package).
- **Docs:** Svelte MCP, Tailwind MCP, DaisyUI MCP (component docs when planning UI), Nostrbook, Firebase MCP — pull specs and API docs. Use **docfork** (query_docs, fetch_url) for library and API documentation by owner/repo.
- **Time:** Use **Time MCP** to get current date/time for any searches or time-sensitive assumptions so the plan is based on up-to-date information.
- **External APIs:** Cloudflare API MCP, web fetch — check endpoints when relevant.
- **Libraries:** Don't reinvent the wheel. If the requested functionality likely has a library that handles it, search for options; use doc MCPs (e.g. docfork) to confirm usage/versions.
- **Complex or uncertain scope:** Use **sequential-thinking** MCP to structure reasoning before finalizing the plan.
- Produce the plan only after gathering.

## Other MCPs (use when relevant)

- **Pickapicon-mcp:** Use for icon lookup when planning or implementing UI (icon sets, icon by description/prefix).

## Review

- Project structure, conventions, relevant code; ground the plan in what you retrieved via MCPs.
- Respect stack and constraints: Svelte 5, SvelteKit, static adapter (no server-only code), TypeScript, DaisyUI/Tailwind, Web Crypto where applicable. Check `.cursor/rules` and project docs when relevant.

## Test-driven development (TDD)

- Require test-first where practical: for each behavior or step, define the test (or acceptance criterion) before implementation; then implement until the test passes; then refactor (red–green–refactor).
- Express success criteria as testable assertions (unit tests for logic, integration tests for flows, browser/UI checks for components). Plan test files and test cases (e.g. `src/lib/tests/...`) alongside implementation steps.
- In implementation steps, sequence test-writing before or in lockstep with code: e.g. "Write failing test for X" → "Implement X to pass" → "Refactor if needed." For UI or hard-to-unit-test code, define acceptance criteria or manual/browser checks up front instead of after the fact.

## Best practices

- Ordered steps, clear dependencies; one concern per step; explicit success criteria and inputs/outputs.
- State risks, assumptions, unknowns; prefer incremental, testable milestones with working state (or easy revert) at each step.
- Cite specific files, symbols, or doc paths (e.g. `src/lib/stores/auth.store.ts`, NIP-01) instead of vague references.
- Follow project conventions: kebab-case routes, PascalCase components, camelCase variables; place new code per project structure (`src/lib/components/`, `src/lib/stores/`, etc.).
- For UI changes: include accessibility in scope (ARIA, keyboard nav, contrast) unless explicitly out of scope.
- New user-facing text → translation keys in the right locale JSON; include “Add/update translation keys” in scope and steps where relevant.
- For auth, crypto, payments, or sensitive data: call out security checklist items (encryption, input validation, no hardcoded secrets) in the plan or a short security note.
- Explicitly list what is out of scope or deferred so the plan doesn’t expand mid-implementation.

## Testing & validation

- For each implementation step, specify how to verify: unit test (`npm run test:unit`), type check (`npm run check`), browser/UI check, or manual step. Mark which steps require browser testing.
- Align with TDD: where tests come first, list "add/run test" before "implement"; otherwise require verification (run tests, type check, lint) as part of the step or immediately after.

## Recommendations

- Lead with recommended approach + brief rationale; alternatives with pros/cons if relevant.
- Recommend tools, patterns, docs when they affect the plan; flag ambiguity.

## Confidence

- Per plan and per major step: High / Medium / Low + one-line reason.
- For Medium/Low: state what would raise it (spike, POC, specific doc).

## Improving confidence

- Concrete actions for each Medium/Low item (spike, check NIP-X, stub test).
- Minimal "validate first" step when uncertain; quick validation for external systems/APIs.

## Output (PRD + implementation)

1. Context & problem (1–2 sentences)
2. Goals & success criteria (testable; state as assertions or test cases where possible)
3. Scope (in / out) — explicitly list out-of-scope or deferred
4. Approach & recommendation (+ libraries if relevant)
5. Implementation steps (dependencies, inputs/outputs; for each step: test-first where applicable — write/fail test then implement then refactor — and how to validate, e.g. `npm run test:unit`, `npm run check`, browser check)
6. Interfaces / contracts (APIs, types, events, files)
7. Edge cases & error handling (include test scenarios for critical edge cases)
8. Risks, assumptions, unknowns
9. Confidence summary (overall + top 2–3 actions to improve)
