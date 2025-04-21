/// <references types="houdini-svelte">

/** @type {import('houdini').ConfigFile} */
const config = {
    "watchSchema": {
        "url": "https://devbackend.production.bittasker.hedgehackers.finance/graph"
    },
    "runtimeDir": ".houdini",
    "plugins": {
        "houdini-svelte": {}
    }
}

export default config
