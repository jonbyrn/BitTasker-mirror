# BitTasker Wallet setup

## Bitcoin Wallet

- **Implementation**: Integrated non-custodial Bitcoin wallet
- **Features**:
  - Support for Bitcoin, Lightning, and Liquid network
  - USDT on Liquid support
  - Transaction history
  - Multiple address management
  - Hardware wallet connectivity
  - Balance display in multiple currencies
  - Fee estimation
  - Payment requests
  - Whitelisted Bitcoin addresses for off-platform transfers
  - Withdrawal notifications and reminders
  - Identity re-verification for sending Bitcoin

## Payment Processing

- **Implementation**: Secure escrow-based payment system
- **Features**:
  - Milestone-based payments
  - Escrow services
  - Automatic release conditions
  - Fee calculation based on user levels
  - Refund mechanisms
  - Dispute resolution process
  - Currency conversion
  - Payment receipts and invoicing
  - Multiple payment method options (Fiat, USDT, Bitcoin)
  - Customizable payment splits between methods (e.g., 80% Fiat/20% Bitcoin)
  - Real-time Bitcoin/USD currency converter for pricing transparency

## 4. Bitcoin Wallet Integration

- [ ] Implement basic Bitcoin wallet functionality
- [ ] Set up secure key management for wallet
- [ ] Create transaction history visualization
- [ ] Implement escrow-based payment system
- [ ] Add support for multiple address types
- [ ] Develop whitelisted address management
- [ ] Create withdrawal notification system
- [ ] Implement identity re-verification for Bitcoin transactions

## 13. Lightning & Liquid Integration

- [ ] Implement Lightning Network payment channels
- [ ] Create Liquid Network transaction capabilities
- [ ] Develop atomic swap functionality for cross-chain operations
- [ ] Implement escrow mechanics using timelocks
- [ ] Create multi-signature wallet options for security

## Feature initial explanation

great questions! This is an area where we'll be doing things a little different as well 😃

We're going to want to run the wallet on Bitcoin Liquid, a Layer 2 solution for Bitcoin. Bitcoin Liquid is compatible with lightning (another Bitcoin Layer 2), and we want to use that to minimize Bitcoin transaction fees.

Liquid provides smart contract functionality, so we're going to want to use that for an escrow service, as well as for taking our fee from the transaction. This might be tricky as Liquid isn't hugely popular, so they might be lacking in documentation and examples.

Users should be able to send and receive Bitcoin to their wallets on BitTasker, via lightning and on-chain, with QR codes and addresses, etc. They should also be able to pay for tasks from another wallet (so they can pay from their BitTasker wallet, or another wallet not on BitTasker). Paying from the user's BitTasker BTC wallet should be transparent (so the user can see something like "pay with Bitcoin", with their available balance, but not need to deal with QR codes or addresses, unless they're paying from another wallet). I believe Nostr has lightning integration (they call them "zaps"), so we may want/need to use and/or integrate with that.

Obviously their BTC private key should be E2EE and we shouldn't be able to access it. For the seed phrase, yes let's generate one, and also offer the user to store it E2EE. Both should have warnings ("Warning: if you don't want to store your seed phrase with us and you lose it and lose access to your account, we cannot recover your Bitcoin" and "Warning: if you store your seed phrase with us and someone gains unauthorized access to your account, they will have access to your seed phrase and can take your Bitcoin"). I think we'll want to have some documentation as well that details how Bitcoin makes them their own bank, so they need to keep their account secure, and that they should use a hardware wallet to securely store most of their Bitcoin.

And now that I think about it, if we can we should support hardware wallets for users to work with their BTC on BitTasker (ie: "Connect your hardware wallet for enhanced security").

No file chosen

## Summary

So here's what I got from that.

BitTasker will create a new wallet for each user where they can receive or send tokens.
We will show the mnemonic while user signup with the appropriate warning
The seed phrase will be encrypted the same way the nostr secret key is (probably with the same password, TBD). Loosing the account will mean loosing the wallet, unless they have the seed phrase.
We can implement nostr's implementation with lightning instead of creating a new wallet ourselves (I do not know a lot about this, need some research)
Lastly in near future we should add support for hardware wallets.

## Links & References

Nostr Wallet connect getting started: https://docs.nwc.dev/bitcoin-lightning-wallets/getting-started
Best practices: https://docs.nwc.dev/bitcoin-lightning-wallets/best-practices
NWC Code examples: https://docs.nwc.dev/bitcoin-lightning-wallets/code-examples
NWC relay: https://docs.nwc.dev/bitcoin-lightning-wallets/nwc-relay
GetAlby hub: 'https://github.com/getAlby/hub'
Coinos server: 'https://github.com/coinos/coinos-server'
JS sdk wallet connect git project docs: 'https://github.com/getAlby/js-sdk?tab=readme-ov-file#nostr-wallet-connect-documentation'
Alby NWC Relay: 'https://guides.getalby.com/developer-guide/nostr-wallet-connect-api/building-nwc-wallet-services/alby-nwc-relay'
NWC overview: https://docs.nwc.dev/reference-api/overview
Error codes: https://docs.nwc.dev/reference-api/error-codes
Connecting lightning wallets to webapp: https://github.com/getAlby/bitcoin-connect

## API endpoints:

```
"/api/v1/bitcoin": {
            "get": {
                "operationId": "BitcoinController_getInfo_v1",
                "parameters": [],
                "responses": {
                    "200": {
                        "description": ""
                    }
                },
                "summary": "Get general information about the Bitcoin service",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/health": {
            "get": {
                "operationId": "BitcoinController_healthCheck_v1",
                "parameters": [],
                "responses": {
                    "200": {
                        "description": ""
                    }
                },
                "summary": "Check the health of the Bitcoin service and connections",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/wallet": {
            "get": {
                "operationId": "BitcoinController_getOrCreateWallet_v1",
                "parameters": [],
                "responses": {
                    "200": {
                        "description": "Wallet information retrieved or new wallet created",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "id": {
                                            "type": "number",
                                            "example": 1
                                        },
                                        "network": {
                                            "type": "string",
                                            "example": "testnet"
                                        },
                                        "addresses": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "address": {
                                                        "type": "string",
                                                        "example": "tb1qz5zehes4aucht68krv88tvjz3sd5l0ekrh4n5k"
                                                    },
                                                    "path": {
                                                        "type": "string",
                                                        "example": "m/44'/0'/0'/0/0"
                                                    },
                                                    "type": {
                                                        "type": "string",
                                                        "example": "P2WPKH"
                                                    },
                                                    "createdAt": {
                                                        "type": "string",
                                                        "format": "date-time"
                                                    }
                                                }
                                            }
                                        },
                                        "createdAt": {
                                            "type": "string",
                                            "format": "date-time"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "401": {
                        "description": "Unauthorized"
                    }
                },
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Create or get Bitcoin wallet for the authenticated user",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/wallet/balance": {
            "get": {
                "operationId": "BitcoinController_getWalletBalance_v1",
                "parameters": [],
                "responses": {
                    "200": {
                        "description": "User balances retrieved",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "addresses": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "address": {
                                                        "type": "string",
                                                        "example": "tb1qz5zehes4aucht68krv88tvjz3sd5l0ekrh4n5k"
                                                    },
                                                    "balance": {
                                                        "type": "number",
                                                        "example": 0.01234567
                                                    },
                                                    "unconfirmedBalance": {
                                                        "type": "number",
                                                        "example": 0
                                                    },
                                                    "totalReceived": {
                                                        "type": "number",
                                                        "example": 0.05678901
                                                    },
                                                    "totalSent": {
                                                        "type": "number",
                                                        "example": 0.04444334
                                                    },
                                                    "txCount": {
                                                        "type": "number",
                                                        "example": 5
                                                    }
                                                }
                                            }
                                        },
                                        "totalBalance": {
                                            "type": "number",
                                            "example": 0.01234567
                                        },
                                        "totalUnconfirmedBalance": {
                                            "type": "number",
                                            "example": 0
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "401": {
                        "description": "Unauthorized"
                    }
                },
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Get wallet balance for the authenticated user",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/wallet/address": {
            "post": {
                "operationId": "BitcoinController_generateNewAddress_v1",
                "parameters": [],
                "responses": {
                    "201": {
                        "description": "New address created",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "address": {
                                            "type": "string",
                                            "example": "tb1qz5zehes4aucht68krv88tvjz3sd5l0ekrh4n5k"
                                        },
                                        "path": {
                                            "type": "string",
                                            "example": "m/44'/0'/0'/0/1"
                                        },
                                        "type": {
                                            "type": "string",
                                            "example": "P2WPKH"
                                        },
                                        "createdAt": {
                                            "type": "string",
                                            "format": "date-time"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "401": {
                        "description": "Unauthorized"
                    },
                    "404": {
                        "description": "No wallet found for user"
                    }
                },
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Create a new Bitcoin address for the user",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/fees": {
            "get": {
                "operationId": "BitcoinController_getFeeEstimates_v1",
                "parameters": [],
                "responses": {
                    "200": {
                        "description": "Fee estimates retrieved",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "lowPriority": {
                                            "type": "number",
                                            "example": 1
                                        },
                                        "mediumPriority": {
                                            "type": "number",
                                            "example": 5
                                        },
                                        "highPriority": {
                                            "type": "number",
                                            "example": 10
                                        },
                                        "lastUpdated": {
                                            "type": "string",
                                            "format": "date-time"
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                "summary": "Get fee estimates for Bitcoin transactions",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/price": {
            "get": {
                "operationId": "BitcoinController_getBitcoinPrice_v1",
                "parameters": [],
                "responses": {
                    "200": {
                        "description": "Bitcoin price retrieved",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "usd": {
                                            "type": "number",
                                            "example": 45123.45
                                        },
                                        "gbp": {
                                            "type": "number",
                                            "example": 32456.78
                                        },
                                        "eur": {
                                            "type": "number",
                                            "example": 38789.12
                                        },
                                        "lastUpdated": {
                                            "type": "string",
                                            "format": "date-time"
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                "summary": "Get current Bitcoin price",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/convert": {
            "post": {
                "operationId": "BitcoinController_convertFiatToBitcoin_v1",
                "parameters": [],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": "#/components/schemas/FiatConversionDto"
                            }
                        }
                    }
                },
                "responses": {
                    "200": {
                        "description": "Conversion calculated",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "fiatAmount": {
                                            "type": "number",
                                            "example": 1000
                                        },
                                        "fiatCurrency": {
                                            "type": "string",
                                            "example": "USD"
                                        },
                                        "bitcoinAmount": {
                                            "type": "number",
                                            "example": 0.02216
                                        },
                                        "exchangeRate": {
                                            "type": "number",
                                            "example": 45123.45
                                        },
                                        "lastUpdated": {
                                            "type": "string",
                                            "format": "date-time"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "400": {
                        "description": "Invalid input or unsupported currency"
                    }
                },
                "summary": "Convert fiat currency to Bitcoin",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/balances": {
            "get": {
                "operationId": "BitcoinController_getUserBalances_v1",
                "parameters": [],
                "responses": {
                    "200": {
                        "description": "User balances retrieved",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "addresses": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "address": {
                                                        "type": "string",
                                                        "example": "tb1qz5zehes4aucht68krv88tvjz3sd5l0ekrh4n5k"
                                                    },
                                                    "balance": {
                                                        "type": "number",
                                                        "example": 0.01234567
                                                    },
                                                    "unconfirmedBalance": {
                                                        "type": "number",
                                                        "example": 0
                                                    },
                                                    "totalReceived": {
                                                        "type": "number",
                                                        "example": 0.05678901
                                                    },
                                                    "totalSent": {
                                                        "type": "number",
                                                        "example": 0.04444334
                                                    },
                                                    "txCount": {
                                                        "type": "number",
                                                        "example": 5
                                                    }
                                                }
                                            }
                                        },
                                        "totalBalance": {
                                            "type": "number",
                                            "example": 0.01234567
                                        },
                                        "totalUnconfirmedBalance": {
                                            "type": "number",
                                            "example": 0
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "401": {
                        "description": "Unauthorized"
                    }
                },
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Get balances for all addresses of the authenticated user",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/address/{address}/balance": {
            "get": {
                "operationId": "BitcoinController_getAddressBalance_v1",
                "parameters": [
                    {
                        "name": "address",
                        "required": true,
                        "in": "path",
                        "description": "Bitcoin address to get balance for",
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Address balance retrieved",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "address": {
                                            "type": "string",
                                            "example": "tb1qz5zehes4aucht68krv88tvjz3sd5l0ekrh4n5k"
                                        },
                                        "balance": {
                                            "type": "number",
                                            "example": 0.01234567
                                        },
                                        "unconfirmedBalance": {
                                            "type": "number",
                                            "example": 0
                                        },
                                        "totalReceived": {
                                            "type": "number",
                                            "example": 0.05678901
                                        },
                                        "totalSent": {
                                            "type": "number",
                                            "example": 0.04444334
                                        },
                                        "txCount": {
                                            "type": "number",
                                            "example": 5
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "400": {
                        "description": "Invalid address format"
                    }
                },
                "summary": "Get balance for a specific Bitcoin address",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/address/{address}/transactions": {
            "get": {
                "operationId": "BitcoinController_getAddressTransactions_v1",
                "parameters": [
                    {
                        "name": "address",
                        "required": true,
                        "in": "path",
                        "description": "Bitcoin address to get transactions for",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "limit",
                        "required": false,
                        "in": "query",
                        "description": "Maximum number of transactions to return",
                        "schema": {
                            "type": "number"
                        }
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Transactions retrieved",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "txid": {
                                                "type": "string",
                                                "example": "1a2b3c4d5e6f7g8h9i0j"
                                            },
                                            "blockHeight": {
                                                "type": "number",
                                                "example": 680000
                                            },
                                            "confirmed": {
                                                "type": "boolean",
                                                "example": true
                                            },
                                            "confirmationTime": {
                                                "type": "string",
                                                "format": "date-time",
                                                "nullable": true
                                            },
                                            "fees": {
                                                "type": "number",
                                                "example": 0.00005678
                                            },
                                            "amount": {
                                                "type": "number",
                                                "example": 0.12345678
                                            },
                                            "type": {
                                                "type": "string",
                                                "enum": [
                                                    "incoming",
                                                    "outgoing",
                                                    "self"
                                                ],
                                                "example": "incoming"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "400": {
                        "description": "Invalid address format"
                    }
                },
                "summary": "Get transactions for a specific Bitcoin address",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
        "/api/v1/bitcoin/whitelist": {
            "post": {
                "operationId": "BitcoinController_whitelistAddress_v1",
                "parameters": [],
                "requestBody": {
                    "required": true,
                    "content": {
                        "application/json": {
                            "schema": {
                                "$ref": "#/components/schemas/WhitelistAddressDto"
                            }
                        }
                    }
                },
                "responses": {
                    "201": {
                        "description": "Address whitelisted successfully",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "id": {
                                            "type": "number",
                                            "example": 1
                                        },
                                        "userId": {
                                            "type": "number",
                                            "example": 42
                                        },
                                        "label": {
                                            "type": "string",
                                            "example": "Hardware Wallet"
                                        },
                                        "address": {
                                            "type": "string",
                                            "example": "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"
                                        },
                                        "description": {
                                            "type": "string",
                                            "example": "Cold storage for savings",
                                            "nullable": true
                                        },
                                        "createdAt": {
                                            "type": "string",
                                            "format": "date-time"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "400": {
                        "description": "Invalid input data"
                    },
                    "401": {
                        "description": "Unauthorized"
                    }
                },
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Add a Bitcoin address to user whitelist",
                "tags": [
                    "Bitcoin"
                ]
            },
            "get": {
                "operationId": "BitcoinController_getWhitelistedAddresses_v1",
                "parameters": [],
                "responses": {
                    "200": {
                        "description": "Whitelisted addresses retrieved",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "id": {
                                                "type": "number",
                                                "example": 1
                                            },
                                            "userId": {
                                                "type": "number",
                                                "example": 42
                                            },
                                            "label": {
                                                "type": "string",
                                                "example": "Hardware Wallet"
                                            },
                                            "address": {
                                                "type": "string",
                                                "example": "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"
                                            },
                                            "description": {
                                                "type": "string",
                                                "example": "Cold storage for savings",
                                                "nullable": true
                                            },
                                            "createdAt": {
                                                "type": "string",
                                                "format": "date-time"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "401": {
                        "description": "Unauthorized"
                    }
                },
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Get user's whitelisted Bitcoin addresses",
                "tags": [
                    "Bitcoin"
                ]
            }
        },
```
