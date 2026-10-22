/**
 * esbuild `inject` module for the bitcoinjs-lib browser IIFE.
 * bitcoinjs-lib calls `Buffer.alloc` while script_signature.js is first
 * evaluated. Browsers have no Node Buffer, so that throws before SvelteKit
 * can render. Exporting `Buffer` makes esbuild rewrite those bare references
 * to this polyfill inside the bundle.
 */
import { Buffer as BufferPolyfill } from 'buffer';

export { BufferPolyfill as Buffer };
