#!/bin/bash
cd /home/foxx/Documents/dev-Bittasker/dev/dev-BitTasker
sed 's/\x1b\[[0-9;]*m//g' <(npm run check 2>&1) > /tmp/svelte-check-output.txt 2>&1
echo "DONE"
