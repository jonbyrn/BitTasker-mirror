import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import pkg from './package.json';

export default defineConfig({
    plugins: [
        sveltekit(),
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
        target: 'es2020'
    },
    optimizeDeps: {
        include: [
            'date-fns',
            'zod',
            'axios',
            'swiper',
            'buffer',
            'bitcoinjs-lib',
            'bip32',
            'bip39'
        ],
        exclude: [
            'firebase',
            '@breeztech/breez-sdk-liquid/web',
            '@breeztech/breez-sdk-liquid',
            '@capacitor/device',
            '@capacitor/preferences'
        ]
    },
    resolve: {
        alias: {
            buffer: 'buffer',
            crypto: 'crypto-browserify',
            stream: 'stream-browserify',
            path: 'path-browserify',
            process: 'process/browser'
        }
    },
    server: {
        allowedHosts: ['bittasker.com', 'master.bittasker.com', 'dev.bittasker.com', 'local.bittasker.com']
    }
});