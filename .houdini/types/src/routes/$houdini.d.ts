import type * as Kit from '@sveltejs/kit';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
// @ts-ignore
type MatcherParam<M> = M extends (param : string) => param is infer U ? U extends string ? U : string : string;
type RouteParams = {  };
type RouteId = '/';
type MaybeWithVoid<T> = {} extends T ? T | void : T;
export type RequiredKeys<T> = { [K in keyof T]-?: {} extends { [P in K]: T[K] } ? never : K; }[keyof T];
type OutputDataShape<T> = MaybeWithVoid<Omit<App.PageData, RequiredKeys<T>> & Partial<Pick<App.PageData, keyof T & keyof App.PageData>> & Record<string, any>>
type EnsureDefined<T> = T extends null | undefined ? {} : T;
type OptionalUnion<U extends Record<string, any>, A extends keyof U = U extends U ? keyof U : never> = U extends unknown ? { [P in Exclude<A, keyof U>]?: never } & U : never;
export type Snapshot<T = any> = Kit.Snapshot<T>;
type PageParentData = EnsureDefined<LayoutData>;
type LayoutRouteId = RouteId | "/" | "/(company)/about" | "/(company)/careers" | "/(company)/community-guidelines" | "/(company)/contact" | "/(company)/escrow" | "/(company)/faq" | "/(company)/how-it-works" | "/(company)/press" | "/(company)/privacy" | "/(company)/security" | "/(company)/taskee-fees" | "/(company)/tasker-fees" | "/(company)/tasker-principles" | "/(company)/terms" | "/(protected)/dashboard" | "/(protected)/dashboard/bids" | "/(protected)/dashboard/create-task" | "/(protected)/dashboard/find-tasks" | "/(protected)/dashboard/messages" | "/(protected)/dashboard/messages/to/[pubkey]" | "/(protected)/dashboard/profile" | "/(protected)/dashboard/profile/edit" | "/(protected)/dashboard/settings" | "/(protected)/dashboard/task/[taskId]" | "/(protected)/dashboard/task/[taskId]/bids" | "/(protected)/dashboard/taskees" | "/(protected)/dashboard/taskees/profile/[id]" | "/(protected)/dashboard/wallet" | "/(protected)/dashboard/wallet/breez" | "/(protected)/dashboard/wallet/bsc" | "/(protected)/dashboard/wallet/rsk" | "/(protected)/feedback" | "/404" | "/auth/login" | "/auth/onboarding" | "/auth/recover/send" | "/auth/recover/verify-email" | "/auth/recover/[npub]" | "/auth/signup" | "/tasks" | "/tasks/task/[taskId]" | "/verify-email" | null
type LayoutParams = RouteParams & { pubkey?: string; taskId?: string; id?: string; npub?: string }
type LayoutServerParentData = EnsureDefined<{}>;
type LayoutParentData = EnsureDefined<{}>;
						type MakeOptional<Target, Keys extends keyof Target> = Omit<Target, Keys> & {
							[Key in Keys]?: Target[Key] | undefined | null
						}
					

export type PageServerData = null;
export type PageLoad<OutputData extends OutputDataShape<PageParentData> = OutputDataShape<PageParentData>> = Kit.Load<RouteParams, PageServerData, PageParentData, OutputData, RouteId>;
export type PageLoadEvent = Parameters<PageLoad>[0];
export type PageData = Expand<Expand<Omit<PageParentData, keyof PageParentData & EnsureDefined<PageServerData>> & OptionalUnion<EnsureDefined<PageParentData & EnsureDefined<PageServerData>>>> & {  }>;
export type PageProps = { data: PageData }
export type LayoutServerLoad<OutputData extends Partial<App.PageData> & Record<string, any> | void = Partial<App.PageData> & Record<string, any> | void> = Kit.ServerLoad<LayoutParams, LayoutServerParentData, OutputData, LayoutRouteId>;
export type LayoutServerLoadEvent = Parameters<LayoutServerLoad>[0];
export type LayoutServerData = null;
export type LayoutLoad<OutputData extends OutputDataShape<LayoutParentData> = OutputDataShape<LayoutParentData>> = Kit.Load<LayoutParams, LayoutServerData, LayoutParentData, OutputData, LayoutRouteId>;
export type LayoutLoadEvent = Parameters<LayoutLoad>[0];
export type LayoutData = Expand<Expand<Omit<LayoutParentData, keyof Kit.LoadProperties<Awaited<ReturnType<typeof import('./proxy+layout.js').load>>>> & OptionalUnion<EnsureDefined<Kit.LoadProperties<Awaited<ReturnType<typeof import('./proxy+layout.js').load>>>>>> & {  }>;
export type LayoutProps = { data: LayoutData; children: import("svelte").Snippet }
export type RequestEvent = Kit.RequestEvent<RouteParams, RouteId>;