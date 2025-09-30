export default {
    "name": "ChangePassword",
    "kind": "HoudiniMutation",
    "hash": "800dc71be0a610339dd3b7edd4cabd3d53c596eb3b659fe9c27b677cf12c1f6b",

    "raw": `mutation ChangePassword($input: ChangePasswordInput!) {
  changePassword(input: $input)
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "changePassword": {
                "type": "Boolean",
                "keyRaw": "changePassword(input: $input)",
                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "input": "ChangePasswordInput"
        },

        "types": {
            "ChangePasswordInput": {
                "currentPassword": "String",
                "newPassword": "String"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=561d5fa329275b9735c9b916caa44c03d6c5125c75a62e4cedd55143d14dd9bb";