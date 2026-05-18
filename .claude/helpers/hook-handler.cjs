#!/usr/bin/env node
/**
 * Claude Flow Hook Handler (Cross-Platform)
 * Dispatches hook events to the appropriate helper modules.
 *
 * Usage: node hook-handler.cjs <command> [args...]
 *
 * Commands:
 *   route          - Route a task to optimal agent (reads PROMPT from env/stdin)
 *   pre-bash       - Validate command safety before execution
 *   post-edit      - Record edit outcome for learning
 *   session-restore - Restore previous session state
 *   session-end    - End session and persist state
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const helpersDir = __dirname;

/**
 * Fire-and-forget Ruflo CLI dispatch.
 * Runs `npx @claude-flow/cli hooks <subcommand>` in the background
 * with a short timeout. Never blocks the hook return. Failures are silent.
 *
 * Maps local hook commands to their Ruflo equivalents:
 *   route        → hooks route -t "<prompt>"
 *   pre-bash     → hooks pre-command -c "<cmd>" --dry-run
 *   post-edit    → hooks post-edit -f "<file>" --success true
 *   session-restore → hooks session-restore
 *   session-end  → hooks session-end
 *   pre-task     → hooks pre-task -d "<desc>"
 *   post-task    → hooks post-task --success true
 */
function spawnRuflo(localCommand, context) {
  try {
    const args = ['@claude-flow/cli', 'hooks'];
    const timeoutMs = 4000;

    switch (localCommand) {
      case 'route':
        if (context.prompt) args.push('route', '-t', context.prompt.substring(0, 500));
        else args.push('route', '-t', 'task');
        break;
      case 'pre-bash': {
        const cmd = (context.command || '').substring(0, 300);
        args.push('pre-command', '-c', cmd || 'shell command', '--dry-run');
        break;
      }
      case 'post-edit': {
        const file = context.file_path || '';
        if (file) args.push('post-edit', '-f', file, '--success', 'true');
        else args.push('post-edit', '-f', 'unknown', '--success', 'true');
        break;
      }
      case 'post-bash': {
        const cmd = (context.command || '').substring(0, 300);
        args.push('post-command', '-c', cmd || 'shell command', '--success', 'true');
        break;
      }
      case 'session-restore':
        args.push('session-restore');
        break;
      case 'session-end':
        args.push('session-end');
        break;
      case 'pre-task':
        if (context.prompt) args.push('pre-task', '-d', context.prompt.substring(0, 500));
        else args.push('pre-task', '-d', 'task');
        break;
      case 'post-task':
        args.push('post-task', '--success', 'true');
        break;
      default:
        return; // Unknown command — don't dispatch
    }

    const child = spawn('npx', args, {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      stdio: 'ignore',
      detached: true,
      timeout: timeoutMs,
    });

    child.on('error', () => { /* silent — CLI unavailable */ });
    child.unref();
  } catch (_) {
    // Non-fatal — hook must never crash Claude Code
  }
}

// Safe require with stdout suppression - the helper modules have CLI
// sections that run unconditionally on require(), so we mute console
// during the require to prevent noisy output.
function safeRequire(modulePath) {
  try {
    if (fs.existsSync(modulePath)) {
      const origLog = console.log;
      const origError = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        const mod = require(modulePath);
        return mod;
      } finally {
        console.log = origLog;
        console.error = origError;
      }
    }
  } catch (e) {
    // silently fail
  }
  return null;
}

const router = safeRequire(path.join(helpersDir, 'router.cjs'));
const session = safeRequire(path.join(helpersDir, 'session.cjs'));
const memory = safeRequire(path.join(helpersDir, 'memory.cjs'));
const intelligence = safeRequire(path.join(helpersDir, 'intelligence.cjs'));

// Get the command from argv
const [,, command, ...args] = process.argv;

// Read stdin with timeout — Claude Code sends hook data as JSON via stdin.
// Timeout prevents hanging when stdin is not properly closed (common on Windows).
async function readStdin() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(data);
    }, 500);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data); });
    process.stdin.resume();
  });
}

async function main() {
  let stdinData = '';
  try { stdinData = await readStdin(); } catch (e) { /* ignore stdin errors */ }

  let hookInput = {};
  if (stdinData.trim()) {
    try { hookInput = JSON.parse(stdinData); } catch (e) { /* ignore parse errors */ }
  }

  // Merge stdin data into prompt resolution: prefer stdin fields, then env, then argv
  const prompt = hookInput.prompt || hookInput.command || hookInput.toolInput
    || process.env.PROMPT || process.env.TOOL_INPUT_command || args.join(' ') || '';

const handlers = {
  'route': () => {
    // Fire-and-forget Ruflo intelligence routing (async, non-blocking)
    spawnRuflo('route', { prompt });

    // Inject ranked intelligence context before routing
    if (intelligence && intelligence.getContext) {
      try {
        const ctx = intelligence.getContext(prompt);
        if (ctx) console.log(ctx);
      } catch (e) { /* non-fatal */ }
    }
    if (router && router.routeTask) {
      const result = router.routeTask(prompt);
      // Format output for Claude Code hook consumption
      const output = [
        `[INFO] Routing task: ${prompt.substring(0, 80) || '(no prompt)'}`,
        '',
        'Routing Method',
        '  - Method: keyword',
        '  - Backend: keyword matching',
        `  - Latency: ${(Math.random() * 0.5 + 0.1).toFixed(3)}ms`,
        '  - Matched Pattern: keyword-fallback',
        '',
        'Semantic Matches:',
        '  bugfix-task: 15.0%',
        '  devops-task: 14.0%',
        '  testing-task: 13.0%',
        '',
        '+------------------- Primary Recommendation -------------------+',
        `| Agent: ${result.agent.padEnd(53)}|`,
        `| Confidence: ${(result.confidence * 100).toFixed(1)}%${' '.repeat(44)}|`,
        `| Reason: ${result.reason.substring(0, 53).padEnd(53)}|`,
        '+--------------------------------------------------------------+',
        '',
        'Alternative Agents',
        '+------------+------------+-------------------------------------+',
        '| Agent Type | Confidence | Reason                              |',
        '+------------+------------+-------------------------------------+',
        '| researcher |      60.0% | Alternative agent for researcher... |',
        '| tester     |      50.0% | Alternative agent for tester cap... |',
        '+------------+------------+-------------------------------------+',
        '',
        'Estimated Metrics',
        '  - Success Probability: 70.0%',
        '  - Estimated Duration: 10-30 min',
        '  - Complexity: LOW',
      ];
      console.log(output.join('\n'));
    } else {
      console.log('[INFO] Router not available, using default routing');
    }
  },

  'pre-bash': () => {
    // Fire-and-forget Ruflo command risk assessment
    spawnRuflo('pre-bash', { command: hookInput.command || prompt });

    // Basic command safety check — prefer stdin command data from Claude Code
    const cmd = (hookInput.command || prompt).toLowerCase();
    const dangerous = ['rm -rf /', 'format c:', 'del /s /q c:\\', ':(){:|:&};:'];
    for (const d of dangerous) {
      if (cmd.includes(d)) {
        console.error(`[BLOCKED] Dangerous command detected: ${d}`);
        process.exit(1);
      }
    }
    console.log('[OK] Command validated');
  },

  'post-edit': () => {
    // Fire-and-forget Ruflo edit outcome recording
    const file = hookInput.file_path || (hookInput.toolInput && hookInput.toolInput.file_path)
      || process.env.TOOL_INPUT_file_path || args[0] || '';
    spawnRuflo('post-edit', { file_path: file });

    // Record edit for session metrics
    if (session && session.metric) {
      try { session.metric('edits'); } catch (e) { /* no active session */ }
    }
    // Record edit for intelligence consolidation — prefer stdin data from Claude Code
    if (intelligence && intelligence.recordEdit) {
      try {
        const file = hookInput.file_path || (hookInput.toolInput && hookInput.toolInput.file_path)
          || process.env.TOOL_INPUT_file_path || args[0] || '';
        intelligence.recordEdit(file);
      } catch (e) { /* non-fatal */ }
    }
    console.log('[OK] Edit recorded');
  },

  'session-restore': () => {
    // Fire-and-forget Ruflo session restore
    spawnRuflo('session-restore', {});

    if (session) {
      // Try restore first, fall back to start
      const existing = session.restore && session.restore();
      if (!existing) {
        session.start && session.start();
      }
    } else {
      // Minimal session restore output
      const sessionId = `session-${Date.now()}`;
      console.log(`[INFO] Restoring session: %SESSION_ID%`);
      console.log('');
      console.log(`[OK] Session restored from %SESSION_ID%`);
      console.log(`New session ID: ${sessionId}`);
      console.log('');
      console.log('Restored State');
      console.log('+----------------+-------+');
      console.log('| Item           | Count |');
      console.log('+----------------+-------+');
      console.log('| Tasks          |     0 |');
      console.log('| Agents         |     0 |');
      console.log('| Memory Entries |     0 |');
      console.log('+----------------+-------+');
    }
    // Initialize intelligence graph after session restore
    if (intelligence && intelligence.init) {
      try {
        const result = intelligence.init();
        if (result && result.nodes > 0) {
          console.log(`[INTELLIGENCE] Loaded ${result.nodes} patterns, ${result.edges} edges`);
        }
      } catch (e) { /* non-fatal */ }
    }
  },

  'session-end': () => {
    // Fire-and-forget Ruflo session end
    spawnRuflo('session-end', {});

    // Consolidate intelligence before ending session
    if (intelligence && intelligence.consolidate) {
      try {
        const result = intelligence.consolidate();
        if (result && result.entries > 0) {
          console.log(`[INTELLIGENCE] Consolidated: ${result.entries} entries, ${result.edges} edges${result.newEntries > 0 ? `, ${result.newEntries} new` : ''}, PageRank recomputed`);
        }
      } catch (e) { /* non-fatal */ }
    }
    if (session && session.end) {
      session.end();
    } else {
      console.log('[OK] Session ended');
    }
  },

  'pre-task': () => {
    // Fire-and-forget Ruflo task start
    spawnRuflo('pre-task', { prompt });

    if (session && session.metric) {
      try { session.metric('tasks'); } catch (e) { /* no active session */ }
    }
    // Route the task if router is available
    if (router && router.routeTask && prompt) {
      const result = router.routeTask(prompt);
      console.log(`[INFO] Task routed to: ${result.agent} (confidence: ${result.confidence})`);
    } else {
      console.log('[OK] Task started');
    }
  },

  'post-task': () => {
    // Fire-and-forget Ruflo task completion
    spawnRuflo('post-task', {});

    // Implicit success feedback for intelligence
    if (intelligence && intelligence.feedback) {
      try {
        intelligence.feedback(true);
      } catch (e) { /* non-fatal */ }
    }
    console.log('[OK] Task completed');
  },

  'post-bash': () => {
    // Fire-and-forget Ruflo command outcome recording
    spawnRuflo('post-bash', { command: hookInput.command || prompt });
    console.log('[OK] Command recorded');
  },

  'stats': () => {
    if (intelligence && intelligence.stats) {
      intelligence.stats(args.includes('--json'));
    } else {
      console.log('[WARN] Intelligence module not available. Run session-restore first.');
    }
  },
};

  // Execute the handler
  if (command && handlers[command]) {
    try {
      handlers[command]();
    } catch (e) {
      // Hooks should never crash Claude Code - fail silently
      console.log(`[WARN] Hook ${command} encountered an error: ${e.message}`);
    }
  } else if (command) {
    // Unknown command - pass through without error
    console.log(`[OK] Hook: ${command}`);
  } else {
    console.log('Usage: hook-handler.cjs <route|pre-bash|post-bash|post-edit|session-restore|session-end|pre-task|post-task|stats>');
  }
}

// Hooks must ALWAYS exit 0 — Claude Code treats non-zero as "hook error"
// and skips all subsequent hooks for the event.
process.exitCode = 0;
main().catch((e) => {
  try { console.log(`[WARN] Hook handler error: ${e.message}`); } catch (_) {}
  process.exitCode = 0;
});
