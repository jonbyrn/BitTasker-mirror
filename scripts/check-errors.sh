#!/bin/bash
sed 's/\x1b\[[0-9;]*m//g' <(npx svelte-check --tsconfig ./tsconfig.json 2>&1) | grep -B1 -A3 'Error:' | grep -v 'Error:' | grep -v '^\s*$' | sed 's|/home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker/||' | sed 's/:.*//' | grep -v '.test.' | grep -v '.spec.' | grep -v stories | sort | uniq -c | sort -rn | tail -70
