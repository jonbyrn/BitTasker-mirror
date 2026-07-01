#!/usr/bin/env node
import { execSync } from 'child_process';

try {
  const raw = execSync('npx svelte-check --tsconfig ./tsconfig.json 2>&1', {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 180000
  });
  // Strip ANSI codes
  const clean = raw.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = clean.split('\n');
  // Get error lines with context
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Error:') || lines[i].includes('error TS')) {
      console.log(lines.slice(Math.max(0, i - 1), i + 4).join('\n'));
      console.log('---');
    }
  }
} catch (e) {
  const raw = (e.stdout || '') + (e.stderr || '');
  const clean = raw.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = clean.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Error:') || lines[i].includes('error TS') || lines[i].includes('Type ')) {
      console.log(lines.slice(Math.max(0, i - 1), i + 4).join('\n'));
      console.log('---');
    }
  }
}
