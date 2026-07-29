---
name: Hooks Automation
description: Automated coordination, formatting, and learning from development operations using intelligent hooks. Includes pre/post task hooks, session management, Git integration, memory coordination, and pattern training for enhanced development workflows.
---

# Hooks Automation

Intelligent automation system that coordinates, validates, and learns from development operations through hooks integrated with memory tools and pattern training.

## What This Skill Does

This skill provides a comprehensive hook system that automatically manages development operations, coordinates swarm agents, maintains session state, and continuously learns from coding patterns.

**Key Capabilities:**
- **Pre-Operation Hooks**: Validate, prepare, and auto-assign agents before operations
- **Post-Operation Hooks**: Format, analyze, and train patterns after operations
- **Session Management**: Persist state, restore context, generate summaries
- **Memory Coordination**: Synchronize knowledge across swarm agents via `mcp-memory`
- **Git Integration**: Automated commit hooks with quality verification
- **Continuous Learning**: Learn from successful patterns

## Pre-Operation Hooks

Hooks that execute BEFORE operations to prepare and validate:

### pre-edit
Validate and prepare before file modifications:
- Auto agent assignment based on file type
- Syntax validation to prevent broken code
- Conflict detection for concurrent edits
- Automatic file backups for safety

### pre-bash
Check command safety and resource requirements:
- Command safety validation
- Resource requirement estimation
- Destructive command confirmation
- Permission checks

### pre-task
Auto-spawn agents and prepare for complex tasks:
- Automatic agent spawning based on task analysis via `task` tool
- Memory loading for context continuity via `mcp-memory_memory_search`
- Complexity estimation and time prediction

### pre-search
Prepare and optimize search operations:
- Cache checking for faster results
- Query optimization
- Search pattern improvement

## Post-Operation Hooks

Hooks that execute AFTER operations to process and learn:

### post-edit
Auto-format, validate, and update memory:
- Language-specific auto-formatting (Prettier, Black, gofmt)
- Memory storage for edit context and decisions via `mcp-memory_memory_store`
- Pattern learning for continuous improvement
- Output validation with linting

### post-bash
Log execution and update metrics:
- Command execution logging
- Performance metric tracking
- Result storage for analysis via `mcp-memory`
- Error pattern detection

### post-task
Performance analysis and decision storage:
- Execution time and token usage measurement
- Decision and implementation choice recording via `mcp-memory`
- Learning pattern export
- Completion report generation

### post-search
Cache results and improve patterns:
- Result caching for faster subsequent searches
- Search pattern improvement
- Relevance scoring

## Memory Coordination Hooks

### memory-write
Triggered when agents write to coordination memory:
- Validate memory key format
- Update cross-agent indexes
- Trigger dependent hooks
- Notify subscribed agents

### memory-read
Triggered when agents read from coordination memory:
- Log access patterns
- Update popularity metrics
- Preload related data
- Track usage statistics

### memory-sync
Synchronize memory across swarm agents:
- Sync memory state across agents
- Resolve conflicts
- Propagate updates
- Maintain consistency

## Session Hooks

### session-start
Initialize new session:
- Create session directory
- Initialize metrics tracking
- Load previous context via `mcp-memory_memory_search`
- Set up coordination namespace

### session-restore
Load previous session state:
- Load previous session context
- Restore memory state and decisions
- Resume in-progress tasks

### session-end
Cleanup and persist session state:
- Save current context and progress via `mcp-memory_memory_store_session`
- Export session metrics (duration, commands, tokens, files)
- Generate work summary with decisions and next steps
- Cleanup temporary files and optimize storage

### notify
Custom notifications with status:
- Send notifications to coordination system
- Include status and metrics
- Broadcast to all agents
- Log important events

## Memory Coordination Protocol

All hooks follow a standardized memory coordination pattern:

### Three-Phase Memory Protocol

**Phase 1: STATUS** — Hook starts
Store running status in `mcp-memory` with hook name, file, and timestamp.

**Phase 2: PROGRESS** — Hook processes
Store progress updates in `mcp-memory` with current action and progress percentage.

**Phase 3: COMPLETE** — Hook finishes
Store completion status with result, agent assignments, and validation results.

## Hook Response Format

Hooks return structured responses to control operation flow:

### Continue Response
Operation proceeds with metadata (agent_assigned, syntax_valid, etc.)

### Block Response
Operation blocked with reason (protected file, manual review needed, etc.)

### Warning Response
Operation continues but warnings attached (complexity high, non-blocking issues, etc.)

## Git Integration

### Pre-Commit Hook
Run quality checks before commit:
- Validate staged files for syntax
- Run auto-formatting on edited files
- Execute test suite
- Run `npm run check` for type safety
- Run `npm run lint` for style compliance

### Post-Commit Hook
Track commit metrics:
- Log commit hash and message
- Store commit context in `mcp-memory`

### Pre-Push Hook
Quality gate before push:
- Run full test suite
- Verify quality thresholds
- Run GitNexus `detect_changes` to verify affected scope

## Agent Coordination Workflow

### Agent Workflow Pattern

1. **Pre-task preparation**: Search memory for prior patterns, estimate complexity
2. **Pre-edit validation**: Validate syntax, assign agent, create backup
3. **Edit file**: Apply changes
4. **Post-edit processing**: Auto-format, store in memory, train patterns
5. **Notify coordination**: Broadcast completion status
6. **Task completion**: Analyze performance, store decisions, export learnings

### Multi-Agent Coordination

Agent 1 (Backend) stores implementation details in `mcp-memory` → Agent 2 (Testing) reads from memory → Agent 2 generates tests → Agent 2 broadcasts completion → All agents aware of state.

## Custom Hook Creation

Custom hooks follow this pattern:

1. Define hook name, type (pre/post), and matcher
2. Implement validation logic
3. Store results in `mcp-memory`
4. Return continue/block/warning response

## Performance Tips

1. **Keep Hooks Lightweight** — Target minimal execution time
2. **Use Async for Heavy Operations** — Don't block the main flow
3. **Cache Aggressively** — Store frequently accessed data in `mcp-memory`
4. **Batch Related Operations** — Combine multiple actions
5. **Use Memory Wisely** — Set appropriate TTLs
6. **Monitor Hook Performance** — Track execution times
7. **Parallelize When Possible** — Run independent hooks concurrently

## Benefits

- **Automatic Agent Assignment**: Right agent for every file type via `task` tool
- **Consistent Code Formatting**: Language-specific formatters
- **Continuous Learning**: Patterns improve over time
- **Cross-Session Memory**: Context persists between sessions via `mcp-memory`
- **Performance Tracking**: Comprehensive metrics and analytics
- **Automatic Coordination**: Agents sync via memory
- **Quality Gates**: Pre-commit validation and verification
- **Error Prevention**: Syntax validation before edits
- **Knowledge Sharing**: Decisions stored and shared
- **Reduced Manual Work**: Automation of repetitive tasks

## Best Practices

1. **Configure Hooks Early** — Set up during project initialization
2. **Use Memory Keys Strategically** — Organize with clear namespaces
3. **Enable Auto-Formatting** — Maintain code consistency
4. **Monitor Performance** — Track hook execution times
5. **Validate Configuration** — Test hooks before production use
6. **Document Custom Hooks** — Maintain hook documentation
7. **Set Appropriate Timeouts** — Prevent hanging operations
8. **Handle Errors Gracefully** — Use continueOnError when appropriate
9. **Review Metrics Regularly** — Optimize based on usage patterns

## Integration with Other Skills

This skill works seamlessly with:
- **SPARC Methodology** — Hooks enhance SPARC workflows
- **Pair Programming** — Automated quality in pairing sessions
- **Verification Quality** — Truth-score validation in hooks
- **Swarm Advanced** — Multi-agent coordination via hooks
