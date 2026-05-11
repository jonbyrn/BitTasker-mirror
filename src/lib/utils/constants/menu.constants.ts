/**
 * Menu Constants
 * Centralized menu configuration for TopBar component
 * All menu items with their icons, translations, and metadata
 */

// Import all icons used in the application
import IconAccountCircle from '~icons/mdi/account-circle';
import IconAccountGroup from '~icons/mdi/account-group';
import IconAccountHardHat from '~icons/mdi/account-hard-hat';
import IconAccount from '~icons/mdi/account';
import IconStar from '~icons/mdi/star';
import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
import IconBriefcaseSearch from '~icons/mdi/briefcase-search';
import IconChatOutline from '~icons/mdi/chat-outline';
import IconCog from '~icons/mdi/cog';
import IconCommentTextOutline from '~icons/mdi/comment-text-outline';
import IconCurrencyUsd from '~icons/mdi/currency-usd';
import IconDomain from '~icons/mdi/domain';
import IconEmailOutline from '~icons/mdi/email-outline';
import IconFileSign from '~icons/mdi/file-sign';
import IconChartBoxOutline from '~icons/mdi/chart-box-outline';
import IconFrequentlyAskedQuestions from '~icons/mdi/frequently-asked-questions';
import IconHelpCircleOutline from '~icons/mdi/help-circle-outline';
import IconInformationOutline from '~icons/mdi/information-outline';
import IconInvoiceTextSendOutline from '~icons/mdi/invoice-text-send-outline';
import IconLogout from '~icons/mdi/logout';
import IconMagnify from '~icons/mdi/magnify';
import IconNewspaper from '~icons/mdi/newspaper';
import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
import IconShieldAccount from '~icons/mdi/shield-account';
import IconShieldCheck from '~icons/mdi/shield-check';
import IconShieldCheckOutline from '~icons/mdi/shield-check-outline';
import IconWalletOutline from '~icons/mdi/wallet-outline';
import IconHome from '~icons/mdi/home';
import IconLogin from '~icons/mdi/login';
import IconAccountPlus from '~icons/mdi/account-plus';

type IconComponent = typeof IconAccountCircle;

export interface MenuItem {
	/** Translation key */
	label: string;
	/** Icon component from MDI */
	icon: IconComponent;
	/** URL path */
	href?: string;
	/** Submenu items */
	children?: MenuItem[];
	/** Additional click handler */
	action?: 'logout';
	/** Error styling */
	isError?: boolean;
	/** Dynamic href based on login state */
	getDynamicHref?: (isLoggedIn: boolean) => string;
}

export interface MenuSection {
	/** Section ID */
	id: string;
	/** Translation key for section title */
	label: string;
	/** Icon component for section */
	icon: IconComponent;
	/** Menu items in this section */
	items: MenuItem[];
}

/**
 * Logged-in user menu sections (desktop)
 */
export const LOGGED_IN_MENU_SECTIONS: MenuSection[] = [
	{
		id: 'my-account',
		label: 'navbar.my_account',
		icon: IconAccountCircle,
		items: [
			{
				label: 'navbar.profile',
				icon: IconAccount,
				href: '/dashboard/profile'
			},
			{
				label: 'navbar.wallet',
				icon: IconWalletOutline,
				href: '/dashboard/wallet'
			},
			{
				label: 'navbar.messages',
				icon: IconChatOutline,
				href: '/dashboard/messages'
			},
			{
				label: 'navbar.settings',
				icon: IconCog,
				href: '/dashboard/settings'
			},
			{
				label: 'navbar.logout',
				icon: IconLogout,
				action: 'logout',
				isError: true
			}
		]
	},
	{
		id: 'hiring',
		label: 'navbar.hiring',
		icon: IconBriefcaseOutline,
		items: [
			{
				label: 'navbar.hiring',
				icon: IconChartBoxOutline,
				href: '/dashboard'
			},
			{
				label: 'navbar.create_task',
				icon: IconPlusCircleOutline,
				href: '/dashboard/create-task'
			},
			{
				label: 'navbar.find_services',
				icon: IconBriefcaseSearch,
				href: '/services'
			},
			{
				label: 'navbar.service_requests',
				icon: IconCommentTextOutline,
				href: '/dashboard?tab=service-requests'
			},
			{
				label: 'navbar.contracts',
				icon: IconFileSign,
				href: '/dashboard?tab=contracts'
			}
		]
	},
	{
		id: 'earning',
		label: 'navbar.earning',
		icon: IconInvoiceTextSendOutline,
		items: [
			{
				label: 'navbar.earning',
				icon: IconInvoiceTextSendOutline,
				href: '/earning'
			},
			{
				label: 'navbar.find_tasks',
				icon: IconMagnify,
				getDynamicHref: () => '/tasks'
			},
			{
				label: 'navbar.bids_sent',
				icon: IconInvoiceTextSendOutline,
				href: '/earning?tab=bids'
			},
			{
				label: 'navbar.requests',
				icon: IconCommentTextOutline,
				href: '/earning?tab=requests'
			},
			{
				label: 'navbar.contracts',
				icon: IconFileSign,
				href: '/earning?tab=contracts'
			},
			{
				label: 'navbar.my_services',
				icon: IconBriefcaseSearch,
				href: '/earning?tab=my-services'
			},
			{
				label: 'navbar.saved_searches',
				icon: IconMagnify,
				href: '/earning?tab=saved-searches'
			}
		]
	},
	{
		id: 'support-help',
		label: 'navbar.support_help',
		icon: IconHelpCircleOutline,
		items: [
			{
				label: 'navbar.how_it_works',
				icon: IconHelpCircleOutline,
				href: '/how-it-works'
			},
			{
				label: 'navbar.faq',
				icon: IconFrequentlyAskedQuestions,
				href: '/faq'
			},
			{
				label: 'navbar.contact_support',
				icon: IconEmailOutline,
				href: '/contact'
			},
			{
				label: 'navbar.feedback',
				icon: IconCommentTextOutline,
				href: '/feedback'
			},
			{
				label: 'footer.security',
				icon: IconShieldCheck,
				href: '/security'
			},
			{
				label: 'navbar.about_us',
				icon: IconInformationOutline,
				href: '/about'
			},
			{
				label: 'navbar.terms_of_service',
				icon: IconFileSign,
				href: '/terms'
			},
			{
				label: 'navbar.privacy_policy',
				icon: IconShieldAccount,
				href: '/privacy'
			}
		]
	}
];

/**
 * Logged-out user menu sections (desktop)
 */
export const LOGGED_OUT_MENU_SECTIONS = [
	{
		id: 'how-it-works',
		label: 'footer.how_it_works',
		icon: IconHelpCircleOutline,
		items: []
	},
	{
		id: 'for-taskers',
		label: 'footer.for_taskers',
		icon: IconBriefcaseOutline,
		items: [
			{
				label: 'footer.post_task',
				icon: IconPlusCircleOutline,
				href: '/dashboard/create-task'
			},
			{
				label: 'footer.tasker_fees',
				icon: IconCurrencyUsd,
				href: '/tasker-fees'
			},
			{
				label: 'footer.escrow',
				icon: IconShieldCheckOutline,
				href: '/secure-payments'
			},
			{
				label: 'footer.faq',
				icon: IconFrequentlyAskedQuestions,
				href: '/faq'
			}
		]
	},
	{
		id: 'for-taskees',
		label: 'footer.for_taskees',
		icon: IconAccountHardHat,
		items: [
			{
				label: 'footer.start_earning',
				icon: IconMagnify,
				getDynamicHref: () => '/tasks'
			},
			{
				label: 'footer.community_guidelines',
				icon: IconAccountGroup,
				href: '/community-guidelines'
			},
			{
				label: 'footer.taskee_fees',
				icon: IconCurrencyUsd,
				href: '/taskee-fees'
			},
			{
				label: 'footer.tasker_principles',
				icon: IconInvoiceTextSendOutline,
				href: '/tasker-principles'
			},
			{
				label: 'footer.tasker_faq',
				icon: IconFrequentlyAskedQuestions,
				href: '/faq'
			}
		]
	},
	{
		id: 'company',
		label: 'footer.company',
		icon: IconDomain,
		items: [
			{
				label: 'footer.about_us',
				icon: IconInformationOutline,
				href: '/about'
			},
			{
				label: 'footer.security',
				icon: IconShieldCheck,
				href: '/security'
			},
			{
				label: 'footer.careers',
				icon: IconBriefcaseSearch,
				href: '/careers'
			},
			{
				label: 'footer.press',
				icon: IconNewspaper,
				href: '/press'
			},
			{
				label: 'footer.terms',
				icon: IconFileSign,
				href: '/terms'
			},
			{
				label: 'footer.privacy',
				icon: IconShieldAccount,
				href: '/privacy'
			},
			{
				label: 'footer.contact',
				icon: IconEmailOutline,
				href: '/contact'
			}
		]
	}
];

/**
 * Avatar dropdown menu items
 */
export const AVATAR_MENU_ITEMS: MenuItem[] = [
	{
		label: 'navbar.hiring',
		icon: IconChartBoxOutline,
		href: '/dashboard'
	},
	{
		label: 'navbar.earning',
		icon: IconInvoiceTextSendOutline,
		href: '/earning'
	},
	{
		label: 'navbar.messages',
		icon: IconChatOutline,
		href: '/dashboard/messages'
	},
	{
		label: 'navbar.wallet',
		icon: IconWalletOutline,
		href: '/dashboard/wallet'
	},
	{
		label: 'navbar.profile',
		icon: IconAccount,
		href: '/dashboard/profile'
	},
	{
		label: 'navbar.reviews',
		icon: IconStar,
		href: '/dashboard/reviews'
	},
	{
		label: 'navbar.settings',
		icon: IconCog,
		href: '/dashboard/settings'
	},
	{
		label: 'navbar.logout',
		icon: IconLogout,
		action: 'logout',
		isError: true
	}
];
/**
 * Mobile drawer menu items (logged in)
 */
export const MOBILE_DRAWER_LOGGED_IN: MenuItem[] = [
	{
		label: 'navbar.profile',
		icon: IconAccount,
		href: '/dashboard/profile'
	},
	{
		label: 'navbar.reviews',
		icon: IconStar,
		href: '/dashboard/reviews'
	},
	{
		label: 'navbar.settings',
		icon: IconCog,
		href: '/dashboard/settings'
	},
	{
		label: 'navbar.home',
		icon: IconHome,
		getDynamicHref: () => '/tasks'
	},
	{
		label: 'navbar.how_it_works',
		icon: IconHelpCircleOutline,
		href: '/how-it-works'
	},
	{
		label: 'navbar.terms_and_conditions',
		icon: IconFileSign,
		href: '/terms'
	},
	{
		label: 'navbar.logout',
		icon: IconLogout,
		action: 'logout'
	}
];

/**
 * Mobile drawer auth buttons (logged out)
 */
export const MOBILE_AUTH_BUTTONS: { login: MenuItem; signup: MenuItem } = {
	login: {
		label: 'navbar.login',
		icon: IconLogin,
		href: '/auth/login'
	},
	signup: {
		label: 'navbar.signup',
		icon: IconAccountPlus,
		href: '/auth/signup'
	}
};
