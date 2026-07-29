---
name: Pair Programming
description: AI-assisted pair programming with multiple modes (driver/navigator/switch), real-time verification, quality monitoring, and comprehensive testing. Supports TDD, debugging, refactoring, and learning sessions. Features automatic role switching, continuous code review, security scanning, and performance optimization with truth-score verification.
---

# Pair Programming

Collaborative AI pair programming with intelligent role management, real-time quality monitoring, and comprehensive development workflows.

## What This Skill Does

This skill provides professional pair programming capabilities with AI assistance, supporting multiple collaboration modes, continuous verification, and integrated testing. It manages driver/navigator roles, performs real-time code review, tracks quality metrics, and ensures high standards through truth-score verification.

**Key Capabilities:**
- **Multiple Modes**: Driver, Navigator, Switch, TDD, Review, Mentor, Debug
- **Real-Time Verification**: Automatic quality scoring with rollback on failures
- **Role Management**: Seamless switching between driver/navigator roles
- **Testing Integration**: Auto-generate tests, track coverage, continuous testing
- **Code Review**: Security scanning, performance analysis, best practice enforcement
- **Session Persistence**: Auto-save, recovery, export, and sharing

## Session Control Commands

### Starting Sessions

Describe the session parameters to the AI:
- Choose a mode (driver, navigator, switch, tdd, review, mentor, debug)
- Define the focus area (refactor, debug, implement, optimize)
- Set verification strictness
- Choose pace

### Session Management

- Check status with `todowrite`
- Save session context to `mcp-memory` for continuity
- End session and generate summary report

## Available Modes

### Driver Mode
You write code while AI provides guidance.

**Your Responsibilities:**
- Write actual code
- Implement solutions
- Make immediate decisions
- Handle syntax and structure

**AI Navigator:**
- Strategic guidance
- Spot potential issues
- Suggest improvements
- Real-time review
- Track overall direction

**Best For:**
- Learning new patterns
- Implementing familiar features
- Quick iterations
- Hands-on debugging

### Navigator Mode
AI writes code while you provide direction.

**Your Responsibilities:**
- Provide high-level direction
- Review generated code
- Make architectural decisions
- Ensure business requirements

**AI Driver:**
- Write implementation code
- Handle syntax details
- Implement your guidance
- Manage boilerplate
- Execute refactoring

**Best For:**
- Rapid prototyping
- Boilerplate generation
- Learning from AI patterns
- Exploring solutions

### Switch Mode
Automatically alternates roles at intervals.

**Handoff Process:**
1. Warning before switch
2. Current driver completes thought
3. Context summary generated
4. Roles swap smoothly
5. New driver continues

**Best For:**
- Balanced collaboration
- Knowledge sharing
- Complex features
- Extended sessions

### Specialized Modes

**TDD Mode** — Test-Driven Development:
- Write failing test → Implement → Refactor → Repeat
- Target 90%+ coverage

**Review Mode** — Continuous code review:
- Real-time feedback, security scanning, performance analysis
- Run `npm run check` and `npm run lint` continuously

**Mentor Mode** — Learning-focused:
- Detailed explanations, step-by-step guidance, pattern teaching

**Debug Mode** — Problem-solving:
- Issue identification, root cause analysis, fix suggestions
- Use `gitnexus_query` to explore execution flows
- Use `gitnexus_impact` to check blast radius before fixes

## In-Session Commands

Request these actions from the AI:
- `/explain` — Explain current code or selection
- `/suggest` — Get improvement suggestions
- `/implement` — Request implementation (navigator mode)
- `/refactor` — Refactor selected code
- `/optimize` — Optimize code for performance
- `/document` — Add documentation to code
- `/test` — Run test suite
- `/test-gen` — Generate tests for current code
- `/review` — Perform code review
- `/security` — Security analysis
- `/perf` — Performance analysis
- `/quality` — Check code quality metrics
- `/lint` — Run linters

## Configuration

### Basic Configuration

Key settings to configure:
- Default mode and focus area
- Verification thresholds
- Testing framework (Jest, Vitest, etc.)
- Coverage minimums
- Complexity thresholds

### Quality Thresholds

**Truth Score:**
```
Error:   < 0.90
Warning: 0.90 - 0.95
Good:    0.95 - 0.98
Excellent: > 0.98
```

**Test Coverage:**
```
Error:   < 70%
Warning: 70% - 80%
Good:    80% - 90%
Excellent: > 90%
```

**Complexity:**
```
Error:   > 15
Warning: 10 - 15
Good:    5 - 10
Excellent: < 5
```

## Real-World Examples

### Example 1: Feature Implementation

Implementing user authentication with JWT tokens:

1. Choose switch mode
2. AI explains JWT authentication flow
3. AI suggests implementation approach (middleware pattern with refresh tokens)
4. You write the basic auth middleware structure
5. Switch to navigator — AI implements token generation
6. AI generates tests
7. Switch to driver — you refine the implementation
8. AI performs security review
9. Commit with quality verification

### Example 2: Bug Fixing

Debugging a memory leak:

1. Choose navigator mode with debug focus
2. AI analyzes application for memory issues
3. AI profiles performance and finds memory growth
4. Use `codebase_search` to find event emitter instances
5. AI suggests fix
6. AI generates cleanup code
7. Tests confirm memory stable
8. Commit with fix message

### Example 3: TDD Session

Building a shopping cart with test-driven development:

1. Choose TDD mode
2. RED: AI writes failing tests
3. GREEN: You write minimal code to pass
4. Tests pass
5. REFACTOR: AI refactors to repository pattern
6. Tests still pass
7. Next cycle: add new test, implement, refactor

### Example 4: Code Refactoring

Modernizing legacy code:

1. Choose driver mode with refactor focus
2. AI analyzes legacy code (complexity, coupling, lack of tests)
3. AI suggests incremental refactoring plan
4. AI generates safety-net tests for current behavior
5. You refactor with AI guidance
6. Tests confirm behavior preserved
7. AI reviews before/after comparison
8. Commit

### Example 5: Performance Optimization

Optimizing slow application:

1. Choose switch mode with performance focus
2. AI profiles and identifies slow components
3. AI suggests optimizations (memoization, virtualization)
4. You implement with AI guidance
5. AI re-profiles — 90% improvement confirmed
6. AI implements virtual scrolling
7. Re-profile — 97% improvement
8. Commit

## Best Practices

### Session Practices
1. **Clear Goals** — Define session objectives upfront
2. **Appropriate Mode** — Choose based on task type
3. **Enable Verification** — For critical code paths
4. **Regular Testing** — Run tests after each change
5. **Session Notes** — Store decisions in `mcp-memory`
6. **Regular Breaks** — Take breaks every 45-60 minutes

### Code Practices
1. **Test Early** — Run tests after each change
2. **Verify Before Commit** — Run `npm run check && npm run lint`
3. **Review Security** — Always for sensitive code
4. **Profile Performance** — Use profiling for optimization
5. **Save Sessions** — Store context in `mcp-memory` for complex work
6. **Run Impact Analysis** — Use `gitnexus_impact` before editing shared code

### Mode Selection
- **Driver Mode**: When learning, controlling implementation
- **Navigator Mode**: For rapid prototyping, generation
- **Switch Mode**: Long sessions, balanced collaboration
- **TDD Mode**: Building with tests
- **Review Mode**: Quality focus
- **Mentor Mode**: Learning priority
- **Debug Mode**: Fixing issues

### Quality Gates Before Completion

- [ ] `npm run check` passes (no type errors)
- [ ] `npm run lint` passes (no style violations)
- [ ] Targeted test suite passes
- [ ] `gitnexus_detect_changes` confirms expected scope
- [ ] Translation check if i18n keys changed: `python3 scripts/find-missing-translations.py --fix-suggestions`
