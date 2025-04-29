import dotenv from 'dotenv';
dotenv.config();

/// <references types="houdini-svelte">

/** @type {import('houdini').ConfigFile} */
const config = {
	watchSchema: {
		url: process.env.VITE_GRAPHQL_SERVER_ENTRYPOINT
	},
	runtimeDir: '.houdini',
	plugins: {
		'houdini-svelte': {
			forceRunesMode: true
		}
	},
	scalars: {
		DateTime: {
			type: 'string',
			resolve: (value) => new Date(value)
		}
	}
};

export default config;
