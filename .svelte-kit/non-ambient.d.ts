
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
	export interface AppTypes {
		RouteId(): "/" | "/adm-officer" | "/adm-officer/applications" | "/adm-officer/applications/[id]" | "/adm-officer/circulars" | "/adm-officer/dashboard" | "/adm-officer/dashboard/update-comment" | "/adm-officer/export" | "/adm-officer/help" | "/adm-officer/merit-list" | "/adm-officer/reports" | "/adm-officer/reports/conversion" | "/adm-officer/saved-reports" | "/adm-officer/saved-reports/[id]" | "/adm-officer/verification" | "/adm-officer/verification/bulk" | "/admin" | "/admin/academic-calendar" | "/admin/admission-sequences" | "/admin/branches" | "/admin/colleges" | "/admin/config-guide" | "/admin/courses" | "/admin/dashboard" | "/admin/docs" | "/admin/fee-structures" | "/admin/form-types" | "/admin/forms" | "/admin/forms/new" | "/admin/forms/[id]" | "/admin/forms/[id]/edit" | "/admin/help" | "/admin/merit-calculation" | "/admin/merit-formulas" | "/admin/payment-gateways" | "/admin/profile-schema" | "/admin/receipt-sequences" | "/admin/report-builder" | "/admin/universities" | "/admin/users" | "/api" | "/api/admin" | "/api/admin/check-form" | "/api/deo" | "/api/deo/get-student-profile" | "/api/payment" | "/api/payment/callback" | "/api/payment/create-order" | "/api/payment/verify" | "/api/reports" | "/api/reports/generate" | "/api/reports/profile-data" | "/api/upload" | "/auth" | "/auth/callback" | "/college-auth" | "/college-auth/applications" | "/college-auth/circulars" | "/college-auth/dashboard" | "/college-auth/help" | "/college-auth/reports" | "/deo" | "/deo/applications" | "/deo/apply" | "/deo/dashboard" | "/deo/help" | "/deo/saved-reports" | "/deo/saved-reports/[id]" | "/deo/undertaking" | "/deo/undertaking/[id]" | "/deo/verification" | "/deo/verification/bulk" | "/fee-collector" | "/fee-collector/dashboard" | "/fee-collector/export" | "/fee-collector/help" | "/fee-collector/payments" | "/fee-collector/reports" | "/fee-collector/saved-reports" | "/fee-collector/saved-reports/[id]" | "/login" | "/logout" | "/print-profile" | "/print-profile/[applicationId]" | "/receipts" | "/receipts/print" | "/register" | "/student" | "/student/apply" | "/student/documents" | "/student/help" | "/student/payments" | "/student/profile" | "/student/support" | "/university-auth" | "/university-auth/applications" | "/university-auth/circulars" | "/university-auth/dashboard" | "/university-auth/help" | "/university-auth/reports";
		RouteParams(): {
			"/adm-officer/applications/[id]": { id: string };
			"/adm-officer/saved-reports/[id]": { id: string };
			"/admin/forms/[id]": { id: string };
			"/admin/forms/[id]/edit": { id: string };
			"/deo/saved-reports/[id]": { id: string };
			"/deo/undertaking/[id]": { id: string };
			"/fee-collector/saved-reports/[id]": { id: string };
			"/print-profile/[applicationId]": { applicationId: string }
		};
		LayoutParams(): {
			"/": { id?: string; applicationId?: string };
			"/adm-officer": { id?: string };
			"/adm-officer/applications": { id?: string };
			"/adm-officer/applications/[id]": { id: string };
			"/adm-officer/circulars": Record<string, never>;
			"/adm-officer/dashboard": Record<string, never>;
			"/adm-officer/dashboard/update-comment": Record<string, never>;
			"/adm-officer/export": Record<string, never>;
			"/adm-officer/help": Record<string, never>;
			"/adm-officer/merit-list": Record<string, never>;
			"/adm-officer/reports": Record<string, never>;
			"/adm-officer/reports/conversion": Record<string, never>;
			"/adm-officer/saved-reports": { id?: string };
			"/adm-officer/saved-reports/[id]": { id: string };
			"/adm-officer/verification": Record<string, never>;
			"/adm-officer/verification/bulk": Record<string, never>;
			"/admin": { id?: string };
			"/admin/academic-calendar": Record<string, never>;
			"/admin/admission-sequences": Record<string, never>;
			"/admin/branches": Record<string, never>;
			"/admin/colleges": Record<string, never>;
			"/admin/config-guide": Record<string, never>;
			"/admin/courses": Record<string, never>;
			"/admin/dashboard": Record<string, never>;
			"/admin/docs": Record<string, never>;
			"/admin/fee-structures": Record<string, never>;
			"/admin/form-types": Record<string, never>;
			"/admin/forms": { id?: string };
			"/admin/forms/new": Record<string, never>;
			"/admin/forms/[id]": { id: string };
			"/admin/forms/[id]/edit": { id: string };
			"/admin/help": Record<string, never>;
			"/admin/merit-calculation": Record<string, never>;
			"/admin/merit-formulas": Record<string, never>;
			"/admin/payment-gateways": Record<string, never>;
			"/admin/profile-schema": Record<string, never>;
			"/admin/receipt-sequences": Record<string, never>;
			"/admin/report-builder": Record<string, never>;
			"/admin/universities": Record<string, never>;
			"/admin/users": Record<string, never>;
			"/api": Record<string, never>;
			"/api/admin": Record<string, never>;
			"/api/admin/check-form": Record<string, never>;
			"/api/deo": Record<string, never>;
			"/api/deo/get-student-profile": Record<string, never>;
			"/api/payment": Record<string, never>;
			"/api/payment/callback": Record<string, never>;
			"/api/payment/create-order": Record<string, never>;
			"/api/payment/verify": Record<string, never>;
			"/api/reports": Record<string, never>;
			"/api/reports/generate": Record<string, never>;
			"/api/reports/profile-data": Record<string, never>;
			"/api/upload": Record<string, never>;
			"/auth": Record<string, never>;
			"/auth/callback": Record<string, never>;
			"/college-auth": Record<string, never>;
			"/college-auth/applications": Record<string, never>;
			"/college-auth/circulars": Record<string, never>;
			"/college-auth/dashboard": Record<string, never>;
			"/college-auth/help": Record<string, never>;
			"/college-auth/reports": Record<string, never>;
			"/deo": { id?: string };
			"/deo/applications": Record<string, never>;
			"/deo/apply": Record<string, never>;
			"/deo/dashboard": Record<string, never>;
			"/deo/help": Record<string, never>;
			"/deo/saved-reports": { id?: string };
			"/deo/saved-reports/[id]": { id: string };
			"/deo/undertaking": { id?: string };
			"/deo/undertaking/[id]": { id: string };
			"/deo/verification": Record<string, never>;
			"/deo/verification/bulk": Record<string, never>;
			"/fee-collector": { id?: string };
			"/fee-collector/dashboard": Record<string, never>;
			"/fee-collector/export": Record<string, never>;
			"/fee-collector/help": Record<string, never>;
			"/fee-collector/payments": Record<string, never>;
			"/fee-collector/reports": Record<string, never>;
			"/fee-collector/saved-reports": { id?: string };
			"/fee-collector/saved-reports/[id]": { id: string };
			"/login": Record<string, never>;
			"/logout": Record<string, never>;
			"/print-profile": { applicationId?: string };
			"/print-profile/[applicationId]": { applicationId: string };
			"/receipts": Record<string, never>;
			"/receipts/print": Record<string, never>;
			"/register": Record<string, never>;
			"/student": Record<string, never>;
			"/student/apply": Record<string, never>;
			"/student/documents": Record<string, never>;
			"/student/help": Record<string, never>;
			"/student/payments": Record<string, never>;
			"/student/profile": Record<string, never>;
			"/student/support": Record<string, never>;
			"/university-auth": Record<string, never>;
			"/university-auth/applications": Record<string, never>;
			"/university-auth/circulars": Record<string, never>;
			"/university-auth/dashboard": Record<string, never>;
			"/university-auth/help": Record<string, never>;
			"/university-auth/reports": Record<string, never>
		};
		Pathname(): "/" | "/adm-officer" | "/adm-officer/" | "/adm-officer/applications" | "/adm-officer/applications/" | `/adm-officer/applications/${string}` & {} | `/adm-officer/applications/${string}/` & {} | "/adm-officer/circulars" | "/adm-officer/circulars/" | "/adm-officer/dashboard" | "/adm-officer/dashboard/" | "/adm-officer/dashboard/update-comment" | "/adm-officer/dashboard/update-comment/" | "/adm-officer/export" | "/adm-officer/export/" | "/adm-officer/help" | "/adm-officer/help/" | "/adm-officer/merit-list" | "/adm-officer/merit-list/" | "/adm-officer/reports" | "/adm-officer/reports/" | "/adm-officer/reports/conversion" | "/adm-officer/reports/conversion/" | "/adm-officer/saved-reports" | "/adm-officer/saved-reports/" | `/adm-officer/saved-reports/${string}` & {} | `/adm-officer/saved-reports/${string}/` & {} | "/adm-officer/verification" | "/adm-officer/verification/" | "/adm-officer/verification/bulk" | "/adm-officer/verification/bulk/" | "/admin" | "/admin/" | "/admin/academic-calendar" | "/admin/academic-calendar/" | "/admin/admission-sequences" | "/admin/admission-sequences/" | "/admin/branches" | "/admin/branches/" | "/admin/colleges" | "/admin/colleges/" | "/admin/config-guide" | "/admin/config-guide/" | "/admin/courses" | "/admin/courses/" | "/admin/dashboard" | "/admin/dashboard/" | "/admin/docs" | "/admin/docs/" | "/admin/fee-structures" | "/admin/fee-structures/" | "/admin/form-types" | "/admin/form-types/" | "/admin/forms" | "/admin/forms/" | "/admin/forms/new" | "/admin/forms/new/" | `/admin/forms/${string}` & {} | `/admin/forms/${string}/` & {} | `/admin/forms/${string}/edit` & {} | `/admin/forms/${string}/edit/` & {} | "/admin/help" | "/admin/help/" | "/admin/merit-calculation" | "/admin/merit-calculation/" | "/admin/merit-formulas" | "/admin/merit-formulas/" | "/admin/payment-gateways" | "/admin/payment-gateways/" | "/admin/profile-schema" | "/admin/profile-schema/" | "/admin/receipt-sequences" | "/admin/receipt-sequences/" | "/admin/report-builder" | "/admin/report-builder/" | "/admin/universities" | "/admin/universities/" | "/admin/users" | "/admin/users/" | "/api" | "/api/" | "/api/admin" | "/api/admin/" | "/api/admin/check-form" | "/api/admin/check-form/" | "/api/deo" | "/api/deo/" | "/api/deo/get-student-profile" | "/api/deo/get-student-profile/" | "/api/payment" | "/api/payment/" | "/api/payment/callback" | "/api/payment/callback/" | "/api/payment/create-order" | "/api/payment/create-order/" | "/api/payment/verify" | "/api/payment/verify/" | "/api/reports" | "/api/reports/" | "/api/reports/generate" | "/api/reports/generate/" | "/api/reports/profile-data" | "/api/reports/profile-data/" | "/api/upload" | "/api/upload/" | "/auth" | "/auth/" | "/auth/callback" | "/auth/callback/" | "/college-auth" | "/college-auth/" | "/college-auth/applications" | "/college-auth/applications/" | "/college-auth/circulars" | "/college-auth/circulars/" | "/college-auth/dashboard" | "/college-auth/dashboard/" | "/college-auth/help" | "/college-auth/help/" | "/college-auth/reports" | "/college-auth/reports/" | "/deo" | "/deo/" | "/deo/applications" | "/deo/applications/" | "/deo/apply" | "/deo/apply/" | "/deo/dashboard" | "/deo/dashboard/" | "/deo/help" | "/deo/help/" | "/deo/saved-reports" | "/deo/saved-reports/" | `/deo/saved-reports/${string}` & {} | `/deo/saved-reports/${string}/` & {} | "/deo/undertaking" | "/deo/undertaking/" | `/deo/undertaking/${string}` & {} | `/deo/undertaking/${string}/` & {} | "/deo/verification" | "/deo/verification/" | "/deo/verification/bulk" | "/deo/verification/bulk/" | "/fee-collector" | "/fee-collector/" | "/fee-collector/dashboard" | "/fee-collector/dashboard/" | "/fee-collector/export" | "/fee-collector/export/" | "/fee-collector/help" | "/fee-collector/help/" | "/fee-collector/payments" | "/fee-collector/payments/" | "/fee-collector/reports" | "/fee-collector/reports/" | "/fee-collector/saved-reports" | "/fee-collector/saved-reports/" | `/fee-collector/saved-reports/${string}` & {} | `/fee-collector/saved-reports/${string}/` & {} | "/login" | "/login/" | "/logout" | "/logout/" | "/print-profile" | "/print-profile/" | `/print-profile/${string}` & {} | `/print-profile/${string}/` & {} | "/receipts" | "/receipts/" | "/receipts/print" | "/receipts/print/" | "/register" | "/register/" | "/student" | "/student/" | "/student/apply" | "/student/apply/" | "/student/documents" | "/student/documents/" | "/student/help" | "/student/help/" | "/student/payments" | "/student/payments/" | "/student/profile" | "/student/profile/" | "/student/support" | "/student/support/" | "/university-auth" | "/university-auth/" | "/university-auth/applications" | "/university-auth/applications/" | "/university-auth/circulars" | "/university-auth/circulars/" | "/university-auth/dashboard" | "/university-auth/dashboard/" | "/university-auth/help" | "/university-auth/help/" | "/university-auth/reports" | "/university-auth/reports/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/fonts/AdwaitaSans-Regular.ttf" | "/fonts/Roboto-Bold.ttf" | "/fonts/Roboto-Regular.ttf" | "/robots.txt" | string & {};
	}
}