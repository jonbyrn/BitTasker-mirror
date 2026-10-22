/**
 * Minimal CSP for the signup Turnstile widget.
 * connect-src keeps https and wss so existing APIs and relays still work,
 * and adds data: plus the Turnstile challenge host that the console was blocking.
 */
export const CONTENT_SECURITY_POLICY = [
	"connect-src 'self' data: blob: https: wss: https://challenges.cloudflare.com",
	"script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https: https://challenges.cloudflare.com",
	"frame-src 'self' blob: https: https://challenges.cloudflare.com",
	"child-src 'self' blob: https: https://challenges.cloudflare.com"
].join('; ');
