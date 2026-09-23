import type * as Kit from '@sveltejs/kit';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;
type RouteParams = {  };
type RouteId = '/(app)';
type MaybeWithVoid<T> = {} extends T ? T | void : T;
export type RequiredKeys<T> = { [K in keyof T]-?: {} extends { [P in K]: T[K] } ? never : K; }[keyof T];
type OutputDataShape<T> = MaybeWithVoid<Omit<App.PageData, RequiredKeys<T>> & Partial<Pick<App.PageData, keyof T & keyof App.PageData>> & Record<string, any>>
type EnsureDefined<T> = T extends null | undefined ? {} : T;
type OptionalUnion<U extends Record<string, any>, A extends keyof U = U extends U ? keyof U : never> = U extends unknown ? { [P in Exclude<A, keyof U>]?: never } & U : never;
export type Snapshot<T = any> = Kit.Snapshot<T>;
type LayoutRouteId = RouteId | "/(app)/(protected)/(debug)/debug-nostr" | "/(app)/(protected)/(debug)/debug-smart-contract" | "/(app)/(protected)/(debug)/debug-wallet" | "/(app)/(protected)/bids" | "/(app)/(protected)/create-task" | "/(app)/(protected)/earning" | "/(app)/(protected)/earning/alerts" | "/(app)/(protected)/earning/bids" | "/(app)/(protected)/earning/contracts" | "/(app)/(protected)/earning/contracts/[contractId]" | "/(app)/(protected)/earning/my-services" | "/(app)/(protected)/earning/requests" | "/(app)/(protected)/feedback" | "/(app)/(protected)/hiring" | "/(app)/(protected)/hiring/contracts" | "/(app)/(protected)/hiring/contracts/[contractId]" | "/(app)/(protected)/hiring/my-tasks" | "/(app)/(protected)/hiring/service-requests" | "/(app)/(protected)/messages" | "/(app)/(protected)/messages/to/[pubkey]" | "/(app)/(protected)/notifications" | "/(app)/(protected)/profile" | "/(app)/(protected)/profile/edit" | "/(app)/(protected)/reviews" | "/(app)/(protected)/settings" | "/(app)/(protected)/settings/actions" | "/(app)/(protected)/settings/devices" | "/(app)/(protected)/settings/muted" | "/(app)/(protected)/settings/nostr" | "/(app)/(protected)/settings/notifications" | "/(app)/(protected)/settings/recovery" | "/(app)/(protected)/task/[taskId]/bids" | "/(app)/(protected)/wallet" | "/(app)/404" | "/(app)/ab-25-contest" | "/(app)/auth/login" | "/(app)/auth/onboarding" | "/(app)/auth/recover/send" | "/(app)/auth/recover/[npub]" | "/(app)/auth/signup" | "/(app)/e2e/service-harness.html" | "/(app)/npub/[npub]" | "/(app)/services" | "/(app)/services/[serviceId]" | "/(app)/tasks" | "/(app)/tasks/[taskId]" | "/(app)/verify-email"
type LayoutParams = RouteParams & { contractId?: string; pubkey?: string; taskId?: string; npub?: string; serviceId?: string }
type LayoutParentData = EnsureDefined<import('../$types.js').LayoutData>;

export type LayoutServerData = null;
export type LayoutLoad<OutputData extends OutputDataShape<LayoutParentData> = OutputDataShape<LayoutParentData>> = Kit.Load<LayoutParams, LayoutServerData, LayoutParentData, OutputData, LayoutRouteId>;
export type LayoutLoadEvent = Parameters<LayoutLoad>[0];
export type LayoutData = Expand<Omit<LayoutParentData, keyof Kit.LoadProperties<Awaited<ReturnType<typeof import('./proxy+layout.js').load>>>> & OptionalUnion<EnsureDefined<Kit.LoadProperties<Awaited<ReturnType<typeof import('./proxy+layout.js').load>>>>>>;
export type LayoutProps = { params: LayoutParams; data: LayoutData; children: import("svelte").Snippet }