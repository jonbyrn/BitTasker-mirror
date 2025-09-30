export type CheckUsernameAvailability = {
    readonly "input": CheckUsernameAvailability$input;
    readonly "result": CheckUsernameAvailability$result | undefined;
};

export type CheckUsernameAvailability$result = {
    readonly checkUsernameAvailability: boolean;
};

export type CheckUsernameAvailability$input = {
    username: string;
};

export type CheckUsernameAvailability$artifact = {
    "name": "CheckUsernameAvailability";
    "kind": "HoudiniQuery";
    "hash": "a737afda2894cc6303e78aa175fc339ca4e02438c1d404e30ed1e3d246726ecf";
    "raw": `query CheckUsernameAvailability($username: String!) {
  checkUsernameAvailability(username: $username)
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "checkUsernameAvailability": {
                "type": "Boolean";
                "keyRaw": "checkUsernameAvailability(username: $username)";
                "visible": true;
            };
        };
    };
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "username": "String";
        };
        "types": {};
        "defaults": {};
        "runtimeScalars": {};
    };
    "policy": "CacheOrNetwork";
    "partial": false;
};