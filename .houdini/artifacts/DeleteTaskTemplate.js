export default {
    "name": "DeleteTaskTemplate",
    "kind": "HoudiniMutation",
    "hash": "79774e08ec4c352db70c1dffc5668458b802ac1b86b516780ceb6a2ae9dc021e",

    "raw": `mutation DeleteTaskTemplate($deleteTaskTemplateId: Int!) {
  deleteTaskTemplate(id: $deleteTaskTemplateId)
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "deleteTaskTemplate": {
                "type": "Boolean",
                "keyRaw": "deleteTaskTemplate(id: $deleteTaskTemplateId)",
                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "deleteTaskTemplateId": "Int"
        },

        "types": {},
        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=76a5ee1ca2855fa21a75c8d6a5cc465b8867f8919a7714d9cd20afb1dfe41cef";