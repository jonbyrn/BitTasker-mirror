export default {
    "name": "CheckUsernameAvailability",
    "kind": "HoudiniQuery",
    "hash": "a737afda2894cc6303e78aa175fc339ca4e02438c1d404e30ed1e3d246726ecf",

    "raw": `query CheckUsernameAvailability($username: String!) {
  checkUsernameAvailability(username: $username)
}
`,

    "rootType": "Query",
    "stripVariables": [],

    "selection": {
        "fields": {
            "checkUsernameAvailability": {
                "type": "Boolean",
                "keyRaw": "checkUsernameAvailability(username: $username)",
                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "username": "String"
        },

        "types": {},
        "defaults": {},
        "runtimeScalars": {}
    },

    "policy": "CacheOrNetwork",
    "partial": false
};

"HoudiniHash=e0351711d7f5620b88c7fe06ca97106fa1168e2d771c93f84718d20f45687083";