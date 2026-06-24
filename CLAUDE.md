# BitTasker — Claude Code Configuration

## Project Identity

- **SvelteKit 5 + Capacitor** — cross-platform app (iOS, Android, PWA). Code runs on both web and native; Capacitor plugin calls (camera, location, notifications, clipboard) must be guarded with platform checks. Use `@capacitor/core` for device APIs.
- **Nostr** (NDK v3, nostr-tools, @nostr-dev-kit/\*) — identity, events, DMs, wallet
- **Bitcoin/Lightning** — boltz.exchange swaps, Rootstock (RSK) smart contracts, bolt11 invoices, liquidjs-lib (Cashu is a dependency but not actively used)
- **Tailwind CSS 4 + daisyUI** — UI components and theming
- **Cloudflare Workers** — backend via wrangler deploy
- **Firebase** — push notifications; **Sentry** — error tracking
- **Chart.js** — analytics; **svelte-i18n** — en/es localization
- **Storybook** — component library; **Playwright** — e2e tests; **Vitest** — unit tests
- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (\*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning agents — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER disable ESLint or TypeScript rules (`eslint-disable`, `ts-ignore`, `ts-expect-error`, `as any`). These rules exist to enforce quality and safety. Instead of suppressing them, fix the underlying issue: implement proper types, use correct imports, or refactor the code to satisfy the compiler statically.
- NEVER checkout or reset git without stashing changes first. There may be unsaved work; do NOT destroy it

## Thinking Methodology (Always Enforced)

Before making any decision, implementation, or change, follow this process:

1. **Analyze the full context** — Read entire files, not chunks. Look at the bigger picture, trace dependencies, and account for related features. If the task touches reviews, understand contracts. If it touches contracts, understand payments. Build a complete mental model before acting.

2. **Deep think, don't jump to conclusions** — Do not make assumptions. Do not make premature optimizations. Do not trust the first answer that seems right. Sit with the problem until the shape of the solution is clear.

3. **Verify, don't trust** — Code and documentation in this project may be outdated, incorrect, or unaware of the full context. Always verify against the actual source. Read the files yourself. Check git history if relevant. Corroborate claims across multiple sources.

4. **Iterate to ≥95% confidence** — Do not make decisions, implement, or declare completion until you have at least 95% confidence in your analysis. If you are uncertain, gather more context, run more tests, or ask clarifying questions. Confidence comes from verification, not from intuition.

5. **Review and iterate again** — Once you reach a final state, review the implementation. Take feedback seriously. Iterate from step 1 again until the implementation is correct and complete.

## File Organization

- NEVER save to root folder — use the directories below
- Use `/src` for source code files
- Use `/tests` for test files
- Use `/docs` for documentation and markdown files
- Use `/config` for configuration files
- Use `/scripts` for utility scripts
- Use `/examples` for example code

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries

### Project Config

- **Memory**: mcp-memory
- **HNSW**: Enabled
- **Neural**: Enabled

## Build & Test

```bash
npm run dev          # Dev server (port 3000)
npm run build        # Production build (sync + vite + robots + sitemap) — SLOW, only run when needed
npm run test         # Full vitest suite — SLOW, prefer targeted tests first
npm run test:ci      # CI test suite (unit + integration + components)
npm run test:e2e     # Playwright e2e tests
npm run lint         # Prettier + ESLint
npm run check        # svelte-check type validation
npm run storybook    # Storybook dev server (port 6006)
```

- **Do NOT run `npm run build` for isolated changes** (single component, utility, or type edit). Use `npm run check` + `npm run lint` for fast validation.
- **In multi-agent work: defer `npm run build` to the final integration step** — it serializes all of SvelteKit and is the slowest command in the pipeline.
- **Do NOT run `npm run test` (full suite) first.** Use targeted commands: `npm run test:unit:components`, `npm run test:unit:stores`, `npm run test:unit:api`, etc. Run the full suite only after targeted tests pass.
- Always run `npm run check` after TypeScript changes — catches type errors without a full build.
- **Before committing when i18n keys have changed**: run `python3 scripts/find-missing-translations.py --fix-suggestions` to detect missing or mismatched translation keys. Fix all issues before committing.

## Behavioral Rules

- Do exactly what is asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create \*.md or README files unless explicitly requested
- NEVER save to root folder
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER use `--no-verify` when committing or pushing — fix the underlying hook failure instead
- ALWAYS create NEW commits (never amend) unless explicitly asked
- ALWAYS run translation verification before committing when i18n keys have been added or modified

## Project Structure

```
src/lib/
├── components/     # Svelte UI components (organized by feature domain)
├── services/       # API and data service layer
├── stores/         # Svelte runes and stores
├── utils/          # Shared utilities (nostr, wallet, search, etc.)
├── types/          # TypeScript type definitions (*.d.ts)
├── api/            # API endpoint handlers
├── nostr/          # Nostr integration logic
├── i18n/           # Internationalization setup
├── data/           # Static data and constants
├── mocks/          # Test mocks
├── tests/          # Test suites
└── polyfills.ts    # Browser polyfills

src/routes/         # SvelteKit file-based routing
static/locales/     # i18n translation files (en, es)
```

## Concurrency Rule: 1 MESSAGE = ALL RELATED OPERATIONS

- Batch ALL file reads/writes/edits in ONE message
- Batch ALL Bash commands in ONE message
- Batch ALL agent spawns in ONE message with `run_in_background: true`
- After spawning agents: STOP — do NOT poll or check status
- When agent results arrive: review ALL before proceeding

## Multi-Agent Orchestration

For complex work, spawn specialized agents via the `task` tool for parallel multi-agent execution. Use the `task` tool to dispatch work items that run concurrently.

### Key Tool Reference

| Trigger                                  | Tool                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| **MANDATORY: before starting any task**  | `mcp-memory_memory_search` — check for prior patterns |
| **MANDATORY: after completing any task** | `mcp-memory_memory_store` — save learnings            |
| Multi-agent coordination                 | `task` tool — spawn parallel subagents                |
| Before any edit                          | `gitnexus_impact` — blast radius check                |
| Before committing                        | `gitnexus_detect_changes` — verify affected scope     |

## Security

- NEVER hardcode API keys, secrets, or credentials
- NEVER commit .env files or any file containing secrets
- Validate user input at system boundaries; sanitize file paths
- Never log, store, or expose nsec private keys, mnemonics, or seed phrases in code or logs

## Domain Skills

**Before starting any task, check `.claude/skills/` for applicable skills.** Available skills are discoverable by listing the directory. Key project skills:

- **Nostr development** — `/bittasker-nostr` — NDK, Nostr events, relays, NIPs, DMs, wallet, production reliability
- **Wallet & payments** — `/bittasker-wallet` — boltz.exchange swaps, bolt11 invoices, transaction safety, fee handling
- **i18n workflow** — `/bittasker-i18n` — adding user-facing strings, locale files
- **E2E testing** — `/bittasker-e2e` — Playwright tests, UI verification
- **Svelte 5 runes** — `/svelte-runes` — $state, $derived, $effect, $props, $bindable
- **SvelteKit data flow** — `/sveltekit-data-flow` — load functions, form handling (client-only)
- **SvelteKit structure** — `/sveltekit-structure` — routing, layouts, error boundaries
- **Frontend design** — `/frontend-design` — polished UI, typography, color, motion
- **TDD** — `/test-driven-development` — strict Red-Green-Refactor cycle
- **Capacitor testing** — `/capacitor-testing` — platform mocking, native plugin tests
- **Code exploration** — `/gitnexus-exploring` — trace execution flows, understand architecture
- **Impact analysis** — `/gitnexus-impact-analysis` — blast radius check before editing
- **Safe refactoring** — `/gitnexus-refactoring` — renames, extracts, restructures
- **Debugging** — `/gitnexus-debugging` — systematic bug tracing
- **UI audit** — `/web-design-guidelines` — accessibility, forms, touch, i18n, performance checks
- **Webapp testing** — `/webapp-testing` — Playwright scripts, server lifecycle, DOM inspection
- **Find skills** — `/find-skills` — discover community skills via npx skills CLI + skills.sh
- **Skill creator** — `/skill-creator` — create, modify, and benchmark project skills
- **Swarm orchestration** — `/swarm-orchestration` — multi-agent coordination, parallel execution, topology management
- **Advanced swarm** — `/swarm-advanced` — complex distributed workflows, research swarms, testing swarms

## Production Code Quality

### Deterministic Programming

- Every function must have a single, predictable return path for a given input — avoid randomness and implicit state
- Prefer pure functions; isolate side effects (API calls, store writes, Capacitor plugins) to dedicated modules
- Never rely on execution order of async operations that are not explicitly chained — race conditions are the #1 source of bugs in this codebase
- Svelte stores and runes must have a single source of truth — don't duplicate derived state across stores

### Defensive Practices

- **Validate at every boundary**: API responses, URL parameters, user input, Capacitor plugin return values — assume they are malformed until validated
- **Null/undefined handling**: Every nullable value must be checked before access. Use optional chaining (`?.`) and nullish coalescing (`??`) aggressively. Never assume data exists.
- **Type safety**: Use project types from `src/lib/types/`. Never use `any` — use `unknown` + type guards instead. Run `npm run check` after type changes.
- **Platform guards**: Code runs on both web and native (iOS/Android). Always guard Capacitor plugin calls:
  ```typescript
  const isNative = Capacitor.isNativePlatform();
  const isAvailable = Capacitor.isPluginAvailable('PluginName');
  ```
- **Browser guards**: All `svelte-i18n`, `fetch`, DOM, and localStorage access must be wrapped in `if (browser)` checks. The app may render server-side.
- **Error handling**: Every async operation (fetch, plugin call, store write) must have error handling — never let a Promise rejection go uncaught. Use `tryCatch()` from `src/lib/utils/tryCatch.ts`.
- **Silent failures are bugs**: If an operation fails, either surface the error to the user via a toast/alert, or log it to Sentry. Never `catch (e) {}` with an empty block.
- **Sentry breadcrumbs**: Log key user actions (navigation, auth state change, wallet operation, Nostr event publish) as Sentry breadcrumbs for debugging production issues. Use `Sentry.addBreadcrumb()` — this is a Capacitor app with no server-side logs, so breadcrumbs are the primary debugging tool
- **Network awareness**: Always check `navigator.onLine` and the app's `network-status.ts` store before initiating network operations. Show offline UI when unavailable — never silently fail. This is a mobile app; offline is normal
- **App lifecycle**: Respect Capacitor app lifecycle events (pause/resume). Pause subscriptions and polling when the app backgrounds. Resume and refresh data when the app returns to foreground
- **Deep links**: All deep link handlers must validate the incoming URL before routing. Never navigate to an unvalidated deep link path — see `src/lib/utils/deep-link.ts`

### Svelte 5 Specific

- This project uses **Svelte 5** with runes (`$state`, `$derived`, `$effect`, `$props`)
- **Full rune decision tree**: See `.ai-rules/svelte-runes.md` — shared across all AI tools
- `$state` for mutable reactive state; `$derived` / `$derived.by` for pure computed values
- `$effect` is an **escape hatch** for unavoidable side effects only (DOM, third-party libs, browser APIs). Per the official Svelte docs: *"you should NOT update state inside effects"* and `$effect` is *"best considered something of an escape hatch — rather than a tool you should use frequently"*
- NEVER use `$effect` to derive or sync one value from another — use `$derived`
- Prefer `$state` in `.svelte.ts` files over writable/readable stores for shared state
- In `.svelte` files use `$storeName` auto-subscribe — never manual `.subscribe()`
- Do NOT use legacy Svelte 4 patterns (`$:`, `export let`, `on:click`) — use `$state`, `$props`, `onclick` instead
- Always run `mcp__svelte__svelte-autofixer` after writing any .svelte file to catch version mismatches

### Edge Case Checklist

Before considering code complete, verify:

- [ ] Empty state (no data / empty list / null)
- [ ] Loading state (data fetching / async operation in progress)
- [ ] Error state (API failure / network error / invalid data)
- [ ] Boundary values (max length, zero, negative, overflow)
- [ ] Platform variance (web vs iOS vs Android behavior differences)
- [ ] **Memory**: searched for prior patterns before starting (`mcp-memory_memory_search`)

## Automated Testing

Testing must produce **95%+ confidence** that the implementation is correct. Untested code is assumed broken.

### TDD Workflow

1. **Red** — write a failing test that defines the expected behavior
2. **Green** — write the minimal code to make it pass
3. **Refactor** — clean up while keeping tests green
4. **Edge cases** — add tests for boundaries, nulls, errors, and platform variance

### Test Layers (Inner → Outer)

| Layer                      | Tool                               | What to test                                                                     | Confidence gain                         |
| -------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------- |
| Pure functions & utilities | Vitest                             | Input/output, edge cases, error paths                                            | Foundation — every util must be covered |
| Stores & runes             | Vitest + `@testing-library/svelte` | State transitions, subscriptions, derived values                                 | Core logic correctness                  |
| Components                 | Vitest + `@testing-library/svelte` | Render states (empty/loading/error/populated), user interactions, event dispatch | UI behavior                             |
| Integration                | Vitest                             | Service + store interplay, data flow, error propagation                          | System wiring                           |
| E2E                        | Playwright                         | Critical user journeys, multi-page flows, real browser behavior                  | Real-world confidence                   |

### Testing Rules

- **Pure functions MUST be tested** — they are the foundation. No exceptions.
- **New components MUST have tests** covering all 5 states (empty, loading, error, populated, edge case)
- **Mock at boundaries**: API calls, Capacitor plugins, Nostr relays, NDK — use vitest mocks or `src/lib/mocks/`
- **Use `tryCatch()`** from `src/lib/utils/tryCatch.ts` for error handling in tests — it returns `{ data, error }` tuples
- **Run targeted tests first**: `npm run test:unit:components`, `npm run test:unit:stores`, etc. Full suite (`npm run test` / `npm run test:ci`) only after targeted tests pass
- **Before committing**: at minimum, run targeted tests for the changed area. Run `npm run check` for type safety
- **Before marking work complete**: run `npm run test:ci` and verify all tests pass

### Confidence Gate

Mark code as complete only when:

- [ ] All new pure functions have unit tests with 90%+ branch coverage
- [ ] All new components have tests covering 5 states (empty/loading/error/populated/edge)
- [ ] Integration tests cover the happy path + 2 failure paths
- [ ] `npm run check` passes (no type errors)
- [ ] `npm run lint` passes (no style violations)
- [ ] Targeted test suite passes (`npm run test:unit:components`, etc.)
- [ ] E2E tests pass for any changed user flows (`npm run test:e2e`)
- [ ] **Memory stored**: learnings, patterns, and key decisions saved via `mcp-memory_memory_store`

## High-Confidence Code

Code the AI ships must be **functional, low-bug, and provide good UX**. Low confidence = more review cycles, more bugs, less trust.

### Confidence is Built Through Verification

- **The AI's internal confidence is worthless without test evidence.** Every claim of correctness must be backed by a passing test or a verified type check.
- **Uncertainty must be surfaced, not hidden.** If the AI cannot verify a code path (e.g., third-party API behavior, Capacitor plugin on real device), it must flag it with an explicit caveat rather than assuming it works.
- **Never guess at API signatures.** Use `mcp__ts-introspect__*` or read the source. A wrong function signature cascades into multiple bugs.

### Functional Correctness

- Every conditional branch must have a test exercising it — untested branches are latent bugs
- State machines (auth flows, task lifecycle, wallet transactions) must have tests for every valid transition AND at least one invalid transition
- Async operations must test: success, network failure, timeout, and invalid response shapes

### Low-Bug Practices

- **Minimize mutable state** — every `$state()` variable is a potential source of inconsistency. Prefer `$derived()` over manual state syncing
- **Single-writer principle** — each store/state variable should have exactly one module that writes to it. Multiple writers = race conditions
- **Validate early, fail fast** — validate inputs at the boundary (API response, user input, URL param) before they propagate into application state
- **Prefer exhaustive checks** — use TypeScript's `never` type for switch statements over discriminated unions to catch missing cases at compile time

### Component Management

- **ALWAYS search before creating**. Use these tools in order:
  1. `mcp__gitnexus__query({query: "component purpose or concept"})` — semantic search, finds components by what they DO, not name
  2. `mcp__code-index__search_code_advanced({pattern: "export function\|class\|interface", file_pattern: "*.svelte"})` — indexed code search, faster than raw grep
  3. `Glob` / `Grep` — fallback only if indexed search misses
- Duplicating an existing component is worse than creating a new one — it fragments patterns and doubles maintenance
- Common generic components live at the top level of `src/lib/components/` (Modal, Toast, Input, etc.); feature-specific components are in subdirectories (task/, wallet/, nostr/, etc.)
- **Reuse over rebuild**: if a component does 80% of what's needed, extend it with props rather than cloning it. Prefer composition (slot children, prop-driven variants) over forking
- **Storybook exists**: run `npm run storybook` to browse existing components visually before building new ones
- **New components** go in the correct feature subdirectory (`src/lib/components/task/`, `src/lib/components/wallet/`, etc.) or at top-level if truly generic
- **Keep components focused**: one component = one responsibility. Extract sub-components when a file exceeds ~200 lines or handles multiple concerns

### UI/UX Quality

- **Every interactive element must have**: a loading indicator during async actions, disabled state while in progress, error feedback on failure
- **Consistent with existing patterns** — match the component patterns in `src/lib/components/`. Don't invent new UX patterns when one already exists
- **Accessible (WCAG AA minimum)**: form inputs need labels, buttons need accessible names, interactive elements need visible focus indicators. Every new component must pass keyboard navigation (Tab/Enter/Escape). Modals must trap focus. Use semantic HTML by default. Run `/web-design-guidelines` for systematic audits. Test with screen reader before shipping user-facing changes
- **Use daisyUI + Tailwind CSS 4** for styling:
  - daisyUI components are the primary building blocks — `btn`, `card`, `modal`, `badge`, `input`, `select`, `textarea`, `table`, `tabs`, `collapse`, `drawer`, `dropdown`, `menu`, `navbar`, `toast`, `tooltip`, `avatar`, `divider`, `loading`, `skeleton`, `carousel`, `countdown`, `kbd`, `stat`, `steps`, `swap`, `timeline`, `chat`, `diff`, `fieldset`, `status`, `checkbox`, `radio`, `range`, `rating`, `file-input`, `label`, `toggle`, `validator`
  - daisyUI theme colors are defined in `tailwind.config` — use semantic classes (`btn-primary`, `btn-secondary`, `bg-base-100`, `text-base-content`) not hardcoded hex values
  - Tailwind utility classes for spacing, layout, and one-off adjustments — `flex`, `gap-4`, `p-6`, `rounded-lg`, `shadow-md`, `w-full`, `text-sm`
  - **No inline styles** (`style=""`) — they break daisyUI theme consistency and can't be themed
  - **No custom CSS files** — use Tailwind config or daisyUI theme variables for new design tokens
  - **Responsive**: use Tailwind breakpoints (`sm:`, `md:`, `lg:`, `xl:`) — this is a mobile-first Capacitor app
- **i18n-ready**: every user-visible string uses `$t()`. Run `python3 scripts/find-missing-translations.py --fix-suggestions` and fix all issues before committing. See `/bittasker-i18n` skill

### Confidence Checklist (per change)

Before shipping code, the AI must confirm:

- [ ] Types: `npm run check` passes with zero errors
- [ ] Style: `npm run lint` passes with zero warnings
- [ ] Tests: targeted test suite passes; `npm run test:ci` for multi-file changes
- [ ] Coverage: new code has tests; uncovered lines are intentional and justified
- [ ] UX audit: matches existing patterns, handles all 5 states, accessible, i18n'd, translations verified (`find-missing-translations.py`)
- [ ] GitNexus: `detect_changes` confirms only expected symbols affected
- [ ] Unsure paths flagged: any unverified behavior explicitly noted to the user
- [ ] **Memory**: `memory_search` checked before start; `memory_store` saved key learnings after completion

### Svelte (mcp**svelte**\*)

**When:** Writing or editing ANY .svelte file, using SvelteKit APIs, or creating components.

- `list-sections` — discover available docs
- `get-documentation` — fetch Svelte 5 / SvelteKit docs
- `svelte-autofixer` — **MUST use** after writing any .svelte file; re-run until clean
- `playground-link` — only if user confirms

### GitNexus (mcp**gitnexus**\*)

**When:** Before editing ANY function/class/method, before committing, or exploring unfamiliar code.

- **MUST run `impact` before editing any symbol** — report blast radius and risk level
- **MUST run `detect_changes` before committing** — verify affected scope
- **NEVER ignore HIGH or CRITICAL risk** from impact analysis
- Use `query` for execution flow discovery; use `context` for 360° symbol view
- Never rename with find-and-replace — use `gitnexus_rename`

### NostrBook (mcp**nostrbook**\*) — See `/bittasker-nostr` skill for full Nostr workflow

### Playwright (mcp**plugin_playwright_playwright**\*) — See `/bittasker-e2e` skill for full e2e workflow

### Additional MCP Servers

- `mcp__ts-introspect__*` — TypeScript type exploration. **When:** exploring unfamiliar types, checking package exports, or validating type signatures.
- `mcp__ddg-search__*` — web search. **When:** looking up current docs, debugging errors, or researching APIs.
- `mcp__pickapicon-mcp__*` — icon finder. **When:** adding icons to UI (project uses iconify-icon/mdi).
- `mcp__code-index__*` — symbol search. **When:** finding function definitions, file lookups by name pattern.

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **BitTasker** (42278 symbols, 78720 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource                                   | Use for                                  |
| ------------------------------------------ | ---------------------------------------- |
| `gitnexus://repo/BitTasker/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/BitTasker/clusters`       | All functional areas                     |
| `gitnexus://repo/BitTasker/processes`      | All execution flows                      |
| `gitnexus://repo/BitTasker/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
