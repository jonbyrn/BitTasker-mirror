/**
 * Vitest config for test-triage script.
 * Extends main config and adds JSON reporter with outputFile.
 * Usage: npx vitest run --config vitest.triage.config.ts ...
 */
import { defineConfig } from 'vitest/config';
import base from './vite.config';

const outputFile = process.env.TEST_TRIAGE_OUTPUT || '.test-triage-temp.json';

export default defineConfig({
	...base,
	test: {
		...(base as { test?: object }).test,
		reporters: [['json', { outputFile }]],
	},
});
