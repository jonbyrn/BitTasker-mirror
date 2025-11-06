import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', 'tests/', 'dist/']
		},
		// Run tests without watch mode
		watch: false,
		// Exit after tests complete
		passWithNoTests: true
	},
	resolve: {
		extensions: ['.ts', '.js', '.json'],
		alias: {
			'@': resolve(process.cwd(), './src')
		}
	},
	esbuild: {
		target: 'node18'
	}
});
