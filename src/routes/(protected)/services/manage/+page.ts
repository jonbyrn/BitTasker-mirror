import { redirect } from '@sveltejs/kit';
import { createServicesWorkspaceRedirectUrl } from '$lib/utils/service-quote/services-workspace-route';

export function load({ url }: { url: URL }) {
	throw redirect(302, createServicesWorkspaceRedirectUrl(url).toString());
}
