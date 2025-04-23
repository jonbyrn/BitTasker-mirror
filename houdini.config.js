/// <references types="houdini-svelte">

/** @type {import('houdini').ConfigFile} */
const config = {
	watchSchema: {
		url: 'http://127.0.0.1:3000/graph'
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
