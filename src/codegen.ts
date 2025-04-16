// Type generation for GraphQL
import type { CodegenConfig } from '@graphql-codegen/cli';
import { loadEnv } from 'vite';

// Load environment variables
const env = loadEnv('', process.cwd(), 'VITE_');
const prodServerUrl = env.VITE_GRAPHQL_SERVER_ENTRYPOINT;

const config: CodegenConfig = {
	overwrite: true,
	schema: prodServerUrl,
	documents: 'src/**/*.graphql',
	generates: {
		'src/lib/graphql/generated/': {
			preset: 'client',
			presetConfig: {
				gqlTagName: 'gql'
			},
			config: {
				useTypeImports: true
			}
		}
	},
	ignoreNoDocuments: true
};

export default config;
