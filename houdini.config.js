/// <references types="houdini-svelte">

/** @type {import('houdini').ConfigFile} */
const config = {
	watchSchema: {
		// TODO: change to local graphql server while developing
		url: 'http://localhost:8000/graph'
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
