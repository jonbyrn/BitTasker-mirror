export default {
    "name": "GetUsernameHistory",
    "kind": "HoudiniQuery",
    "hash": "9a8faf469da028c71a01005f6b3d2ebe2b60a3f6729ca5b7ea96965c30515a8b",

    "raw": `query GetUsernameHistory($userId: Int!) {
  getUsernameHistory(userId: $userId)
}
`,

    "rootType": "Query",
    "stripVariables": [],

    "selection": {
        "fields": {
            "getUsernameHistory": {
                "type": "String",
                "keyRaw": "getUsernameHistory(userId: $userId)",
                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "userId": "Int"
        },

        "types": {},
        "defaults": {},
        "runtimeScalars": {}
    },

    "policy": "CacheOrNetwork",
    "partial": false
};

"HoudiniHash=19e2a1217191258cda8dd915e32c3ef89297d1f5856f8a1613c9d18736e51a42";