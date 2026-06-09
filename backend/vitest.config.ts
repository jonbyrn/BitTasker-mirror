import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['gasless/**/__tests__/**/*.{test,spec}.{js,ts,jsx,tsx}'],
		testTimeout: 10000
	},
	esbuild: {
		tsconfigRaw: {
			compilerOptions: {
				experimentalDecorators: true,
				emitDecoratorMetadata: true
			}
		}
	},
	resolve: {
		alias: [{ find: '.', replacement: resolve(__dirname, 'gasless') }]
	}
});
