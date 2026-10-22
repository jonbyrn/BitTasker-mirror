/**
 * One nav table for the desktop header, the mobile header row, and the sheet.
 * Header primary links are the same on every page.
 */

export type SiteNavLink = {
	id: string;
	/** i18n key */
	label: string;
	href: '/tasks' | '/browse/services' | '/browse/goods' | '/browse/staff';
	testId: string;
};

export const tasksHref = '/tasks' as const;

export const loggedInLogoHref = tasksHref;

/** The four destinations in the header center. Order is the header order. */
export const headerPrimaryLinks: readonly SiteNavLink[] = [
	{
		id: 'browse-tasks',
		label: 'navbar.browse_tasks',
		href: tasksHref,
		testId: 'nav-browse-tasks'
	},
	{
		id: 'browse-services',
		label: 'navbar.browse_services',
		href: '/browse/services',
		testId: 'nav-browse-services'
	},
	{
		id: 'buy-sell',
		label: 'navbar.buy_sell',
		href: '/browse/goods',
		testId: 'nav-buy-sell'
	},
	{
		id: 'temporary-staff',
		label: 'navbar.browse_staff',
		href: '/browse/staff',
		testId: 'nav-browse-staff'
	}
];

export function navItemActive(pathname: string, href: string): boolean {
	if (href === tasksHref) {
		return (
			pathname === tasksHref ||
			pathname.startsWith(`${tasksHref}/`) ||
			pathname === '/browse/tasks' ||
			pathname.startsWith('/browse/tasks/')
		);
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}
