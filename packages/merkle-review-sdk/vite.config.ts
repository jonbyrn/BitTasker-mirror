import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
	plugins: [
		dts({
			insertTypesEntry: true,
			rollupTypes: true
		})
	],
	resolve: {
		extensions: ['.ts', '.js', '.json']
	},
	build: {
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			name: 'MerkleReviewSDK',
			formats: ['es'],
			fileName: 'index'
		},
		rollupOptions: {
			external: ['ethers', '@noble/hashes', 'merkletreejs'],
			output: {
				globals: {
					ethers: 'ethers',
					'@noble/hashes': 'nobleHashes',
					'merkletreejs': 'MerkleTree'
				}
			}
		},
		sourcemap: true,
		target: 'es2020'
	},
});

