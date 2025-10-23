import type log from "loglevel";

export type ExplorerUrl = Url & {
    id: Explorer;
};

type Asset = {
    blockExplorerUrl?: ExplorerUrl;
    blockExplorerApis?: ExplorerUrl[];

    rifRelay?: string;
    contracts?: {
        deployHeight: number;
        smartWalletFactory?: string;
        deployVerifier?: string;
    };
    network?: {
        chainName: string;
        chainId: number;
        rpcUrls: string[];
        nativeCurrency: {
            name: string;
            symbol: string;
            decimals: number;
        };
    };
};

export type Url = {
    normal: string;
    tor?: string;
};

const defaults = {
    // Disables API endpoints that create cooperative signatures for claim
    // and refund transactions
    // **Should only be enabled for testing purposes**
    cooperativeDisabled: false,

    loglevel: "info" as log.LogLevelDesc,
    defaultLanguage: "en",
    supportUrl: "https://support.boltz.exchange/hc/center",
    discordUrl: "https://discord.gg/QBvZGcW",
    twitterUrl: "https://twitter.com/boltzhq",
    githubUrl: "https://github.com/BoltzExchange",
    repoUrl: "https://github.com/BoltzExchange/boltz-web-app",
    docsUrl: "https://docs.boltz.exchange",
    blogUrl: "https://blog.boltz.exchange",
    nostrUrl:
        "https://primal.net/p/nprofile1qqsqcdcltmv4qanpx3p7svcufdsg9rkk00x7l2sknra4e6whkv59l7clgcdzj",
    statusUrl: "https://status.boltz.exchange",
    youtubeUrl:
        "https://www.youtube.com/playlist?list=PLkqOa9SGBeZfAEHvKkGKjeRIASeu6bNO3",
    brandingUrl: "https://github.com/BoltzExchange/logo",
    testnetUrl: "https://testnet.boltz.exchange",
    telegramUrl: "https://t.me/boltzhq",
    email: "hi@bol.tz",
    dnsOverHttps: "https://1.1.1.1/dns-query",
    chatwootUrl: "https://support.boltz.exchange",
    preimageValidation: "https://validate-payment.com",
};


export type Config = {
    apiUrl?: Url;
    network?: "mainnet" | "testnet" | "regtest";
    isBoltzClient?: boolean;
    boltzClientApiUrl?: string;
    isBeta?: boolean;
    isPro?: boolean;
    assets?: Record<string, Asset>;
    torUrl?: string;
} & typeof defaults;

const baseConfig: Config = defaults;

export enum Explorer {
    Mempool = "mempool",
    Esplora = "esplora",
    Blockscout = "blockscout",
}

const rskRpcUrls = ["https://public-node.rsk.co"];

const config = {
    ...baseConfig,
    torUrl: "http://boltzzzbnus4m7mta3cxmflnps4fp7dueu2tgurstbvrbt6xswzcocyd.onion/",
    network: "mainnet",
    loglevel: "debug",
    apiUrl: {
        normal: "https://api.boltz.exchange",
        tor: "http://boltzzzbnus4m7mta3cxmflnps4fp7dueu2tgurstbvrbt6xswzcocyd.onion/api",
    },
    assets: {
        BTC: {
            blockExplorerUrl: {
                id: Explorer.Mempool,
                normal: "https://mempool.space",
                tor: "http://mempoolhqx4isw62xs7abwphsq7ldayuidyx2v2oethdhhj6mlo2r6ad.onion",
            },
            blockExplorerApis: [
                {
                    id: Explorer.Esplora,
                    normal: "https://blockstream.info/api",
                    tor: "http://explorerzydxu5ecjrkwceayqybizmpjjznk5izmitf2modhcusuqlid.onion/api",
                },
                {
                    id: Explorer.Mempool,
                    normal: "https://mempool.space/api",
                    tor: "http://mempoolhqx4isw62xs7abwphsq7ldayuidyx2v2oethdhhj6mlo2r6ad.onion/api",
                },
            ],
        },
        "L-BTC": {
            blockExplorerUrl: {
                id: Explorer.Esplora,
                normal: "https://blockstream.info/liquid",
                tor: "http://explorerzydxu5ecjrkwceayqybizmpjjznk5izmitf2modhcusuqlid.onion/liquid",
            },
            blockExplorerApis: [
                {
                    id: Explorer.Esplora,
                    normal: "https://blockstream.info/liquid/api",
                    tor: "http://explorerzydxu5ecjrkwceayqybizmpjjznk5izmitf2modhcusuqlid.onion/liquid/api",
                },
                {
                    id: Explorer.Mempool,
                    normal: "https://liquid.network/api",
                    tor: "http://liquidmom47f6s3m53ebfxn47p76a6tlnxib3wp6deux7wuzotdr6cyd.onion/api",
                },
            ],
        },
        RBTC: {
            blockExplorerUrl: {
                id: Explorer.Blockscout,
                normal: "https://rootstock.blockscout.com",
            },
            network: {
                chainName: "Rootstock",
                chainId: 30,
                rpcUrls: rskRpcUrls,
                nativeCurrency: {
                    name: "RBTC",
                    symbol: "RBTC",
                    decimals: 18,
                },
            },
            rifRelay: "https://boltz.mainnet.relay.rifcomputing.net",
            contracts: {
                deployHeight: 6747215,
                smartWalletFactory:
                    "0x44944a80861120B58cc48B066d57cDAf5eC213dd",
                deployVerifier: "0xc0F5bEF6b20Be41174F826684c663a8635c6A081",
            },
        },
    },
} as Config;

export { config };
