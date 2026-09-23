#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('node', ['node_modules/vite/bin/vite.js', 'build'], {
  cwd: process.cwd(),
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: false
});

let stdout = '';
let stderr = '';

if (child.stdout) {
  child.stdout.on('data', (data) => {
    stdout += data.toString();
    process.stdout.write(data);
  });
}

if (child.stderr) {
  child.stderr.on('data', (data) => {
    stderr += data.toString();
    process.stderr.write(data);
  });
}

child.on('close', (code) => {
  // Always write the full output to a file
  fs.writeFileSync('build-output.txt', `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nExit Code: ${code}`);
  process.exit(code);
});
