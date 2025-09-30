export default {
    "name": "Login",
    "kind": "HoudiniMutation",
    "hash": "416c1af1dab37c542a385ac38e38743db36742f39a4395d5094e3d4ccd6e2f8f",

    "raw": `mutation Login($input: LoginInput!) {
  login(input: $input) {
    access_token
    expires_in
    token_type
    user {
      id
      email
      name
      profilePictureUrl
      onboardingComplete
      userRole
      status
      isEmailVerified
      lastLoginAt
      createdAt
      updatedAt
    }
  }
}
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "login": {
                "type": "Auth",
                "keyRaw": "login(input: $input)",

                "selection": {
                    "fields": {
                        "access_token": {
                            "type": "String",
                            "keyRaw": "access_token",
                            "visible": true
                        },

                        "expires_in": {
                            "type": "Int",
                            "keyRaw": "expires_in",
                            "visible": true
                        },

                        "token_type": {
                            "type": "String",
                            "keyRaw": "token_type",
                            "visible": true
                        },

                        "user": {
                            "type": "User",
                            "keyRaw": "user",

                            "selection": {
                                "fields": {
                                    "id": {
                                        "type": "ID",
                                        "keyRaw": "id",
                                        "visible": true
                                    },

                                    "email": {
                                        "type": "String",
                                        "keyRaw": "email",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "name": {
                                        "type": "String",
                                        "keyRaw": "name",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "profilePictureUrl": {
                                        "type": "String",
                                        "keyRaw": "profilePictureUrl",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "onboardingComplete": {
                                        "type": "Boolean",
                                        "keyRaw": "onboardingComplete",
                                        "visible": true
                                    },

                                    "userRole": {
                                        "type": "UserRole",
                                        "keyRaw": "userRole",
                                        "visible": true
                                    },

                                    "status": {
                                        "type": "UserStatus",
                                        "keyRaw": "status",
                                        "visible": true
                                    },

                                    "isEmailVerified": {
                                        "type": "Boolean",
                                        "keyRaw": "isEmailVerified",
                                        "visible": true
                                    },

                                    "lastLoginAt": {
                                        "type": "DateTime",
                                        "keyRaw": "lastLoginAt",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "createdAt": {
                                        "type": "DateTime",
                                        "keyRaw": "createdAt",
                                        "visible": true
                                    },

                                    "updatedAt": {
                                        "type": "DateTime",
                                        "keyRaw": "updatedAt",
                                        "visible": true
                                    }
                                }
                            },

                            "visible": true
                        }
                    }
                },

                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "input": "LoginInput"
        },

        "types": {
            "LoginInput": {
                "email": "String",
                "password": "String"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=50f34f3362fdaab1b5d41c7e64bcec4dad5e9a2f416a14212c013fd5d76e93a1";