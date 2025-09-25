/// <references types="houdini-svelte">

/** @type {import('houdini').ConfigFile} */
const config = {
    watchSchema: {
        // Use env: prefix to access environment variables
        url: 'env:PUBLIC_GRAPHQL_ENDPOINT',
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
