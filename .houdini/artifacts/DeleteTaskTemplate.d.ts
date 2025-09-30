export type DeleteTaskTemplate = {
    readonly "input": DeleteTaskTemplate$input;
    readonly "result": DeleteTaskTemplate$result;
};

export type DeleteTaskTemplate$result = {
    readonly deleteTaskTemplate: boolean;
};

export type DeleteTaskTemplate$input = {
    deleteTaskTemplateId: number;
};

export type DeleteTaskTemplate$optimistic = {
    readonly deleteTaskTemplate?: boolean;
};

export type DeleteTaskTemplate$artifact = {
    "name": "DeleteTaskTemplate";
    "kind": "HoudiniMutation";
    "hash": "79774e08ec4c352db70c1dffc5668458b802ac1b86b516780ceb6a2ae9dc021e";
    "raw": `mutation DeleteTaskTemplate($deleteTaskTemplateId: Int!) {
  deleteTaskTemplate(id: $deleteTaskTemplateId)
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "deleteTaskTemplate": {
                "type": "Boolean";
                "keyRaw": "deleteTaskTemplate(id: $deleteTaskTemplateId)";
                "visible": true;
            };
        };
    };
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "deleteTaskTemplateId": "Int";
        };
        "types": {};
        "defaults": {};
        "runtimeScalars": {};
    };
};