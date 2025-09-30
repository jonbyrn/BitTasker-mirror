export type GetUsernameHistory = {
    readonly "input": GetUsernameHistory$input;
    readonly "result": GetUsernameHistory$result | undefined;
};

export type GetUsernameHistory$result = {
    readonly getUsernameHistory: (string)[];
};

export type GetUsernameHistory$input = {
    userId: number;
};

export type GetUsernameHistory$artifact = {
    "name": "GetUsernameHistory";
    "kind": "HoudiniQuery";
    "hash": "9a8faf469da028c71a01005f6b3d2ebe2b60a3f6729ca5b7ea96965c30515a8b";
    "raw": `query GetUsernameHistory($userId: Int!) {
  getUsernameHistory(userId: $userId)
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "getUsernameHistory": {
                "type": "String";
                "keyRaw": "getUsernameHistory(userId: $userId)";
                "visible": true;
            };
        };
    };
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "userId": "Int";
        };
        "types": {};
        "defaults": {};
        "runtimeScalars": {};
    };
    "policy": "CacheOrNetwork";
    "partial": false;
};