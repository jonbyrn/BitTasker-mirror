
import root from '../root.js';
import { set_building, set_prerendering } from '__sveltekit/environment';
import { set_assets } from '$app/paths/internal/server';
import { set_manifest, set_read_implementation } from '__sveltekit/server';
import { set_private_env, set_public_env } from '../../../node_modules/.pnpm/@sveltejs+kit@2.59.0_@opent_fdfd87dabe56e270183c55c9917e7a6a/node_modules/@sveltejs/kit/src/runtime/shared-server.js';

export const options = {
	app_template_contains_nonce: false,
	async: false,
	csp: {"mode":"auto","directives":{"upgrade-insecure-requests":false,"block-all-mixed-content":false},"reportOnly":{"upgrade-insecure-requests":false,"block-all-mixed-content":false}},
	csrf_check_origin: true,
	csrf_trusted_origins: [],
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hash_routing: false,
	hooks: null, // added lazily, via `get_hooks`
	preload_strategy: "modulepreload",
	root,
	service_worker: false,
	service_worker_options: undefined,
	server_error_boundaries: false,
	templates: {
		app: ({ head, body, assets, nonce, env }) => "<!doctype html>\r\n<html lang=\"en\">\r\n\t<head>\r\n\t\t<meta charset=\"utf-8\" />\r\n\t\t<meta\r\n\t\t\tname=\"viewport\"\r\n\t\t\tcontent=\"width=device-width, initial-scale=1.0, minimum-scale=1.0, interactive-widget=resizes-content\"\r\n\t\t/>\r\n\t\t<!-- Removed theme-color to use default system navigation bar color -->\r\n\t\t<meta name=\"mobile-web-app-capable\" content=\"yes\" />\r\n\t\t<meta name=\"apple-mobile-web-app-capable\" content=\"yes\" />\r\n\t\t<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\" />\r\n\t\t<meta name=\"apple-mobile-web-app-title\" content=\"BitTasker\" />\r\n\t\t\r\n\t\t<!-- Font Optimization: Preconnect, Preload, and optimized loading -->\r\n\t\t<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" crossorigin>\r\n\t\t<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\r\n\t\t<link rel=\"preload\" as=\"style\" href=\"https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap\" />\r\n\t\t<link rel=\"preload\" as=\"style\" href=\"https://fonts.googleapis.com/css2?family=Droid+Serif:wght@400;700&display=swap\" />\r\n\t\t<link href=\"https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap\" rel=\"stylesheet\" media=\"print\" onload=\"this.media='all'\" />\r\n\t\t<link href=\"https://fonts.googleapis.com/css2?family=Droid+Serif:wght@400;700&display=swap\" rel=\"stylesheet\" media=\"print\" onload=\"this.media='all'\" />\r\n\t\t\r\n\t\t" + head + "\r\n\t</head>\r\n\t<body data-sveltekit-preload-data=\"hover\">\r\n\t\t<div style=\"display: contents\">" + body + "</div>\r\n\t</body>\r\n</html>\r\n",
		error: ({ status, message }) => "<!DOCTYPE html>\r\n<html lang=\"en\" data-theme=\"dark\">\r\n<head>\r\n\t<meta charset=\"utf-8\" />\r\n\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\r\n\t<title>" + status + " - BitTasker</title>\r\n\t<meta name=\"description\" content=\"An error occurred on BitTasker. We're working to fix this issue.\" />\r\n\t<meta name=\"robots\" content=\"noindex, nofollow\" />\r\n\t\r\n\t<!-- Favicon -->\r\n\t<link rel=\"icon\" type=\"image/png\" href=\"/favicon-96x96.png\" sizes=\"96x96\" />\r\n\t<link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\" />\r\n\t<link rel=\"shortcut icon\" href=\"/favicon.ico\" />\r\n\t<link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/apple-touch-icon.png\" />\r\n\t\r\n\t<!-- Tailwind CSS -->\r\n\t<link href=\"/_app/immutable/assets/app.css\" rel=\"stylesheet\" />\r\n\t\r\n\t<style>\r\n\t\tbody {\r\n\t\t\tfont-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\r\n\t\t\tbackground-color: #2d2d2d;\r\n\t\t\tcolor: #ffffff;\r\n\t\t}\r\n\t\t.error-container {\r\n\t\t\tmin-height: 100vh;\r\n\t\t\tdisplay: flex;\r\n\t\t\talign-items: center;\r\n\t\t\tjustify-content: center;\r\n\t\t\tpadding: 1rem;\r\n\t\t}\r\n\t\t.error-card {\r\n\t\t\tbackground-color: #363636;\r\n\t\t\tborder-radius: 1rem;\r\n\t\t\tpadding: 2rem;\r\n\t\t\tbox-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);\r\n\t\t\tmax-width: 32rem;\r\n\t\t\twidth: 100%;\r\n\t\t\ttext-align: center;\r\n\t\t}\r\n\t\t.error-icon {\r\n\t\t\tfont-size: 4rem;\r\n\t\t\tmargin-bottom: 1.5rem;\r\n\t\t}\r\n\t\t.error-status {\r\n\t\t\tbackground-color: #f7931a;\r\n\t\t\tcolor: #000000;\r\n\t\t\tpadding: 0.5rem 1rem;\r\n\t\t\tborder-radius: 0.5rem;\r\n\t\t\tfont-weight: 600;\r\n\t\t\tdisplay: inline-block;\r\n\t\t\tmargin-bottom: 1rem;\r\n\t\t}\r\n\t\t.error-title {\r\n\t\t\tfont-size: 1.875rem;\r\n\t\t\tfont-weight: 700;\r\n\t\t\tmargin-bottom: 1rem;\r\n\t\t\tcolor: #ffffff;\r\n\t\t}\r\n\t\t.error-description {\r\n\t\t\tcolor: #a3a3a3;\r\n\t\t\tmargin-bottom: 2rem;\r\n\t\t\tline-height: 1.6;\r\n\t\t}\r\n\t\t.error-actions {\r\n\t\t\tdisplay: flex;\r\n\t\t\tflex-direction: column;\r\n\t\t\tgap: 1rem;\r\n\t\t\tjustify-content: center;\r\n\t\t}\r\n\t\t.btn {\r\n\t\t\tdisplay: inline-flex;\r\n\t\t\talign-items: center;\r\n\t\t\tjustify-content: center;\r\n\t\t\tpadding: 0.75rem 1.5rem;\r\n\t\t\tborder-radius: 0.5rem;\r\n\t\t\tfont-weight: 600;\r\n\t\t\ttext-decoration: none;\r\n\t\t\ttransition: all 0.2s;\r\n\t\t}\r\n\t\t.btn-primary {\r\n\t\t\tbackground-color: #f7931a;\r\n\t\t\tcolor: #000000;\r\n\t\t}\r\n\t\t.btn-primary:hover {\r\n\t\t\tbackground-color: #e8830a;\r\n\t\t}\r\n\t\t.btn-outline {\r\n\t\t\tbackground-color: transparent;\r\n\t\t\tcolor: #ffffff;\r\n\t\t\tborder: 1px solid #525252;\r\n\t\t}\r\n\t\t.btn-outline:hover {\r\n\t\t\tbackground-color: #525252;\r\n\t\t}\r\n\t\t.help-section {\r\n\t\t\tmargin-top: 2rem;\r\n\t\t\tpadding-top: 2rem;\r\n\t\t\tborder-top: 1px solid #525252;\r\n\t\t}\r\n\t\t.help-links {\r\n\t\t\tdisplay: flex;\r\n\t\t\tflex-direction: column;\r\n\t\t\tgap: 0.5rem;\r\n\t\t\tjustify-content: center;\r\n\t\t\tfont-size: 0.875rem;\r\n\t\t}\r\n\t\t.help-links a {\r\n\t\t\tcolor: #f7931a;\r\n\t\t\ttext-decoration: none;\r\n\t\t}\r\n\t\t.help-links a:hover {\r\n\t\t\ttext-decoration: underline;\r\n\t\t}\r\n\t\t.logo {\r\n\t\t\tmargin-top: 2rem;\r\n\t\t\topacity: 0.6;\r\n\t\t}\r\n\t\t@media (min-width: 640px) {\r\n\t\t\t.error-actions {\r\n\t\t\t\tflex-direction: row;\r\n\t\t\t}\r\n\t\t\t.help-links {\r\n\t\t\t\tflex-direction: row;\r\n\t\t\t}\r\n\t\t}\r\n\t</style>\r\n</head>\r\n<body>\r\n\t<div class=\"error-container\">\r\n\t\t<div class=\"error-card\">\r\n\t\t\t<!-- Error Icon -->\r\n\t\t\t<div class=\"error-icon\">\r\n\t\t\t\t%if sveltekit.status == 404%\r\n\t\t\t\t\t🔍\r\n\t\t\t\t%elseif sveltekit.status >= 500%\r\n\t\t\t\t\t⚠️\r\n\t\t\t\t%else%\r\n\t\t\t\t\t💥\r\n\t\t\t\t%endif%\r\n\t\t\t</div>\r\n\r\n\t\t\t<!-- Error Status -->\r\n\t\t\t<div class=\"error-status\">\r\n\t\t\t\t" + status + "\r\n\t\t\t</div>\r\n\r\n\t\t\t<!-- Error Title -->\r\n\t\t\t<h1 class=\"error-title\">\r\n\t\t\t\t%if sveltekit.status == 404%\r\n\t\t\t\t\tPage Not Found\r\n\t\t\t\t%elseif sveltekit.status >= 500%\r\n\t\t\t\t\tServer Error\r\n\t\t\t\t%else%\r\n\t\t\t\t\tSomething went wrong\r\n\t\t\t\t%endif%\r\n\t\t\t</h1>\r\n\r\n\t\t\t<!-- Error Description -->\r\n\t\t\t<p class=\"error-description\">\r\n\t\t\t\t%if sveltekit.status == 404%\r\n\t\t\t\t\tThe page you're looking for doesn't exist or has been moved. Let's get you back on track!\r\n\t\t\t\t%elseif sveltekit.status >= 500%\r\n\t\t\t\t\tSomething went wrong on our end. We're working to fix this issue. Please try again later.\r\n\t\t\t\t%else%\r\n\t\t\t\t\tAn unexpected error occurred. Don't worry, our team has been notified and we're working on it.\r\n\t\t\t\t%endif%\r\n\t\t\t</p>\r\n\r\n\t\t\t<!-- Action Buttons -->\r\n\t\t\t<div class=\"error-actions\">\r\n\t\t\t\t<a href=\"/\" class=\"btn btn-primary\">\r\n\t\t\t\t\t🏠 Go Home\r\n\t\t\t\t</a>\r\n\t\t\t\t<button onclick=\"history.back()\" class=\"btn btn-outline\">\r\n\t\t\t\t\t← Go Back\r\n\t\t\t\t</button>\r\n\t\t\t</div>\r\n\r\n\t\t\t<!-- Help Section -->\r\n\t\t\t<div class=\"help-section\">\r\n\t\t\t\t<p style=\"color: #a3a3a3; margin-bottom: 1rem; font-size: 0.875rem;\">\r\n\t\t\t\t\tNeed help?\r\n\t\t\t\t</p>\r\n\t\t\t\t<div class=\"help-links\">\r\n\t\t\t\t\t<a href=\"/contact\">Contact Support</a>\r\n\t\t\t\t\t<a href=\"/help\">Help Center</a>\r\n\t\t\t\t\t<a href=\"/status\">Status Page</a>\r\n\t\t\t\t</div>\r\n\t\t\t</div>\r\n\r\n\t\t\t<!-- BitTasker Logo -->\r\n\t\t\t<div class=\"logo\">\r\n\t\t\t\t<svg width=\"120\" height=\"32\" viewBox=\"0 0 120 32\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\r\n\t\t\t\t\t<!-- BitTasker Logo SVG content would go here -->\r\n\t\t\t\t\t<text x=\"0\" y=\"20\" fill=\"currentColor\" font-family=\"system-ui\" font-size=\"16\" font-weight=\"700\">BitTasker</text>\r\n\t\t\t\t</svg>\r\n\t\t\t</div>\r\n\t\t</div>\r\n\t</div>\r\n</body>\r\n</html>\r\n"
	},
	version_hash: "1f2jrct"
};

export async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let handleValidationError;
	let init;
	

	let reroute;
	let transport;
	

	return {
		handle,
		handleFetch,
		handleError,
		handleValidationError,
		init,
		reroute,
		transport
	};
}

export { set_assets, set_building, set_manifest, set_prerendering, set_private_env, set_public_env, set_read_implementation };
