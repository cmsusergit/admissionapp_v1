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
type PageServerParentData = EnsureDefined<LayoutServerData>;
type PageParentData = EnsureDefined<LayoutData>;
type LayoutRouteId = RouteId | "/" | "/adm-officer/applications" | "/adm-officer/applications/[id]" | "/adm-officer/circulars" | "/adm-officer/dashboard" | "/adm-officer/dashboard/update-comment" | "/adm-officer/help" | "/adm-officer/merit-list" | "/adm-officer/reports" | "/adm-officer/reports/conversion" | "/adm-officer/saved-reports" | "/adm-officer/saved-reports/[id]" | "/adm-officer/verification/bulk" | "/admin/academic-calendar" | "/admin/admission-sequences" | "/admin/branches" | "/admin/colleges" | "/admin/config-guide" | "/admin/courses" | "/admin/dashboard" | "/admin/docs" | "/admin/fee-structures" | "/admin/form-types" | "/admin/forms" | "/admin/forms/[id]" | "/admin/forms/[id]/edit" | "/admin/forms/new" | "/admin/help" | "/admin/merit-calculation" | "/admin/merit-formulas" | "/admin/payment-gateways" | "/admin/profile-schema" | "/admin/receipt-sequences" | "/admin/report-builder" | "/admin/universities" | "/admin/users" | "/college-auth" | "/college-auth/applications" | "/college-auth/circulars" | "/college-auth/dashboard" | "/college-auth/help" | "/college-auth/reports" | "/deo/applications" | "/deo/apply" | "/deo/dashboard" | "/deo/help" | "/deo/saved-reports" | "/deo/saved-reports/[id]" | "/deo/undertaking/[id]" | "/deo/verification/bulk" | "/fee-collector/dashboard" | "/fee-collector/help" | "/fee-collector/payments" | "/fee-collector/reports" | "/fee-collector/saved-reports" | "/fee-collector/saved-reports/[id]" | "/login" | "/logout" | "/print-profile/[applicationId]" | "/receipts/print" | "/register" | "/student" | "/student/apply" | "/student/documents" | "/student/help" | "/student/payments" | "/student/profile" | "/student/support" | "/university-auth" | "/university-auth/applications" | "/university-auth/circulars" | "/university-auth/dashboard" | "/university-auth/help" | "/university-auth/reports" | null
type LayoutParams = RouteParams & { id?: string; applicationId?: string }
type LayoutServerParentData = EnsureDefined<{}>;
type LayoutParentData = EnsureDefined<{}>;

export type PageServerLoad<OutputData extends OutputDataShape<PageServerParentData> = OutputDataShape<PageServerParentData>> = Kit.ServerLoad<RouteParams, PageServerParentData, OutputData, RouteId>;
export type PageServerLoadEvent = Parameters<PageServerLoad>[0];
export type ActionData = unknown;
export type PageServerData = Expand<OptionalUnion<EnsureDefined<Kit.LoadProperties<Awaited<ReturnType<typeof import('./proxy+page.server.js').load>>>>>>;
export type PageData = Expand<Omit<PageParentData, keyof PageServerData> & EnsureDefined<PageServerData>>;
export type Action<OutputData extends Record<string, any> | void = Record<string, any> | void> = Kit.Action<RouteParams, OutputData, RouteId>
export type Actions<OutputData extends Record<string, any> | void = Record<string, any> | void> = Kit.Actions<RouteParams, OutputData, RouteId>
export type PageProps = { params: RouteParams; data: PageData; form: ActionData }
export type LayoutServerLoad<OutputData extends OutputDataShape<LayoutServerParentData> = OutputDataShape<LayoutServerParentData>> = Kit.ServerLoad<LayoutParams, LayoutServerParentData, OutputData, LayoutRouteId>;
export type LayoutServerLoadEvent = Parameters<LayoutServerLoad>[0];
export type LayoutServerData = Expand<OptionalUnion<EnsureDefined<Kit.LoadProperties<Awaited<ReturnType<typeof import('./proxy+layout.server.js').load>>>>>>;
export type LayoutData = Expand<Omit<LayoutParentData, keyof LayoutServerData> & EnsureDefined<LayoutServerData>>;
export type LayoutProps = { params: LayoutParams; data: LayoutData; children: import("svelte").Snippet }
export type RequestEvent = Kit.RequestEvent<RouteParams, RouteId>;