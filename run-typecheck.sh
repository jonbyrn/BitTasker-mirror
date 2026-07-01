#!/bin/bash
cd /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker
sed 's/\x1b\[[0-9;]*m//g' <(npx svelte-check --tsconfig ./tsconfig.json 2>&1) | grep -E 'Error:' | grep -v 'node_modules' | grep -E '\.test\.' > /tmp/test-type-errors.txt 2>&1
echo "DONE: $(wc -l < /tmp/test-type-errors.txt) errors found"
