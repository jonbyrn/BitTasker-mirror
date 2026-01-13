import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentrySvelteKit } from "@sentry/sveltekit";
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import pkg from './package.json';
import houdini from 'houdini/vite';
import wasm from 'vite-plugin-wasm';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';
import topLevelAwait from 'vite-plugin-top-level-await';

// Vite plugin to ensure browser condition is prioritized during tests
// This fixes the "mount(...) is not available on the server" error
const addBrowserCondition: Plugin = {
    name: 'vite-plugin-browser-condition',
    config(config, { mode }) {
        if (process.env.VITEST || mode === 'test') {
            if (!config.resolve?.conditions) {
                if (!config.resolve) {
                    config.resolve = {};
                }
                config.resolve.conditions = [];
            }
            // Prioritize 'browser' condition for client-side rendering in tests
            if (!config.resolve.conditions.includes('browser')) {
                config.resolve.conditions.unshift('browser');
            }
        }
    }
};

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest-setup-client.ts'],
        globals: true
    },
    resolve: {
        conditions: process.env.VITEST ? ['browser', 'development'] : ['browser', 'development'],
        alias: {
            buffer: 'buffer',
            crypto: 'crypto-browserify',
            stream: 'stream-browserify',
            // Do NOT alias 'path' as it breaks WASM loading in @vulpemventures/secp256k1-zkp
            // path: 'path-browserify',
            path: 'path-browserify',
            process: 'process/browser',
            '$app/environment': new URL('./src/lib/mocks/app-environment.ts', import.meta.url).pathname
        }
    },
    plugins: [
        sentrySvelteKit({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            autoInstrument: {
                load: false, // Disable auto-instrumentation for client-side only app
                serverLoad: false
            }
        }),
        addBrowserCondition,
        nodePolyfills({
            // Whether to polyfill `node:` protocol imports.
            protocolImports: true,
            // Enable polyfills for specific globals and modules.
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
            // Add specific polyfills for modules required by wallet SDK
            // IMPORTANT: Do NOT include 'fs' or 'path' as they break WASM loading
            include: ['crypto', 'stream', 'buffer', 'util', 'process', 'events'],
            // Explicitly exclude modules that should not be polyfilled
            exclude: ['fs', 'path'],
        }),
        sveltekit(),
        houdini(),
        tailwindcss(),
        wasm(),
        topLevelAwait(),
        Icons({
            compiler: 'svelte',
            autoInstall: false,
            scale: 1.5,
            // defaultStyle: 'width: 1.5em; height: 1.5em;',
            defaultClass: '',
        })
    ],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        global: 'globalThis',
    },
    build: {
        target: 'es2020',
        /* chunkSizeWarningLimit: 1000, // Increase to 1000 kB to reduce noise
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    // Vendor chunks - separate large dependencies
                    if (id.includes('node_modules')) {
                        // Crypto libraries
                        if (id.includes('liquidjs-lib') || id.includes('bitcoinjs-lib')) {
                            return 'vendor-crypto';
                        }
                        // Boltz SDK
                        if (id.includes('boltz-core') || id.includes('boltz')) {
                            return 'vendor-boltz';
                        }
                        // Nostr libraries
                        if (id.includes('nostr-tools') || id.includes('nostr')) {
                            return 'vendor-nostr';
                        }
                        // UI libraries
                        if (id.includes('swiper') || id.includes('photoswipe')) {
                            return 'vendor-ui';
                        }
                        // All other vendor code
                        return 'vendor';
                    }
                }
            }
        } */
    },
    optimizeDeps: {
        include: [
            'date-fns',
            'axios',
            'swiper',
            'buffer',
            'bitcoinjs-lib',
            'bip32',
            'bip39'
        ],
        exclude: [
            'firebase',
            '@capacitor/device',
            '@capacitor/preferences',
            '@capacitor/haptics',
            /* 'liquidjs-lib',
            'boltz-core',
            '@vulpemventures/secp256k1-zkp' */
        ],
        /* esbuildOptions: {
            define: {
                global: 'globalThis'
            }
        } */
    },
    server: {
        allowedHosts: ['bittasker.com', 'master.bittasker.com', 'dev.bittasker.com', 'local.bittasker.com']
    }
});