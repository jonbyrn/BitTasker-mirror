---
name: swarm-advanced
description: Advanced swarm orchestration patterns for research, development, testing, and complex distributed workflows
version: 3.0.0
category: orchestration
tags: [swarm, distributed, parallel, research, testing, development, coordination]
---

# Advanced Swarm Orchestration

Master advanced swarm patterns for distributed research, development, and testing workflows. This skill covers comprehensive orchestration strategies using the `task` tool for parallel agent execution and `mcp-memory` for shared state coordination.

## Quick Start

### Basic Pattern

1. Plan your swarm topology (mesh, hierarchical, star, ring)
2. Spawn specialized agents using the `task` tool with `run_in_background: true`
3. Coordinate via `mcp-memory` for shared state
4. Track progress with `todowrite`

## Core Concepts

### Swarm Topologies

**Mesh Topology** — Peer-to-peer communication, best for research and analysis
- All agents communicate directly via shared memory
- High flexibility and resilience
- Use for: Research, analysis, brainstorming

**Hierarchical Topology** — Coordinator with subordinates, best for development
- Clear command structure
- Sequential workflow support
- Use for: Development, structured workflows

**Star Topology** — Central coordinator, best for testing
- Centralized control and monitoring
- Parallel execution with coordination
- Use for: Testing, validation, quality assurance

**Ring Topology** — Sequential processing chain
- Step-by-step processing
- Pipeline workflows
- Use for: Multi-stage processing, data pipelines

### Agent Strategies

**Adaptive** — Dynamic adjustment based on task complexity
**Balanced** — Equal distribution of work across agents
**Specialized** — Task-specific agent assignment
**Parallel** — Maximum concurrent execution

## Pattern 1: Research Swarm

### Purpose
Deep research through parallel information gathering, analysis, and synthesis.

### Architecture
Initialize with mesh topology. Spawn research agents as background tasks:
- Web Researcher: web-search, content-extraction, source-validation
- Academic Researcher: paper-analysis, citation-tracking, literature-review
- Data Analyst: data-processing, statistical-analysis, visualization
- Pattern Analyzer: trend-detection, correlation-analysis, outlier-detection
- Report Writer: synthesis, technical-writing, formatting

### Research Workflow

#### Phase 1: Information Gathering
Spawn parallel research agents via `task` tool. Each agent focuses on a different source type (web, academic, datasets, expert sources). Store findings in `mcp-memory` with a shared namespace.

#### Phase 2: Analysis and Validation
Use pattern recognition on aggregated findings. Assess source quality (credibility, relevance, recency, authority). Cross-validate across sources. Store validated findings back to memory.

#### Phase 3: Knowledge Management
Search existing knowledge base via `mcp-memory_memory_search`. Create knowledge graph connections between findings. Store connections for future sessions with appropriate TTL.

#### Phase 4: Report Generation
Orchestrate report generation sequentially (gather → analyze → validate → synthesize). Monitor progress via `todowrite`. Generate final comprehensive report.

## Pattern 2: Development Swarm

### Purpose
Full-stack development through coordinated specialist agents.

### Architecture
Initialize with hierarchical topology. Spawn development team agents:
- System Architect (coordinator)
- Backend Developer: node, api, database
- Frontend Developer: ui, ux
- Database Engineer: sql, nosql, optimization
- QA Engineer: unit, integration, e2e
- Code Reviewer: security, performance, best-practices
- Technical Writer: api-docs, guides, tutorials
- DevOps Engineer: ci-cd, deployment, monitoring

### Development Workflow

#### Phase 1: Architecture and Design
System architect designs architecture. Store architecture decisions in `mcp-memory` under a `development/design` namespace.

#### Phase 2: Parallel Implementation
Spawn backend, frontend, database, and documentation agents in parallel via `task` tool. Monitor progress via `todowrite`.

#### Phase 3: Testing and Validation
Run comprehensive testing: unit, integration, e2e, and performance tests. Assess code quality (coverage, complexity, maintainability, security).

#### Phase 4: Review and Deployment
Code review workflow. CI/CD pipeline stages: build, test, security-scan, deploy.

## Pattern 3: Testing Swarm

### Purpose
Comprehensive quality assurance through distributed testing.

### Architecture
Initialize with star topology. Spawn testing team agents:
- Unit Test Coordinator: unit-testing, mocking, coverage, tdd
- Integration Tester: integration, api-testing, contract-testing
- E2E Tester: e2e, ui-testing, user-flows
- Performance Tester: load-testing, stress-testing, benchmarking
- Security Tester: security-testing, penetration-testing, vulnerability-scanning
- Test Analyst: coverage-analysis, test-optimization, reporting
- Test Documenter: test-documentation, test-plans, reports

### Testing Workflow

#### Phase 1: Test Planning
Analyze test coverage requirements (line, branch, function, edge-cases). Identify test scenarios (edge-case, boundary-condition, error-path, happy-path). Store test plan in `mcp-memory`.

#### Phase 2: Parallel Test Execution
Execute all test suites in parallel via `task` tool: unit, integration, e2e, performance, and security tests. Batch process test suites.

#### Phase 3: Performance and Security
Run performance benchmarks. Analyze bottlenecks (response-time, throughput, memory, cpu). Security scanning and vulnerability analysis.

#### Phase 4: Monitoring and Reporting
Monitor tests in real-time via `todowrite`. Generate comprehensive test report. Track trends over time.

## Pattern 4: Analysis Swarm

### Purpose
Deep code and system analysis through specialized analyzers.

### Architecture
Initialize with mesh topology. Spawn analysis specialists:
- Code Analyzer: static-analysis, complexity-analysis, dead-code-detection
- Security Analyzer: security-scan, vulnerability-detection, dependency-audit
- Performance Analyzer: profiling, bottleneck-detection, optimization
- Architecture Analyzer: dependency-analysis, coupling-detection, modularity-assessment
- Analysis Reporter: reporting, visualization, recommendations

### Analysis Workflow
Spawn parallel analysis tasks (code, security, performance, architecture) via `task` tool. Generate comprehensive analysis report. Perform cost analysis over time.

## Advanced Techniques

### Error Handling and Fault Tolerance

When agents fail, check swarm health via `todowrite`. Analyze error patterns. Retry with adjusted strategy (sequential fallback for failed parallel tasks). Implement auto-recovery patterns.

### Memory and State Management

- Cross-session persistence via `mcp-memory_memory_store`
- Namespace management for different swarms
- Create state snapshots via `mcp-memory_memory_store_session`
- Restore from snapshots when needed

### Workflow Automation

Create reusable workflows as documented patterns. Set up automation rules (file-changed → run-tests, PR-created → code-review-swarm). Event-driven triggers.

### Monitoring and Metrics

- Monitor swarm progress via `todowrite`
- Collect metrics on agent performance, task completion, memory usage
- Health checks on swarm, agents, and memory backends
- Trend analysis over time

## Best Practices

### 1. Choosing the Right Topology

- **Mesh**: Research, brainstorming, collaborative analysis
- **Hierarchical**: Structured development, sequential workflows
- **Star**: Testing, validation, centralized coordination
- **Ring**: Pipeline processing, staged workflows

### 2. Agent Specialization

- Assign specific capabilities to each agent
- Avoid overlapping responsibilities
- Use coordination agents for complex workflows
- Leverage `mcp-memory` for agent communication

### 3. Parallel Execution

- Identify independent tasks for parallelization
- Use sequential execution for dependent tasks
- Monitor resource usage during parallel execution
- Implement proper error handling

### 4. Memory Management

- Use namespaces to organize memory
- Set appropriate TTL values
- Create regular backups
- Implement state snapshots for checkpoints

### 5. Monitoring and Optimization

- Monitor swarm health regularly via `todowrite`
- Collect and analyze metrics
- Optimize topology based on performance
- Learn from successful patterns

### 6. Error Recovery

- Implement fault tolerance strategies
- Use auto-recovery mechanisms
- Analyze error patterns
- Create fallback workflows

## Real-World Examples

### Example 1: AI Research Project
Mesh topology, spawn 2 researchers, 2 analysts, 1 synthesizer, 1 documenter. Parallel gather → Analyze patterns → Synthesize → Report.

### Example 2: Full-Stack Application
Hierarchical topology, spawn 1 architect, 2 devs, 1 db engineer, 2 testers, 1 reviewer, 1 devops. Design → Parallel implement → Test → Review → Deploy.

### Example 3: Security Audit
Star topology, spawn 1 coordinator, 1 code analyzer, 1 security scanner, 1 penetration tester, 1 reporter. Parallel scan → Vulnerability analysis → Penetration test → Report.

### Example 4: Performance Optimization
Mesh topology, spawn 1 profiler, 1 bottleneck analyzer, 1 optimizer, 1 tester. Profile → Identify bottlenecks → Optimize → Validate.

## Troubleshooting

### Common Issues

**Issue**: Swarm agents not coordinating properly
**Solution**: Check topology selection, verify memory usage via `mcp-memory`, monitor progress via `todowrite`

**Issue**: Parallel execution failing
**Solution**: Verify task dependencies, check resource limits, implement error handling

**Issue**: Memory persistence not working
**Solution**: Verify namespaces, check TTL settings, ensure proper `mcp-memory` backend configuration

**Issue**: Performance degradation
**Solution**: Optimize topology, reduce agent count, analyze bottlenecks

## Related Skills

- `sparc-methodology` — Systematic development workflow
- `hooks-automation` — Automated coordination and session management
- `swarm-orchestration` — Basic swarm orchestration patterns
- `verification-quality` — Truth scoring and quality assurance

---

**Version**: 3.0.0
**Last Updated**: 2026-05-27
**Skill Level**: Advanced
**Estimated Learning Time**: 2-3 hours
