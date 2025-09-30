import type * as Kit from '@sveltejs/kit';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
// @ts-ignore
type MatcherParam<M> = M extends (param : string) => param is infer U ? U extends string ? U : string : string;
type RouteParams = {  };
type RouteId = '/(protected)/dashboard/messages';
type MaybeWithVoid<T> = {} extends T ? T | void : T;
export type RequiredKeys<T> = { [K in keyof T]-?: {} extends { [P in K]: T[K] } ? never : K; }[keyof T];
type OutputDataShape<T> = MaybeWithVoid<Omit<App.PageData, RequiredKeys<T>> & Partial<Pick<App.PageData, keyof T & keyof App.PageData>> & Record<string, any>>
type EnsureDefined<T> = T extends null | undefined ? {} : T;
type OptionalUnion<U extends Record<string, any>, A extends keyof U = U extends U ? keyof U : never> = U extends unknown ? { [P in Exclude<A, keyof U>]?: never } & U : never;
export type Snapshot<T = any> = Kit.Snapshot<T>;
type PageParentData = Omit<Omit<Omit<EnsureDefined<import('../../../$houdini').LayoutData>, keyof import('../../$houdini').LayoutData> & EnsureDefined<import('../../$houdini').LayoutData>, keyof import('../$houdini').LayoutData> & EnsureDefined<import('../$houdini').LayoutData>, keyof LayoutData> & EnsureDefined<LayoutData>;
type LayoutRouteId = RouteId | "/(protected)/dashboard/messages" | "/(protected)/dashboard/messages/to/[pubkey]"
type LayoutParams = RouteParams & { pubkey?: string }
type LayoutParentData = Omit<Omit<EnsureDefined<import('../../../$houdini').LayoutData>, keyof import('../../$houdini').LayoutData> & EnsureDefined<import('../../$houdini').LayoutData>, keyof import('../$houdini').LayoutData> & EnsureDefined<import('../$houdini').LayoutData>;
						type MakeOptional<Target, Keys extends keyof Target> = Omit<Target, Keys> & {
							[Key in Keys]?: Target[Key] | undefined | null
						}
					

export type PageServerData = null;
export type PageLoad<OutputData extends OutputDataShape<PageParentData> = OutputDataShape<PageParentData>> = Kit.Load<RouteParams, PageServerData, PageParentData, OutputData, RouteId>;
export type PageLoadEvent = Parameters<PageLoad>[0];
export type PageData = Expand<Expand<Omit<PageParentData, keyof Kit.LoadProperties<Awaited<ReturnType<typeof import('../../../../../../../src/routes/(protected)/dashboard/messages/+page.js').load>>>> & OptionalUnion<EnsureDefined<Kit.LoadProperties<Awaited<ReturnType<typeof import('../../../../../../../src/routes/(protected)/dashboard/messages/+page.js').load>>>>>> & {  }>;
export type PageProps = { data: PageData }
export type LayoutServerData = null;
export type LayoutLoad<OutputData extends Partial<App.PageData> & Record<string, any> | void = Partial<App.PageData> & Record<string, any> | void> = Kit.Load<LayoutParams, LayoutServerData, LayoutParentData, OutputData, LayoutRouteId>;
export type LayoutLoadEvent = Parameters<LayoutLoad>[0];
export type LayoutData = Expand<Expand<Omit<LayoutParentData, keyof Kit.LoadProperties<Awaited<ReturnType<typeof import('../../../../../../../src/routes/(protected)/dashboard/messages/+layout.js').load>>>> & OptionalUnion<EnsureDefined<Kit.LoadProperties<Awaited<ReturnType<typeof import('../../../../../../../src/routes/(protected)/dashboard/messages/+layout.js').load>>>>>> & {  }>;
export type LayoutProps = { data: LayoutData; children: import("svelte").Snippet }