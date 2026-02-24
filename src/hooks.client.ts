import type { HandleClientError } from '@sveltejs/kit';
import { init, replayIntegration, handleErrorWithSentry } from '@sentry/sveltekit';

if (process.env.NODE_ENV !== 'development') {
	init({
		dsn: import.meta.env.VITE_SENTRY_DSN,

		tracesSampleRate: 1.0,

		// Enable logs to be sent to Sentry
		enableLogs: true,

		// This sets the sample rate to be 10%. You may want this to be 100% while
		// in development and sample at a lower rate in production
		replaysSessionSampleRate: 0.1,

		// If the entire session is not sampled, use the below sample rate to sample
		// sessions when an error occurs.
		replaysOnErrorSampleRate: 1.0,

		// If you don't want to use Session Replay, just remove the line below:
		integrations: [replayIntegration()],

		// Enable sending user PII (Personally Identifiable Information)
		// https://docs.sentry.io/platforms/javascript/guides/sveltekit/configuration/options/#sendDefaultPii
		sendDefaultPii: true,
	});
}

// If you have a custom error handler, pass it to `handleErrorWithSentry`
/* { error, event, status, message } */
export const handleError: HandleClientError = handleErrorWithSentry(({ error, event, status, message }) => {
	// Diagnostic: log the real error so the console has enough to diagnose server/GraphQL/auth issues
	console.error('[BitTasker handleError]', {
		status,
		message,
		error,
		errorMessage: error instanceof Error ? error.message : String(error),
		errorStack: error instanceof Error ? error.stack : undefined,
		event: event?.type,
	});
	return {
		message: 'Whoops! An error occurred',
	};
});