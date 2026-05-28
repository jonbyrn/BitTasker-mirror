---
name: sparc-methodology
description: SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) comprehensive development methodology with multi-agent orchestration
version: 3.0.0
category: development
tags:
  - sparc
  - tdd
  - architecture
  - orchestration
  - methodology
  - multi-agent
---

# SPARC Methodology — Comprehensive Development Framework

## Overview

SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) is a systematic development methodology. It provides 17 specialized modes for comprehensive software development, from initial research through deployment and monitoring.

## Table of Contents

1. [Core Philosophy](#core-philosophy)
2. [Development Phases](#development-phases)
3. [Available Modes](#available-modes)
4. [TDD Workflows](#tdd-workflows)
5. [Best Practices](#best-practices)
6. [Orchestration Patterns](#orchestration-patterns)

---

## Core Philosophy

SPARC methodology emphasizes:

- **Systematic Approach**: Structured phases from specification to completion
- **Test-Driven Development**: Tests written before implementation
- **Parallel Execution**: Concurrent agent coordination via the `task` tool
- **Memory Integration**: Persistent knowledge sharing across agents and sessions via `mcp-memory`
- **Quality First**: Comprehensive reviews, testing, and validation
- **Modular Design**: Clean separation of concerns with clear interfaces

### Key Principles

1. **Specification Before Code**: Define requirements and constraints clearly
2. **Design Before Implementation**: Plan architecture and components
3. **Tests Before Features**: Write failing tests, then make them pass
4. **Review Everything**: Code quality, security, and performance checks
5. **Document Continuously**: Maintain current documentation throughout

---

## Development Phases

### Phase 1: Specification
**Goal**: Define requirements, constraints, and success criteria

- Requirements analysis
- User story mapping
- Constraint identification
- Success metrics definition
- Pseudocode planning

**Key Modes**: `researcher`, `analyzer`, `memory-manager`

### Phase 2: Architecture
**Goal**: Design system structure and component interfaces

- System architecture design
- Component interface definition
- Database schema planning
- API contract specification
- Infrastructure planning

**Key Modes**: `architect`, `designer`, `orchestrator`

### Phase 3: Refinement (TDD Implementation)
**Goal**: Implement features with test-first approach

- Write failing tests
- Implement minimum viable code
- Make tests pass
- Refactor for quality
- Iterate until complete

**Key Modes**: `tdd`, `coder`, `tester`

### Phase 4: Review
**Goal**: Ensure code quality, security, and performance

- Code quality assessment
- Security vulnerability scanning
- Performance profiling
- Best practices validation
- Documentation review

**Key Modes**: `reviewer`, `optimizer`, `debugger`

### Phase 5: Completion
**Goal**: Integration, deployment, and monitoring

- System integration
- Deployment automation
- Monitoring setup
- Documentation finalization
- Knowledge capture

**Key Modes**: `workflow-manager`, `documenter`, `memory-manager`

---

## Available Modes

### Core Orchestration Modes

#### `orchestrator`
Multi-agent task orchestration with task tracking and memory coordination.

**Capabilities**:
- Task decomposition into manageable units
- Agent coordination and resource allocation via `task` tool
- Progress tracking and result synthesis
- Adaptive strategy selection
- Cross-agent communication via `mcp-memory`

#### `swarm-coordinator`
Specialized swarm management for complex multi-agent workflows.

**Capabilities**:
- Topology optimization (mesh, hierarchical, ring, star)
- Agent lifecycle management via `task` tool
- Dynamic scaling based on workload
- Fault tolerance and recovery
- Performance monitoring

#### `workflow-manager`
Process automation and workflow orchestration.

**Capabilities**:
- Workflow definition and execution
- Event-driven triggers
- Sequential and parallel pipelines
- State management
- Error handling and retry logic

#### `batch-executor`
Parallel task execution for high-throughput operations.

**Capabilities**:
- Concurrent file operations
- Batch processing optimization
- Resource pooling
- Load balancing
- Progress aggregation

---

### Development Modes

#### `coder`
Autonomous code generation with batch file operations.

**Capabilities**:
- Feature implementation
- Code refactoring
- Bug fixes and patches
- API development
- Algorithm implementation

**Quality Standards**:
- ES2022+ standards
- TypeScript type safety
- Comprehensive error handling
- Performance optimization
- Security best practices

#### `architect`
System design with Memory-based coordination.

**Capabilities**:
- Microservices architecture
- Event-driven design
- Domain-driven design (DDD)
- Hexagonal architecture
- CQRS and Event Sourcing

**Memory Integration**:
- Store architectural decisions via `mcp-memory`
- Share component specifications
- Maintain design consistency
- Track architectural evolution

**Design Patterns**:
- Layered architecture
- Microservices patterns
- Event-driven patterns
- Domain modeling
- Infrastructure as Code

#### `tdd`
Test-driven development with comprehensive testing.

**Capabilities**:
- Test-first development
- Red-green-refactor cycle
- Test suite design
- Coverage optimization (target: 90%+)
- Continuous testing

**TDD Workflow**:
1. Write failing test (RED)
2. Implement minimum code
3. Make test pass (GREEN)
4. Refactor for quality (REFACTOR)
5. Repeat cycle

**Testing Strategies**:
- Unit testing (Jest, Mocha, Vitest)
- Integration testing
- End-to-end testing (Playwright, Cypress)
- Performance testing
- Security testing

#### `reviewer`
Code review using batch file analysis.

**Capabilities**:
- Code quality assessment
- Security vulnerability detection
- Performance analysis
- Best practices validation
- Documentation review

**Review Criteria**:
- Code correctness and logic
- Design pattern adherence
- Comprehensive error handling
- Test coverage adequacy
- Maintainability and readability
- Security vulnerabilities
- Performance bottlenecks

---

### Analysis and Research Modes

#### `researcher`
Deep research with parallel web searches and memory coordination.

**Capabilities**:
- Comprehensive information gathering
- Source credibility evaluation
- Trend analysis and forecasting
- Competitive research
- Technology assessment

**Memory Integration**:
- Store research findings via `mcp-memory`
- Build knowledge graphs
- Track information sources
- Cross-reference insights
- Maintain research history

#### `analyzer`
Code and data analysis with pattern recognition.

**Capabilities**:
- Static code analysis
- Dependency analysis
- Performance profiling
- Security scanning
- Data pattern recognition

#### `optimizer`
Performance optimization and bottleneck resolution.

**Capabilities**:
- Algorithm optimization
- Database query tuning
- Caching strategy design
- Bundle size reduction
- Memory leak detection

---

### Creative and Support Modes

#### `designer`
UI/UX design with accessibility focus.

**Capabilities**:
- Interface design
- User experience optimization
- Accessibility compliance (WCAG 2.1)
- Design system creation
- Responsive layout design

#### `innovator`
Creative problem-solving and novel solutions.

**Capabilities**:
- Brainstorming and ideation
- Alternative approach generation
- Technology evaluation
- Proof of concept development
- Innovation feasibility analysis

#### `documenter`
Comprehensive documentation generation.

**Capabilities**:
- API documentation (OpenAPI/Swagger)
- Architecture diagrams
- User guides and tutorials
- Code comments and JSDoc
- README and changelog maintenance

#### `debugger`
Systematic debugging and issue resolution.

**Capabilities**:
- Bug reproduction
- Root cause analysis
- Fix implementation
- Regression prevention
- Debug logging optimization

#### `tester`
Comprehensive testing beyond TDD.

**Capabilities**:
- Test suite expansion
- Edge case identification
- Performance testing
- Load testing
- Chaos engineering

#### `memory-manager`
Knowledge management and context preservation.

**Capabilities**:
- Cross-session memory persistence via `mcp-memory`
- Knowledge graph construction
- Context restoration
- Learning pattern extraction
- Decision tracking

---

## Orchestration Patterns

### Pattern 1: Hierarchical Coordination

**Best for**: Complex projects with clear delegation hierarchy

Use the `task` tool to spawn a coordinator agent and specialized worker agents (architect, coder, tester, reviewer) with a hierarchical structure. The coordinator delegates subtasks, and workers report results back.

### Pattern 2: Mesh Coordination

**Best for**: Collaborative tasks requiring peer-to-peer communication

Spawn multiple agents via `task` and coordinate using `mcp-memory` for shared state. All agents communicate directly through the shared memory store.

### Pattern 3: Sequential Pipeline

**Best for**: Ordered workflow execution (spec → design → code → test → review)

Execute modes sequentially where each phase completes before the next begins. Use `mcp-memory` to pass context between pipeline stages.

### Pattern 4: Parallel Execution

**Best for**: Independent tasks that can run concurrently

Use the `task` tool with `run_in_background: true` to execute independent subtasks in parallel. Use `todowrite` for dependency tracking and coordination.

### Pattern 5: Adaptive Strategy

**Best for**: Dynamic workloads with changing requirements

Auto-adjust agent allocation based on workload. Use `mcp-memory_memory_search` before starting to check for prior patterns and adapt strategy accordingly.

---

## TDD Workflows

### Complete TDD Workflow

1. **Research and Planning**: Use researcher mode to gather requirements and testing best practices
2. **Architecture Design**: Use architect mode to design testable architecture
3. **TDD Implementation**: Write failing tests, implement minimal code, refactor — target 90% coverage
4. **Code Review**: Reviewer mode with test coverage and security checks
5. **Optimization**: Optimizer mode for performance tuning

### Red-Green-Refactor Cycle

1. **RED**: Write a failing test that defines expected behavior
2. **GREEN**: Write minimal code to make the test pass
3. **REFACTOR**: Clean up code while keeping tests green
4. **Edge Cases**: Add tests for boundaries, nulls, errors, and platform variance
5. **Repeat**: Continue until all acceptance criteria are met

---

## Best Practices

### 1. Memory Integration

**Always use `mcp-memory` for cross-agent coordination**:

- Store architectural decisions with `mcp-memory_memory_store`
- Retrieve context with `mcp-memory_memory_search`
- Harvest learnings with `mcp-memory_memory_harvest`

### 2. Parallel Operations

**Batch all related operations in a single message**:

Spawn multiple `task` agents simultaneously in one message with `run_in_background: true`. Use `todowrite` to track progress across parallel tasks.

### 3. Test Coverage

**Maintain minimum 90% coverage**:

- Unit tests for all functions
- Integration tests for APIs
- E2E tests for critical flows
- Edge case coverage
- Error path testing

### 4. Documentation

**Document as you build**:

- API documentation (OpenAPI)
- Architecture decision records (ADR)
- Code comments for complex logic
- README with setup instructions
- Changelog for version tracking

### 5. File Organization

**Never save to root folder**:

```
project/
├── src/           # Source code
├── tests/         # Test files
├── docs/          # Documentation
├── config/        # Configuration
├── scripts/       # Utility scripts
└── examples/      # Example code
```

### 6. Edge Case Checklist

Before considering code complete, verify:

- [ ] Empty state (no data / empty list / null)
- [ ] Loading state (data fetching / async operation in progress)
- [ ] Error state (API failure / network error / invalid data)
- [ ] Boundary values (max length, zero, negative, overflow)
- [ ] Platform variance (web vs iOS vs Android behavior differences)
- [ ] Memory: searched for prior patterns before starting (`mcp-memory_memory_search`)

---

## Confidence Checklist (per change)

Before shipping code, confirm:

- [ ] Types: `npm run check` passes with zero errors
- [ ] Style: `npm run lint` passes with zero warnings
- [ ] Tests: targeted test suite passes
- [ ] Coverage: new code has tests; uncovered lines are intentional and justified
- [ ] Memory: `mcp-memory_memory_search` checked before start; `mcp-memory_memory_store` saved key learnings after completion

---

Remember: **SPARC = Systematic, Parallel, Agile, Refined, Complete**
