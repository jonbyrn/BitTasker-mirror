
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/(company)" | "/(app)/(protected)/(debug)" | "/(app)/(protected)" | "/(app)" | "/" | "/(app)/404" | "/(company)/_taproot" | "/(company)/_taproot/[...slug]" | "/(app)/ab-25-contest" | "/(company)/about" | "/(app)/auth" | "/(app)/auth/login" | "/(app)/auth/onboarding" | "/(app)/auth/recover" | "/(app)/auth/recover/send" | "/(app)/auth/recover/[npub]" | "/(app)/auth/signup" | "/(app)/(protected)/bids" | "/(company)/careers" | "/(company)/community-guidelines" | "/(company)/contact" | "/(app)/(protected)/create-task" | "/(app)/(protected)/(debug)/debug-nostr" | "/(app)/(protected)/(debug)/debug-smart-contract" | "/(app)/(protected)/(debug)/debug-wallet" | "/(company)/delete-account" | "/(app)/e2e" | "/(app)/e2e/service-harness.html" | "/(app)/(protected)/earning" | "/(app)/(protected)/earning/alerts" | "/(app)/(protected)/earning/bids" | "/(app)/(protected)/earning/contracts" | "/(app)/(protected)/earning/contracts/[contractId]" | "/(app)/(protected)/earning/my-services" | "/(app)/(protected)/earning/requests" | "/(app)/(protected)/earning/saved-searches" | "/(company)/faq" | "/(app)/(protected)/feedback" | "/(app)/firebase-config.json" | "/(app)/(protected)/hiring" | "/(app)/(protected)/hiring/contracts" | "/(app)/(protected)/hiring/contracts/[contractId]" | "/(app)/(protected)/hiring/my-tasks" | "/(app)/(protected)/hiring/service-requests" | "/(company)/how-it-works" | "/(app)/(protected)/messages" | "/(app)/(protected)/messages/to" | "/(app)/(protected)/messages/to/[pubkey]" | "/(app)/(protected)/notifications" | "/(app)/npub" | "/(app)/npub/[npub]" | "/(company)/press" | "/(company)/privacy" | "/(app)/(protected)/profile" | "/(app)/(protected)/profile/edit" | "/(app)/(protected)/reviews" | "/(company)/secure-payments" | "/(company)/security" | "/(app)/services" | "/(app)/services/[serviceId]" | "/(app)/(protected)/settings" | "/(app)/(protected)/settings/actions" | "/(app)/(protected)/settings/devices" | "/(app)/(protected)/settings/muted" | "/(app)/(protected)/settings/nostr" | "/(app)/(protected)/settings/notifications" | "/(app)/(protected)/settings/recovery" | "/(company)/taskee-fees" | "/(company)/tasker-fees" | "/(company)/tasker-principles" | "/(app)/tasks" | "/(app)/tasks/[taskId]" | "/(app)/(protected)/task" | "/(app)/(protected)/task/[taskId]" | "/(app)/(protected)/task/[taskId]/bids" | "/(company)/terms" | "/(app)/verify-email" | "/(app)/(protected)/wallet";
		RouteParams(): {
			"/(company)/_taproot/[...slug]": { slug: string };
			"/(app)/auth/recover/[npub]": { npub: string };
			"/(app)/(protected)/earning/contracts/[contractId]": { contractId: string };
			"/(app)/(protected)/hiring/contracts/[contractId]": { contractId: string };
			"/(app)/(protected)/messages/to/[pubkey]": { pubkey: string };
			"/(app)/npub/[npub]": { npub: string };
			"/(app)/services/[serviceId]": { serviceId: string };
			"/(app)/tasks/[taskId]": { taskId: string };
			"/(app)/(protected)/task/[taskId]": { taskId: string };
			"/(app)/(protected)/task/[taskId]/bids": { taskId: string }
		};
		LayoutParams(): {
			"/(company)": { slug?: string };
			"/(app)/(protected)/(debug)": Record<string, never>;
			"/(app)/(protected)": { contractId?: string; pubkey?: string; taskId?: string };
			"/(app)": { npub?: string; contractId?: string; pubkey?: string; serviceId?: string; taskId?: string };
			"/": { slug?: string; npub?: string; contractId?: string; pubkey?: string; serviceId?: string; taskId?: string };
			"/(app)/404": Record<string, never>;
			"/(company)/_taproot": { slug?: string };
			"/(company)/_taproot/[...slug]": { slug: string };
			"/(app)/ab-25-contest": Record<string, never>;
			"/(company)/about": Record<string, never>;
			"/(app)/auth": { npub?: string };
			"/(app)/auth/login": Record<string, never>;
			"/(app)/auth/onboarding": Record<string, never>;
			"/(app)/auth/recover": { npub?: string };
			"/(app)/auth/recover/send": Record<string, never>;
			"/(app)/auth/recover/[npub]": { npub: string };
			"/(app)/auth/signup": Record<string, never>;
			"/(app)/(protected)/bids": Record<string, never>;
			"/(company)/careers": Record<string, never>;
			"/(company)/community-guidelines": Record<string, never>;
			"/(company)/contact": Record<string, never>;
			"/(app)/(protected)/create-task": Record<string, never>;
			"/(app)/(protected)/(debug)/debug-nostr": Record<string, never>;
			"/(app)/(protected)/(debug)/debug-smart-contract": Record<string, never>;
			"/(app)/(protected)/(debug)/debug-wallet": Record<string, never>;
			"/(company)/delete-account": Record<string, never>;
			"/(app)/e2e": Record<string, never>;
			"/(app)/e2e/service-harness.html": Record<string, never>;
			"/(app)/(protected)/earning": { contractId?: string };
			"/(app)/(protected)/earning/alerts": Record<string, never>;
			"/(app)/(protected)/earning/bids": Record<string, never>;
			"/(app)/(protected)/earning/contracts": { contractId?: string };
			"/(app)/(protected)/earning/contracts/[contractId]": { contractId: string };
			"/(app)/(protected)/earning/my-services": Record<string, never>;
			"/(app)/(protected)/earning/requests": Record<string, never>;
			"/(app)/(protected)/earning/saved-searches": Record<string, never>;
			"/(company)/faq": Record<string, never>;
			"/(app)/(protected)/feedback": Record<string, never>;
			"/(app)/firebase-config.json": Record<string, never>;
			"/(app)/(protected)/hiring": { contractId?: string };
			"/(app)/(protected)/hiring/contracts": { contractId?: string };
			"/(app)/(protected)/hiring/contracts/[contractId]": { contractId: string };
			"/(app)/(protected)/hiring/my-tasks": Record<string, never>;
			"/(app)/(protected)/hiring/service-requests": Record<string, never>;
			"/(company)/how-it-works": Record<string, never>;
			"/(app)/(protected)/messages": { pubkey?: string };
			"/(app)/(protected)/messages/to": { pubkey?: string };
			"/(app)/(protected)/messages/to/[pubkey]": { pubkey: string };
			"/(app)/(protected)/notifications": Record<string, never>;
			"/(app)/npub": { npub?: string };
			"/(app)/npub/[npub]": { npub: string };
			"/(company)/press": Record<string, never>;
			"/(company)/privacy": Record<string, never>;
			"/(app)/(protected)/profile": Record<string, never>;
			"/(app)/(protected)/profile/edit": Record<string, never>;
			"/(app)/(protected)/reviews": Record<string, never>;
			"/(company)/secure-payments": Record<string, never>;
			"/(company)/security": Record<string, never>;
			"/(app)/services": { serviceId?: string };
			"/(app)/services/[serviceId]": { serviceId: string };
			"/(app)/(protected)/settings": Record<string, never>;
			"/(app)/(protected)/settings/actions": Record<string, never>;
			"/(app)/(protected)/settings/devices": Record<string, never>;
			"/(app)/(protected)/settings/muted": Record<string, never>;
			"/(app)/(protected)/settings/nostr": Record<string, never>;
			"/(app)/(protected)/settings/notifications": Record<string, never>;
			"/(app)/(protected)/settings/recovery": Record<string, never>;
			"/(company)/taskee-fees": Record<string, never>;
			"/(company)/tasker-fees": Record<string, never>;
			"/(company)/tasker-principles": Record<string, never>;
			"/(app)/tasks": { taskId?: string };
			"/(app)/tasks/[taskId]": { taskId: string };
			"/(app)/(protected)/task": { taskId?: string };
			"/(app)/(protected)/task/[taskId]": { taskId: string };
			"/(app)/(protected)/task/[taskId]/bids": { taskId: string };
			"/(company)/terms": Record<string, never>;
			"/(app)/verify-email": Record<string, never>;
			"/(app)/(protected)/wallet": Record<string, never>
		};
		Pathname(): "/" | "/404" | "/_taproot" | `/_taproot/${string}` & {} | `/_taproot/${string}/` & {} | "/ab-25-contest" | "/about" | "/auth/login" | "/auth/onboarding" | "/auth/recover/send" | `/auth/recover/${string}` & {} | "/auth/signup" | "/bids" | "/careers" | "/community-guidelines" | "/contact" | "/create-task" | "/debug-nostr" | "/debug-smart-contract" | "/debug-wallet" | "/delete-account" | "/e2e/service-harness.html" | "/earning" | "/earning/alerts" | "/earning/bids" | "/earning/contracts" | `/earning/contracts/${string}` & {} | "/earning/my-services" | "/earning/requests" | "/faq" | "/feedback" | "/firebase-config.json" | "/hiring" | "/hiring/contracts" | `/hiring/contracts/${string}` & {} | "/hiring/my-tasks" | "/hiring/service-requests" | "/how-it-works" | "/messages" | `/messages/to/${string}` & {} | "/notifications" | `/npub/${string}` & {} | "/press" | "/privacy" | "/profile" | "/profile/edit" | "/reviews" | "/secure-payments" | "/security" | "/services" | `/services/${string}` & {} | "/settings" | "/settings/actions" | "/settings/devices" | "/settings/muted" | "/settings/nostr" | "/settings/notifications" | "/settings/recovery" | "/taskee-fees" | "/tasker-fees" | "/tasker-principles" | "/tasks" | `/tasks/${string}` & {} | `/task/${string}/bids` & {} | "/terms" | "/verify-email" | "/wallet";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/.well-known/apple-app-site-association" | "/.well-known/appspecific/com.chrome.devtools.json" | "/.well-known/assetlinks.json" | "/apple-touch-icon.png" | "/currency-symbols/Bitcoin.svg" | "/currency-symbols/Bitcoin_lightning_logo.svg" | "/currency-symbols/BNB.svg" | "/currency-symbols/LBTC.svg" | "/currency-symbols/Lightning.svg" | "/currency-symbols/USDt.svg" | "/favicon-96x96.png" | "/favicon.ico" | "/favicon.svg" | "/firebase-messaging-sw.js" | "/google-play-badge.svg" | "/illustrations/login.gif" | "/illustrations/payment.svg" | "/illustrations/profile.gif" | "/illustrations/profile.svg" | "/illustrations/signup.svg" | "/illustrations/tasks.svg" | "/illustrations/work.svg" | "/images/badges/BitTasker-Hash-Master-256x256.webp" | "/images/badges/BitTasker-Hash-Master-512x512.webp" | "/images/badges/BitTasker-Nakamoto-Newbie-256x256.webp" | "/images/badges/BitTasker-Nakamoto-Newbie-512x512.webp" | "/images/badges/BitTasker-Satoshi-Stacker-256x256.webp" | "/images/badges/BitTasker-Satoshi-Stacker-512x512.webp" | "/images/chains/arbitrum.png" | "/images/chains/aurora.png" | "/images/chains/avalanche.png" | "/images/chains/base.png" | "/images/chains/Binance-logo.svg" | "/images/chains/Bitcoin-Rootstock-logo.webp" | "/images/chains/Bitcoin.svg" | "/images/chains/celo.png" | "/images/chains/ethereum.png" | "/images/chains/fantom.png" | "/images/chains/lightning.svg" | "/images/chains/Liquid-Bitcoin.svg" | "/images/chains/moonbeam.png" | "/images/chains/optimism.png" | "/images/chains/polygon.png" | "/images/chains/Tether-USD.svg" | "/images/chains/tron.png" | "/images/contest/bitcoin-ring.png" | "/images/features/bitcoin-escrow.jpg" | "/images/features/bitcoin-escrow.webp" | "/images/features/bitcoin-money.jpg" | "/images/features/bitcoin-money.webp" | "/images/features/nostr-decentralized.jpg" | "/images/features/nostr-decentralized.webp" | "/images/features/pay-your-way.jpg" | "/images/features/pay-your-way.webp" | "/images/flags/sv.webp" | "/images/flags/us.webp" | "/images/logos/bittasker-logo-dark-compact.svg" | "/images/logos/bittasker-logo-dark-es.png" | "/images/logos/bittasker-logo-dark-es.svg" | "/images/logos/bittasker-logo-dark.png" | "/images/logos/bittasker-logo-dark.svg" | "/images/logos/bittasker-logo-light-compact.svg" | "/images/logos/bittasker-logo-light-es.svg" | "/images/logos/bittasker-logo-light.svg" | "/images/logos/bittasker-logomark-og.webp" | "/images/logos/bittasker-logomark.png" | "/images/logos/bittasker-logomark.svg" | "/images/placeholders/were-hiring-task-image-placeholder.jpg" | "/images/primal-icon-white.svg" | "/images/primal-net-qr-code-transparent-background.svg" | "/images/qr-code-twitter-FIXED-transparent-background.svg" | "/images/qr-code-twitter-transparent-background.svg" | "/images/tokens/.download-failures.json" | "/images/tokens/哈基米." | "/images/wallets/ledger.svg" | "/images/wallets/metamask.svg" | "/images/wallets/trezor.svg" | "/images/wallets/walletconnect.svg" | "/locales/en/auth.json" | "/locales/en/categories.json" | "/locales/en/common.json" | "/locales/en/company/about.json" | "/locales/en/company/careers.json" | "/locales/en/company/contact.json" | "/locales/en/company/delete_account.json" | "/locales/en/company/press.json" | "/locales/en/company/privacy_policy.json" | "/locales/en/company/secure-payments.json" | "/locales/en/company/security.json" | "/locales/en/company/terms.json" | "/locales/en/dashboard/bids.json" | "/locales/en/dashboard/contracts/actions.json" | "/locales/en/dashboard/dashboard.json" | "/locales/en/dashboard/feedback.json" | "/locales/en/dashboard/messages.json" | "/locales/en/dashboard/profile/availability.json" | "/locales/en/dashboard/profile/personal.json" | "/locales/en/dashboard/profile/profile.json" | "/locales/en/dashboard/recomendations.json" | "/locales/en/dashboard/services/browse.json" | "/locales/en/dashboard/services/create.json" | "/locales/en/dashboard/services/detail.json" | "/locales/en/dashboard/services/my-services.json" | "/locales/en/dashboard/settings.json" | "/locales/en/dashboard/tasks/create.json" | "/locales/en/dashboard/tasks/find.json" | "/locales/en/dashboard/tasks/info.json" | "/locales/en/dashboard/wallet/buysell.json" | "/locales/en/dashboard/wallet/common.json" | "/locales/en/dashboard/wallet/defi.json" | "/locales/en/dashboard/wallet/pending-swaps.json" | "/locales/en/dashboard/wallet/receive.json" | "/locales/en/dashboard/wallet/send.json" | "/locales/en/dashboard/wallet/swap.json" | "/locales/en/dashboard/wallet.json" | "/locales/en/debug.json" | "/locales/en/error.json" | "/locales/en/find_taskees.json" | "/locales/en/home.json" | "/locales/en/how_it_works.json" | "/locales/en/learn.json" | "/locales/en/moderation.json" | "/locales/en/notifications.json" | "/locales/en/onboarding.json" | "/locales/en/reviews.json" | "/locales/en/taskees/faq.json" | "/locales/en/taskees/fee.json" | "/locales/en/taskees/guidelines.json" | "/locales/en/taskees/principles.json" | "/locales/en/taskers/fee.json" | "/locales/en/uploader.json" | "/locales/es/auth.json" | "/locales/es/categories.json" | "/locales/es/common.json" | "/locales/es/company/about.json" | "/locales/es/company/careers.json" | "/locales/es/company/contact.json" | "/locales/es/company/delete_account.json" | "/locales/es/company/press.json" | "/locales/es/company/privacy_policy.json" | "/locales/es/company/secure-payments.json" | "/locales/es/company/security.json" | "/locales/es/company/terms.json" | "/locales/es/dashboard/bids.json" | "/locales/es/dashboard/contracts/actions.json" | "/locales/es/dashboard/dashboard.json" | "/locales/es/dashboard/feedback.json" | "/locales/es/dashboard/messages.json" | "/locales/es/dashboard/profile/availability.json" | "/locales/es/dashboard/profile/personal.json" | "/locales/es/dashboard/profile/profile.json" | "/locales/es/dashboard/recomendations.json" | "/locales/es/dashboard/services/browse.json" | "/locales/es/dashboard/services/create.json" | "/locales/es/dashboard/services/detail.json" | "/locales/es/dashboard/services/my-services.json" | "/locales/es/dashboard/settings.json" | "/locales/es/dashboard/tasks/create.json" | "/locales/es/dashboard/tasks/find.json" | "/locales/es/dashboard/tasks/info.json" | "/locales/es/dashboard/wallet/buysell.json" | "/locales/es/dashboard/wallet/common.json" | "/locales/es/dashboard/wallet/defi.json" | "/locales/es/dashboard/wallet/pending-swaps.json" | "/locales/es/dashboard/wallet/receive.json" | "/locales/es/dashboard/wallet/send.json" | "/locales/es/dashboard/wallet/swap.json" | "/locales/es/dashboard/wallet.json" | "/locales/es/debug.json" | "/locales/es/error.json" | "/locales/es/find_taskees.json" | "/locales/es/home.json" | "/locales/es/how_it_works.json" | "/locales/es/learn.json" | "/locales/es/moderation.json" | "/locales/es/notifications.json" | "/locales/es/onboarding.json" | "/locales/es/reviews.json" | "/locales/es/taskees/faq.json" | "/locales/es/taskees/fee.json" | "/locales/es/taskees/guidelines.json" | "/locales/es/taskees/principles.json" | "/locales/es/taskers/fee.json" | "/locales/es/uploader.json" | "/manifest.json" | "/map-pin.png" | "/robots.txt" | "/robots.txt.dev" | "/robots.txt.prod" | "/site.webmanifest" | "/sitemap.xml" | "/wasm/bitcoindevkit_bg.wasm" | "/wasm/blake3_js_bg.wasm" | "/wasm/cardano_serialization_lib_bg.wasm" | "/wasm/mappings.wasm" | "/wasm/onig.wasm" | "/wasm/rgb_lib_wasm_bindings_bg.wasm" | "/wasm/rln_wasm_sdk_bg.wasm" | "/wasm/secp256k1.wasm" | "/wasm/wasm_bg.wasm" | "/web-app-manifest-192x192.png" | "/web-app-manifest-512x512.png" | "/zapstore-badge.svg" | "/_headers" | string & {};
	}
}