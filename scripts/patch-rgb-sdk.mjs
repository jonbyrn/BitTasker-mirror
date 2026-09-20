import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'fs';
import { join } from 'path';

const patterns = [
    'node_modules/@utexo/rgb-sdk-web/dist/index.mjs',
    'node_modules/.pnpm/**/node_modules/@utexo/rgb-sdk-web/dist/index.mjs',
    'node_modules/@utexo/rln-wasm/rln_wasm_sdk.js',
    'node_modules/.pnpm/**/node_modules/@utexo/rln-wasm/rln_wasm_sdk.js'
];

let patched = false;

for (const pattern of patterns) {
    try {
        const files = globSync(pattern);
        for (const file of files) {
            let content = readFileSync(file, 'utf8');
            const original = content;
            
            // Fix data_dir: /rln_ -> rln_ (relative path)
            content = content.replace(/data_dir:\s*`\/rln_/g, 'data_dir: `rln_');
            content = content.replace(/data_dir:\s*'\/rln_/g, "data_dir: 'rln_");
            content = content.replace(/data_dir:\s*"\/rln_/g, 'data_dir: "rln_');
            
            if (content !== original) {
                writeFileSync(file, content);
                console.log(`[patch-rgb-sdk] Fixed data_dir in ${file}`);
                patched = true;
            }
        }
    } catch (err) {
        // File not found, skip
    }
}

if (!patched) {
    console.log('[patch-rgb-sdk] No data_dir patterns found to patch');
}
