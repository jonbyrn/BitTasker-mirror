export type ChangePassword = {
    readonly "input": ChangePassword$input;
    readonly "result": ChangePassword$result;
};

export type ChangePassword$result = {
    readonly changePassword: boolean;
};

type ChangePasswordInput = {
    currentPassword: string;
    newPassword: string;
};

export type ChangePassword$input = {
    input: ChangePasswordInput;
};

export type ChangePassword$optimistic = {
    readonly changePassword?: boolean;
};

export type ChangePassword$artifact = {
    "name": "ChangePassword";
    "kind": "HoudiniMutation";
    "hash": "800dc71be0a610339dd3b7edd4cabd3d53c596eb3b659fe9c27b677cf12c1f6b";
    "raw": `mutation ChangePassword($input: ChangePasswordInput!) {
  changePassword(input: $input)
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "changePassword": {
                "type": "Boolean";
                "keyRaw": "changePassword(input: $input)";
                "visible": true;
            };
        };
    };
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "input": "ChangePasswordInput";
        };
        "types": {
            "ChangePasswordInput": {
                "currentPassword": "String";
                "newPassword": "String";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};