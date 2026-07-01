#!/bin/bash
cd /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker
npx svelte-check --tsconfig ./tsconfig.json 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Error:' | grep '\.test\.' | sed 's/:.*Error: / | /' | awk -F' | ' '{print $1}' | sort | uniq -c | sort -rn
